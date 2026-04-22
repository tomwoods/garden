import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
Deno.serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  try {
    // Parse request body
    const body = await req.json();
    const { userId, encryptionPublicKey, signingPublicKey, clientTimestamp } = body;
    // Validate required fields
    if (!userId || !encryptionPublicKey || !signingPublicKey) {
      return new Response(JSON.stringify({
        error: "Missing required fields: userId, publicKey, signingPublicKey"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const timestamp = clientTimestamp || new Date().toISOString();
    // Create Supabase service role client (bypasses RLS)
    const supabaseServiceRole = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    // Insert new user record
    const { error } = await supabaseServiceRole.from('users').insert({
      id: userId,
      public_key: encryptionPublicKey,
      signature_public_key: signingPublicKey,
      encrypted_backup: "",
      last_modified: timestamp
    });
    if (error) {
      console.error('Database insert error:', error);
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Success response
    return new Response(JSON.stringify({
      success: true,
      message: "User registered successfully",
      timestamp
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error('Register user function error:', error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
