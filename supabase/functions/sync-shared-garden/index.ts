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
      "spki", bytes.buffer, { name: "RSA-PSS", hash: "SHA-256" }, false, ["verify"]
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
      .from("users").select("signature_public_key").eq("id", userId).maybeSingle();
    if (userErr || !userRow) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { sharedGardenId, action, timestamp, signature, encryptedData, clientLastModified, isCompaction } = body;

    if (!sharedGardenId || !action || !timestamp || !signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Request timestamp expired" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const message = `sync-shared-garden:${userId}:${sharedGardenId}:${action}:${timestamp}`;
    const valid = await verifyRsaPssSignature(message, signature, userRow.signature_public_key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: garden, error: gardenErr } = await supabase
      .from("shared_gardens")
      .select("id, encrypted_data, garden_public_key, authorized_users, last_modified, snapshot_at")
      .eq("id", sharedGardenId)
      .maybeSingle();

    if (gardenErr || !garden) {
      return new Response(JSON.stringify({ error: "Shared garden not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authorizedUsers: string[] = garden.authorized_users || [];
    if (!authorizedUsers.includes(userId)) {
      return new Response(JSON.stringify({ error: "Access denied — you are not a member of this garden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "read") {
      return new Response(JSON.stringify({
        success: true,
        encryptedData: garden.encrypted_data,
        gardenPublicKey: garden.garden_public_key,
        lastModified: garden.last_modified,
        snapshotAt: garden.snapshot_at,
        authorizedUsers: garden.authorized_users,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "write") {
      if (!encryptedData) {
        return new Response(JSON.stringify({ error: "Missing encryptedData for write" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Optimistic concurrency check
      if (clientLastModified && garden.last_modified) {
        const serverTs = new Date(garden.last_modified).getTime();
        const clientTs = new Date(clientLastModified).getTime();
        if (serverTs > clientTs) {
          return new Response(JSON.stringify({
            error: "conflict",
            lastModified: garden.last_modified,
            encryptedData: garden.encrypted_data,
          }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        encrypted_data: encryptedData,
        last_modified: now,
        user_last_modified: userId,
      };

      if (isCompaction === true) {
        updatePayload.snapshot_at = now;
      }

      const { error: updateErr } = await supabase
        .from("shared_gardens")
        .update(updatePayload)
        .eq("id", sharedGardenId);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true, lastModified: now }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "remove-member") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "Missing targetUserId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const updated = authorizedUsers.filter((uid: string) => uid !== targetUserId);
      const { error: updateErr } = await supabase
        .from("shared_gardens")
        .update({ authorized_users: updated })
        .eq("id", sharedGardenId);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("sync-shared-garden error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
