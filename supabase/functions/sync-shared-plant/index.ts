import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyRsaPssSignature(
  message: string,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    const binaryString = atob(publicKeyBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const publicKey = await crypto.subtle.importKey(
      "spki",
      bytes.buffer,
      { name: "RSA-PSS", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBin = atob(signatureBase64);
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);

    const data = new TextEncoder().encode(message);
    return await crypto.subtle.verify({ name: "RSA-PSS", saltLength: 32 }, publicKey, sigBytes, data);
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") || "";
    const userId = authHeader.replace("Bearer ", "").trim();
    if (!userId || userId.length < 10) {
      return new Response(JSON.stringify({ error: "Missing user identity" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("signature_public_key")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !userRow) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { sharedPlantId, action, timestamp, signature, encryptedData, clientLastModified } = body;

    if (!sharedPlantId || !action || !timestamp || !signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Request timestamp expired" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const message = `sync-shared-plant:${userId}:${sharedPlantId}:${action}:${timestamp}`;
    const valid = await verifyRsaPssSignature(message, signature, userRow.signature_public_key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch the shared plant record
    const { data: sharedPlant, error: spErr } = await supabase
      .from("shared_plants")
      .select("id, encrypted_data, plant_public_key, authorized_users, viewing_users, last_modified, snapshot_at")
      .eq("id", sharedPlantId)
      .maybeSingle();

    if (spErr || !sharedPlant) {
      return new Response(JSON.stringify({ error: "Shared plant not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authorizedUsers: string[] = sharedPlant.authorized_users || [];
    const viewingUsers: string[] = sharedPlant.viewing_users || [];
    const isAuthorized = authorizedUsers.includes(userId);
    const isViewer = viewingUsers.includes(userId);

    if (!isAuthorized && !isViewer) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "read") {
      return new Response(JSON.stringify({
        success: true,
        encryptedData: sharedPlant.encrypted_data,
        plantPublicKey: sharedPlant.plant_public_key,
        lastModified: sharedPlant.last_modified,
        snapshotAt: sharedPlant.snapshot_at,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "write") {
      // Only authorized users (co-tenders and owner) may write
      if (!isAuthorized) {
        return new Response(JSON.stringify({ error: "Viewers cannot write" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!encryptedData) {
        return new Response(JSON.stringify({ error: "Missing encryptedData for write" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Optimistic concurrency check: if server was modified after the client's snapshot, return 409
      if (clientLastModified && sharedPlant.last_modified) {
        const serverTs = new Date(sharedPlant.last_modified).getTime();
        const clientTs = new Date(clientLastModified).getTime();
        if (serverTs > clientTs) {
          return new Response(JSON.stringify({
            error: "conflict",
            lastModified: sharedPlant.last_modified,
            encryptedData: sharedPlant.encrypted_data,
          }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        encrypted_data: encryptedData,
        last_modified: now,
        user_last_modified: userId,
      };

      // If this is a compaction (only owner at index 0 may compact)
      if (body.isCompaction === true && authorizedUsers[0] === userId) {
        updatePayload.snapshot_at = now;
      }

      const { error: updateErr } = await supabase
        .from("shared_plants")
        .update(updatePayload)
        .eq("id", sharedPlantId);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true, lastModified: now }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("sync-shared-plant error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
