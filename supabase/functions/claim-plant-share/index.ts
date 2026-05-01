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

    // Gardener B must identify themselves
    const authHeader = req.headers.get("Authorization") || "";
    const userId = authHeader.replace("Bearer ", "").trim();
    if (!userId || userId.length < 10) {
      return new Response(JSON.stringify({ error: "Missing user identity" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch Gardener B's signing public key
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("signature_public_key")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !userRow) {
      return new Response(JSON.stringify({ error: "User not found — please register first" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { shortCode, timestamp, signature } = body;

    if (!shortCode || !timestamp || !signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify timestamp freshness
    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Request timestamp expired" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify Gardener B's identity via signature
    const message = `claim-plant-share:${userId}:${shortCode}:${timestamp}`;
    const valid = await verifyRsaPssSignature(message, signature, userRow.signature_public_key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Look up the claim
    const { data: claim, error: claimErr } = await supabase
      .from("share_claims")
      .select("id, encrypted_plant_key, shared_plant_id, claim_mode, expires_at")
      .eq("short_code", shortCode)
      .maybeSingle();

    if (claimErr || !claim) {
      return new Response(JSON.stringify({ error: "Claim not found or already used" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check expiry
    if (new Date(claim.expires_at) < new Date()) {
      await supabase.from("share_claims").delete().eq("id", claim.id);
      return new Response(JSON.stringify({ error: "This share link has expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check Gardener B isn't already in the authorized list
    const { data: sharedPlant, error: spErr } = await supabase
      .from("shared_plants")
      .select("authorized_users, viewing_users")
      .eq("id", claim.shared_plant_id)
      .maybeSingle();

    if (spErr || !sharedPlant) {
      return new Response(JSON.stringify({ error: "Shared plant record not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authorizedUsers: string[] = sharedPlant.authorized_users || [];
    const viewingUsers: string[] = sharedPlant.viewing_users || [];

    if (authorizedUsers.includes(userId) || viewingUsers.includes(userId)) {
      // Already added — just delete the claim and return the data
      await supabase.from("share_claims").delete().eq("id", claim.id);
      return new Response(JSON.stringify({
        success: true,
        encryptedPlantKey: claim.encrypted_plant_key,
        sharedPlantId: claim.shared_plant_id,
        mode: claim.claim_mode,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Add Gardener B to the appropriate array
    if (claim.claim_mode === "co-edit") {
      authorizedUsers.push(userId);
      await supabase
        .from("shared_plants")
        .update({ authorized_users: authorizedUsers })
        .eq("id", claim.shared_plant_id);
    } else {
      viewingUsers.push(userId);
      await supabase
        .from("shared_plants")
        .update({ viewing_users: viewingUsers })
        .eq("id", claim.shared_plant_id);
    }

    // Delete the claim — one-time use
    await supabase.from("share_claims").delete().eq("id", claim.id);

    return new Response(JSON.stringify({
      success: true,
      encryptedPlantKey: claim.encrypted_plant_key,
      sharedPlantId: claim.shared_plant_id,
      mode: claim.claim_mode,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("claim-plant-share error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
