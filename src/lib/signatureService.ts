/**
 * Digital Signature Service using Web Crypto API
 * Handles RSA-PSS signature generation and verification for secure authentication
 */

/**
 * Generate RSA-PSS key pair for signing/verification
 */
export async function generateRSASigningKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-256'
      },
      true, // extractable
      ['sign', 'verify']
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey
    };
  } catch (error) {
    console.error('Failed to generate RSA signing key pair:', error);
    throw new Error('Signing key generation failed');
  }
}

/**
 * Sign data using RSA-PSS private key
 */
export async function signData(data: string, privateKey: CryptoKey): Promise<string> {
  try {
    console.debug('[signatureService] Signing data, length:', data.length);

    let dataBuffer: Uint8Array;
    try {
      const encoder = new TextEncoder();
      dataBuffer = encoder.encode(data);
      console.debug('[signatureService] Encoded data to buffer, size:', dataBuffer.byteLength);
    } catch (encodeErr) {
      console.error('[signatureService] TextEncoder.encode() failed:', encodeErr);
      throw new Error(`Failed to encode data: ${encodeErr instanceof Error ? encodeErr.message : 'unknown'}`);
    }

    let signature: ArrayBuffer;
    try {
      signature = await window.crypto.subtle.sign(
        {
          name: 'RSA-PSS',
          saltLength: 32
        },
        privateKey,
        dataBuffer
      );
      console.debug('[signatureService] Signature generated, size:', signature.byteLength);
    } catch (signErr) {
      console.error('[signatureService] crypto.subtle.sign() failed:', signErr);
      throw new Error(`Signing operation failed: ${signErr instanceof Error ? signErr.message : 'unknown'}`);
    }

    let binarySignature = '';
    try {
      const signatureArray = new Uint8Array(signature);
      signatureArray.forEach(byte => {
        binarySignature += String.fromCharCode(byte);
      });
      console.debug('[signatureService] Converted signature to binary string, length:', binarySignature.length);
    } catch (binaryErr) {
      console.error('[signatureService] Failed to convert signature to binary:', binaryErr);
      throw new Error(`Failed to process signature: ${binaryErr instanceof Error ? binaryErr.message : 'unknown'}`);
    }

    let base64Signature = '';
    try {
      base64Signature = btoa(binarySignature);
      console.debug('[signatureService] Encoded signature to base64, length:', base64Signature.length);
    } catch (btoa_err) {
      console.error('[signatureService] btoa() failed:', btoa_err);
      throw new Error(`Failed to encode signature: ${btoa_err instanceof Error ? btoa_err.message : 'unknown'}`);
    }

    return base64Signature;
  } catch (error) {
    console.error('[signatureService] Unexpected error in signData:', error);
    throw new Error(`Data signing failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/**
 * Verify signature using RSA-PSS public key
 */
export async function verifySignature(
  data: string, 
  signature: string, 
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Convert signature from base64
    const binaryString = atob(signature);
    const signatureBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      signatureBytes[i] = binaryString.charCodeAt(i);
    }
    
    const isValid = await window.crypto.subtle.verify(
      {
        name: 'RSA-PSS',
        saltLength: 32
      },
      publicKey,
      signatureBytes,
      dataBuffer
    );
    
    return isValid;
  } catch (error) {
    console.error('Failed to verify signature:', error);
    return false;
  }
}

/**
 * Import a Base64 string back to a CryptoKey for signing operations
 */
export async function importSigningKey(
  keyData: string,
  format: 'pkcs8' | 'spki',
  usage: KeyUsage[]
): Promise<CryptoKey> {
  try {
    console.debug('[signatureService] Importing signing key, format:', format, 'usage:', usage);

    let binaryString: string;
    try {
      binaryString = atob(keyData);
      console.debug('[signatureService] Decoded key from base64, size:', binaryString.length);
    } catch (atobErr) {
      console.error('[signatureService] Failed to decode base64 key:', atobErr);
      throw new Error(`Invalid base64 key data: ${atobErr instanceof Error ? atobErr.message : 'unknown'}`);
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.debug('[signatureService] Created Uint8Array from key, size:', bytes.byteLength);
    } catch (bytesErr) {
      console.error('[signatureService] Failed to create Uint8Array from key:', bytesErr);
      throw new Error(`Failed to create key buffer: ${bytesErr instanceof Error ? bytesErr.message : 'unknown'}`);
    }

    let key: CryptoKey;
    try {
      key = await window.crypto.subtle.importKey(
        format,
        bytes.buffer,
        {
          name: 'RSA-PSS',
          hash: 'SHA-256'
        },
        true, // extractable
        usage
      );
      console.debug('[signatureService] Successfully imported signing key');
    } catch (importErr) {
      console.error('[signatureService] crypto.subtle.importKey() failed:', importErr);
      throw new Error(`Key import failed: ${importErr instanceof Error ? importErr.message : 'unknown'}`);
    }

    return key;
  } catch (error) {
    console.error('[signatureService] Unexpected error in importSigningKey:', error);
    throw new Error(`Signing key import failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/**
 * Export a CryptoKey to a Base64 string for signing keys
 */
export async function exportCryptoKey(key: CryptoKey, format: 'pkcs8' | 'spki'): Promise<string> {
  try {
    const exported = await window.crypto.subtle.exportKey(format, key);
    const exportedKeyBuffer = new Uint8Array(exported);
    
    // Convert to Base64
    let binary = '';
    exportedKeyBuffer.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  } catch (error) {
    console.error('Failed to export signing key:', error);
    throw new Error('Signing key export failed');
  }
}