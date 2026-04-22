import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

interface UpdateBackupRequest {
  encryptedBackup: string;
  signature: string;
  userId: string;
  clientTimestamp?: string;
}

interface EncryptedBackupData {
  encryptedAesKey: string;
  iv: string;
  encryptedData: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

/**
 * Verify RSA-PSS signature using Web Crypto API
 */
async function verifySignature(
  data: string,
  signature: string,
  publicKeyPem: string
): Promise<boolean> {
  try {
    // Convert PEM to ArrayBuffer
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = publicKeyPem
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\s/g, "");
    
    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Import the public key
    const publicKey = await crypto.subtle.importKey(
      "spki",
      bytes.buffer,
      {
        name: "RSA-PSS",
        hash: "SHA-256",
      },
      false,
      ["verify"]
    );
    
    // Convert signature from base64
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    
    // Convert data to bytes
    const dataBytes = new TextEncoder().encode(data);
    
    // Verify signature
    const isValid = await crypto.subtle.verify(
      {
        name: "RSA-PSS",
        saltLength: 32,
      },
      publicKey,
      signatureBytes,
      dataBytes
    );
    
    return isValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Convert base64 public key to PEM format
 */
function base64ToPem(base64Key: string): string {
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  
  // Add line breaks every 64 characters
  const formattedKey = base64Key.match(/.{1,64}/g)?.join('\n') || base64Key;
  
  return `${pemHeader}\n${formattedKey}\n${pemFooter}`;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Parse request body
    const body: UpdateBackupRequest = await req.json();
    const { encryptedBackup, signature, userId, clientTimestamp } = body;
    const timestamp = clientTimestamp || new Date().toISOString();

    // Validate required fields
    if (!encryptedBackup || !signature || !userId) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required fields: encryptedBackup, signature, userId" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate that encryptedBackup is valid JSON with expected structure
    let backupData: EncryptedBackupData;
    try {
      backupData = JSON.parse(encryptedBackup);
      if (!backupData.encryptedAesKey || !backupData.iv || !backupData.encryptedData) {
        throw new Error("Invalid backup structure");
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Invalid encrypted backup format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase service role client (bypasses RLS)
    const supabaseServiceRole = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Retrieve user's signature public key from database
    const { data: userData, error: userError } = await supabaseServiceRole
      .from('users')
      .select('signature_public_key')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: "User not found or invalid user ID" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Convert base64 signature public key to PEM format
    const publicKeyPem = base64ToPem(userData.signature_public_key);

    // Verify signature
    const isSignatureValid = await verifySignature(
      encryptedBackup,
      signature,
      publicKeyPem
    );

    if (!isSignatureValid) {
      return new Response(
        JSON.stringify({ error: "Invalid signature - authentication failed" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update user's encrypted backup
    const { error: updateError } = await supabaseServiceRole
      .from('users')
      .update({
        encrypted_backup: encryptedBackup,
        last_modified: timestamp
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update backup" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Success response
    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Backup updated successfully",
        timestamp
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Update backup error:', error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});