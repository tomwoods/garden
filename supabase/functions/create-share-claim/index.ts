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

function generateShortCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
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

    // Fetch signing public key
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
    const { sharedPlantId, encryptedPlantKey, claimMode, timestamp, signature } = body;

    if (!sharedPlantId || !encryptedPlantKey || !claimMode || !timestamp || !signature) {
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

    // Verify signature
    const message = `create-share-claim:${userId}:${sharedPlantId}:${timestamp}:${claimMode}`;
    const valid = await verifyRsaPssSignature(message, signature, userRow.signature_public_key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify the caller is authorized_users[0] (the owner) of this shared plant
    const { data: sharedPlant, error: spErr } = await supabase
      .from("shared_plants")
      .select("authorized_users")
      .eq("id", sharedPlantId)
      .maybeSingle();

    if (spErr || !sharedPlant) {
      return new Response(JSON.stringify({ error: "Shared plant not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authorizedUsers: string[] = sharedPlant.authorized_users || [];
    if (authorizedUsers[0] !== userId) {
      return new Response(JSON.stringify({ error: "Only the owner may create share claims" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Generate a unique short code (retry once on collision)
    let shortCode = generateShortCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertErr } = await supabase.from("share_claims").insert({
      short_code: shortCode,
      encrypted_plant_key: encryptedPlantKey,
      shared_plant_id: sharedPlantId,
      claim_mode: claimMode,
      expires_at: expiresAt,
    });

    if (insertErr) {
      // Likely a unique constraint collision — retry with a new code
      shortCode = generateShortCode();
      const { error: retryErr } = await supabase.from("share_claims").insert({
        short_code: shortCode,
        encrypted_plant_key: encryptedPlantKey,
        shared_plant_id: sharedPlantId,
        claim_mode: claimMode,
        expires_at: expiresAt,
      });
      if (retryErr) throw retryErr;
    }

    return new Response(JSON.stringify({ success: true, shortCode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("create-share-claim error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
