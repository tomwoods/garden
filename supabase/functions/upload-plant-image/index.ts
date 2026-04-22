import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_IMAGES_PER_USER = 100;
const MAX_TIMESTAMP_DIFF_MS = 5 * 60 * 1000;

async function verifyRsaPssSignature(
  message: string,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    const binaryString = atob(publicKeyBase64);
    const keyBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      keyBytes[i] = binaryString.charCodeAt(i);
    }

    const publicKey = await crypto.subtle.importKey(
      "spki",
      keyBytes.buffer,
      { name: "RSA-PSS", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBinary = atob(signatureBase64);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const messageBytes = new TextEncoder().encode(message);

    return await crypto.subtle.verify(
      { name: "RSA-PSS", saltLength: 32 },
      publicKey,
      sigBytes,
      messageBytes
    );
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authHeader.replace("Bearer ", "").trim();

    const body = await req.json();
    const { plantId, imageId, encryptedLarge, encryptedSmall, signature, timestamp } = body;

    if (!plantId || !imageId || !encryptedLarge || !encryptedSmall || !signature || !timestamp) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timeDiff = Math.abs(Date.now() - Number(timestamp));
    if (timeDiff > MAX_TIMESTAMP_DIFF_MS) {
      return new Response(JSON.stringify({ error: "Timestamp expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("signature_public_key")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userData?.signature_public_key) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = `${imageId}:${timestamp}`;
    const isValid = await verifyRsaPssSignature(message, signature, userData.signature_public_key);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { count } = await supabase
      .from("plant_images")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const existingCount = count ?? 0;

    const { data: existingRow } = await supabase
      .from("plant_images")
      .select("id")
      .eq("user_id", userId)
      .eq("plant_id", plantId)
      .maybeSingle();

    if (!existingRow && existingCount >= MAX_IMAGES_PER_USER) {
      return new Response(JSON.stringify({ error: "Image quota reached" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: upsertError } = await supabase
      .from("plant_images")
      .upsert(
        {
          user_id: userId,
          plant_id: plantId,
          image_id: imageId,
          image_data_large: encryptedLarge,
          image_data_small: encryptedSmall,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,plant_id" }
      );

    if (upsertError) {
      return new Response(JSON.stringify({ error: "Failed to save image" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, imageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
