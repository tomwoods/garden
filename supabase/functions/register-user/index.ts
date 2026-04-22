import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { userId, encryptionPublicKey, signingPublicKey, clientTimestamp, checkOnly } = body;

    if (!userId || !UUID_REGEX.test(userId)) {
      return new Response(JSON.stringify({ error: "Invalid or missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseServiceRole = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (checkOnly) {
      const { data } = await supabaseServiceRole
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      return new Response(JSON.stringify({ exists: !!data }), {
        status: data ? 409 : 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!encryptionPublicKey || !signingPublicKey) {
      return new Response(JSON.stringify({ error: "Missing required fields: encryptionPublicKey, signingPublicKey" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamp = clientTimestamp || new Date().toISOString();

    const { error } = await supabaseServiceRole.from('users').insert({
      id: userId,
      public_key: encryptionPublicKey,
      signature_public_key: signingPublicKey,
      encrypted_backup: "",
      last_modified: timestamp,
    });

    if (error) {
      if (error.code === '23505') {
        return new Response(JSON.stringify({ error: "User already exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error('Database insert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message: "User registered successfully", timestamp }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error('Register user function error:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
