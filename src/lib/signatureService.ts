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
    const dataBuffer = new TextEncoder().encode(data);
    const signature = await window.crypto.subtle.sign(
      { name: 'RSA-PSS', saltLength: 32 },
      privateKey,
      dataBuffer
    );
    let binary = '';
    new Uint8Array(signature).forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  } catch (error) {
    console.error('Data signing failed:', error);
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
    const binaryString = atob(keyData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return await window.crypto.subtle.importKey(
      format,
      bytes.buffer,
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      usage
    );
  } catch (error) {
    console.error('Signing key import failed:', error);
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