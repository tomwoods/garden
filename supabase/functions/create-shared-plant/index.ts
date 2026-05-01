import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Verify an RSA-PSS signature using the Web Crypto API available in Deno
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

    // Fetch the user's signing public key to verify the request signature
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
    const { encryptedData, plantPublicKey, shareMode, timestamp, signature, sharedPlantId } = body;

    if (!encryptedData || !plantPublicKey || !shareMode || !timestamp || !signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify timestamp freshness (±10 minutes)
    const now = Date.now();
    if (Math.abs(now - timestamp) > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Request timestamp expired" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify signature over: userId:timestamp:shareMode
    const message = `create-shared-plant:${userId}:${timestamp}:${shareMode}`;
    const valid = await verifyRsaPssSignature(message, signature, userRow.signature_public_key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const snapshotAt = new Date().toISOString();

    if (sharedPlantId) {
      // Update existing shared plant — verify the requester is authorized_users[0] (owner)
      const { data: existing, error: fetchErr } = await supabase
        .from("shared_plants")
        .select("authorized_users")
        .eq("id", sharedPlantId)
        .maybeSingle();

      if (fetchErr || !existing) {
        return new Response(JSON.stringify({ error: "Shared plant not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const authorizedUsers: string[] = existing.authorized_users || [];
      if (authorizedUsers[0] !== userId) {
        return new Response(JSON.stringify({ error: "Only the owner may update the shared plant" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { error: updateErr } = await supabase
        .from("shared_plants")
        .update({
          encrypted_data: encryptedData,
          plant_public_key: plantPublicKey,
          share_mode: shareMode,
          snapshot_at: snapshotAt,
          last_modified: snapshotAt,
          user_last_modified: userId,
        })
        .eq("id", sharedPlantId);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true, sharedPlantId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      // Create new shared plant record
      const { data: inserted, error: insertErr } = await supabase
        .from("shared_plants")
        .insert({
          encrypted_data: encryptedData,
          plant_public_key: plantPublicKey,
          share_mode: shareMode,
          authorized_users: [userId],
          viewing_users: [],
          snapshot_at: snapshotAt,
          last_modified: snapshotAt,
          user_last_modified: userId,
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      return new Response(JSON.stringify({ success: true, sharedPlantId: inserted.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (err) {
    console.error("create-shared-plant error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
