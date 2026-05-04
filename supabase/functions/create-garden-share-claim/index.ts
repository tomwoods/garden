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

function generateShortCode(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let code = '';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (const byte of array) code += chars[byte % chars.length];
  return code;
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
    const { sharedGardenId, encryptedGardenKey, inviteeDisplayName, timestamp, signature } = body;

    if (!sharedGardenId || !encryptedGardenKey || !inviteeDisplayName || !timestamp || !signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Request timestamp expired" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const message = `create-garden-share-claim:${userId}:${sharedGardenId}:${timestamp}`;
    const valid = await verifyRsaPssSignature(message, signature, userRow.signature_public_key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify the garden exists and caller is a member
    const { data: garden, error: gardenErr } = await supabase
      .from("shared_gardens").select("authorized_users").eq("id", sharedGardenId).maybeSingle();
    if (gardenErr || !garden) {
      return new Response(JSON.stringify({ error: "Garden not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const authorized: string[] = garden.authorized_users || [];
    if (!authorized.includes(userId)) {
      return new Response(JSON.stringify({ error: "Not a member of this garden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Generate unique short code
    let shortCode = generateShortCode();
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from("garden_share_claims").select("id").eq("short_code", shortCode).maybeSingle();
      if (!existing) break;
      shortCode = generateShortCode();
      attempts++;
    }

    const { error: insertErr } = await supabase.from("garden_share_claims").insert({
      short_code: shortCode,
      encrypted_garden_key: encryptedGardenKey,
      shared_garden_id: sharedGardenId,
      invited_by_uuid: userId,
      invitee_display_name: inviteeDisplayName,
    });
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, shortCode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("create-garden-share-claim error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
