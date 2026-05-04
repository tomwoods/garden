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
      return new Response(JSON.stringify({ error: "User not found — please register first" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { shortCode, displayName, timestamp, signature } = body;

    if (!shortCode || !displayName || !timestamp || !signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Request timestamp expired" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const message = `claim-garden-share:${userId}:${shortCode}:${timestamp}`;
    const valid = await verifyRsaPssSignature(message, signature, userRow.signature_public_key);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Look up the claim
    const { data: claim, error: claimErr } = await supabase
      .from("garden_share_claims")
      .select("id, encrypted_garden_key, shared_garden_id, invitee_display_name, expires_at")
      .eq("short_code", shortCode)
      .maybeSingle();

    if (claimErr || !claim) {
      return new Response(JSON.stringify({ error: "Invite not found or already used" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (new Date(claim.expires_at) < new Date()) {
      await supabase.from("garden_share_claims").delete().eq("id", claim.id);
      return new Response(JSON.stringify({ error: "This invite link has expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check if already a member
    const { data: garden, error: gardenErr } = await supabase
      .from("shared_gardens")
      .select("authorized_users, garden_public_key")
      .eq("id", claim.shared_garden_id)
      .maybeSingle();

    if (gardenErr || !garden) {
      return new Response(JSON.stringify({ error: "Garden not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authorizedUsers: string[] = garden.authorized_users || [];

    if (!authorizedUsers.includes(userId)) {
      authorizedUsers.push(userId);
      await supabase
        .from("shared_gardens")
        .update({ authorized_users: authorizedUsers })
        .eq("id", claim.shared_garden_id);
    }

    // Delete the claim — one-time use
    await supabase.from("garden_share_claims").delete().eq("id", claim.id);

    return new Response(JSON.stringify({
      success: true,
      encryptedGardenKey: claim.encrypted_garden_key,
      sharedGardenId: claim.shared_garden_id,
      gardenPublicKey: garden.garden_public_key,
      displayName: claim.invitee_display_name || displayName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("claim-garden-share error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
