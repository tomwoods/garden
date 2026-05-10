/**
 * Cryptography Service using Web Crypto API
 * Handles RSA key generation, encryption, decryption, signing, and key management
 */

import { generateRSASigningKeyPair, exportCryptoKey as exportSigningKey } from './signatureService';

export interface KeyPairStrings {
  publicKey: string;
  privateKey: string;
  signingPublicKey: string;
  signingPrivateKey: string;
}

/**
 * Generate both RSA-OAEP (encryption) and RSA-PSS (signing) key pairs
 */
export async function generateRSAKeyPair(): Promise<{ 
  encryptionKeys: { publicKey: CryptoKey; privateKey: CryptoKey };
  signingKeys: { publicKey: CryptoKey; privateKey: CryptoKey };
}> {
  try {
    const encryptionKeyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-256'
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );

    const signingKeyPair = await generateRSASigningKeyPair();

    return {
      encryptionKeys: {
        publicKey: encryptionKeyPair.publicKey,
        privateKey: encryptionKeyPair.privateKey
      },
      signingKeys: signingKeyPair
    };
  } catch (error) {
    console.error('Failed to generate RSA key pairs:', error);
    throw new Error('Key pair generation failed');
  }
}

/**
 * Export a CryptoKey to a Base64 string
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
    console.error('Failed to export crypto key:', error);
    throw new Error('Key export failed');
  }
}

/**
 * Import a Base64 string back to a CryptoKey
 */
export async function importCryptoKey(
  keyData: string, 
  format: 'pkcs8' | 'spki', 
  usage: KeyUsage[]
): Promise<CryptoKey> {
  try {
    // Convert from Base64 to ArrayBuffer
    const binaryString = atob(keyData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const key = await window.crypto.subtle.importKey(
      format,
      bytes.buffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true, // extractable
      usage
    );

    return key;
  } catch (error) {
    console.error('Failed to import crypto key:', error);
    throw new Error('Key import failed');
  }
}

/**
 * Utility function to convert ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

/**
 * Utility function to convert Base64 to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypt data using RSA-OAEP public key
 */
export async function encryptData(data: string, publicKey: CryptoKey): Promise<object> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // RSA-OAEP can only encrypt small amounts of data
    // For larger data, we need to use AES for the data and RSA for the AES key
    
    // Generate AES key
    const aesKey = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Generate random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt data with AES
    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      aesKey,
      dataBuffer
    );
    
    // Export AES key
    const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
    
    // Encrypt AES key with RSA
    const encryptedAesKey = await window.crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP'
      },
      publicKey,
      exportedAesKey
    );
    
    // Combine encrypted AES key, IV, and encrypted data
    const result = {
      encryptedAesKey: arrayBufferToBase64(encryptedAesKey),
      iv: arrayBufferToBase64(iv),
      encryptedData: arrayBufferToBase64(encryptedData)
    };
    
    return result;
  } catch (error) {
    console.error('Failed to encrypt data:', error);
    throw new Error('Data encryption failed');
  }
}

/**
 * Encrypt a raw image data URL for server storage (E2EE)
 * Returns a JSON string suitable for storing in image_data_large / image_data_small
 */
export async function encryptImageData(dataUrl: string, publicKey: CryptoKey): Promise<string> {
  const result = await encryptData(dataUrl, publicKey);
  return JSON.stringify(result);
}

/**
 * Decrypt an encrypted image JSON string back to a data URL
 */
export async function decryptImageData(encryptedJson: string, privateKey: CryptoKey): Promise<string> {
  const encryptedPackage = JSON.parse(encryptedJson);
  return decryptData(encryptedPackage, privateKey);
}

/**
 * Generate an ephemeral RSA-OAEP key pair and immediately export both keys as Base64 strings.
 * Used for the plant share handshake — the key pair is short-lived and must not persist as CryptoKey objects.
 * @deprecated Use generateEphemeralECDHKeyPair for new code — produces ~10x shorter URLs.
 */
export async function generateEphemeralRSAKeyPair(): Promise<{ publicKeyBase64: string; privateKeyBase64: string }> {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
  const publicKeyBase64 = await exportCryptoKey(keyPair.publicKey, 'spki');
  const privateKeyBase64 = await exportCryptoKey(keyPair.privateKey, 'pkcs8');
  return { publicKeyBase64, privateKeyBase64 };
}

// ─── ECDH P-256 ephemeral handshake ──────────────────────────────────────────
// Produces a ~162-char Base64 private key vs ~2232 chars for RSA-2048.
// Scheme: generate ephemeral P-256 pair → derive AES-256-GCM key via HKDF
// from the raw private key scalar → encrypt payload → embed private key in URL.
// Receiver re-derives the same AES key from the URL fragment to decrypt.

const ECDH_CURVE = 'P-256';
const ECDH_HKDF_INFO = new TextEncoder().encode('garden-share-v1');
const ECDH_HKDF_SALT = new TextEncoder().encode('garden-ephemeral-salt-v1');

/** Export a raw P-256 private key scalar to Base64 (32 bytes → 44 Base64 chars). */
async function exportECDHPrivateKeyRaw(key: CryptoKey): Promise<string> {
  const jwk = await window.crypto.subtle.exportKey('jwk', key);
  return jwk.d!; // already Base64url in JWK; use as-is
}

/** Import a raw P-256 private key from a Base64url JWK `d` scalar. */
async function importECDHPrivateKeyRaw(dBase64url: string): Promise<CryptoKey> {
  // Reconstruct a minimal P-256 JWK from the private scalar.
  // We derive the public point from the scalar via a dummy ECDH derive step.
  // The simplest approach: import as 'pkcs8' after reconstructing the full JWK.
  // Web Crypto requires x/y for EC private key JWK, so we generate a throwaway
  // pair and swap out d — but that changes the key. Instead, use the pkcs8 path
  // via SubtleCrypto which accepts the full JWK.
  //
  // The cleanest solution: store as full PKCS8 (91 bytes → 124 Base64 chars)
  // which is still 18x smaller than RSA-2048 PKCS8.
  // We store PKCS8 Base64 in the URL, so this function imports it directly.
  const bytes = base64ToArrayBuffer(dBase64url);
  return window.crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: ECDH_CURVE },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/** Derive an AES-256-GCM key from an ECDH private key via HKDF. */
async function deriveAESFromECDHPrivate(privateKey: CryptoKey): Promise<CryptoKey> {
  // Export raw bits of the private key scalar (32 bytes)
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'ECDH', public: await _getECDHPublicFromPrivate(privateKey) },
    privateKey,
    256
  );

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', bits, { name: 'HKDF' }, false, ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: ECDH_HKDF_SALT, info: ECDH_HKDF_INFO },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Derive a public key from a private key by re-exporting as JWK and importing as public.
async function _getECDHPublicFromPrivate(privateKey: CryptoKey): Promise<CryptoKey> {
  const jwk = await window.crypto.subtle.exportKey('jwk', privateKey);
  // Remove the private scalar to get a public-only JWK
  const { d: _d, key_ops: _ops, ...publicJwk } = jwk;
  return window.crypto.subtle.importKey(
    'jwk',
    { ...publicJwk, key_ops: ['deriveKey', 'deriveBits'] },
    { name: ECDH_CURVE },
    false,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Generate an ephemeral P-256 ECDH key pair.
 * Returns the PKCS8 private key as Base64 (~124 chars) for embedding in URLs.
 */
export async function generateEphemeralECDHKeyPair(): Promise<{ privateKeyBase64: string }> {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: ECDH_CURVE, namedCurve: ECDH_CURVE },
    true,
    ['deriveKey', 'deriveBits']
  );
  const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyBase64 = arrayBufferToBase64(pkcs8);
  return { privateKeyBase64 };
}

/**
 * Encrypt a string using an ephemeral ECDH private key.
 * Returns {iv, encryptedData} — both Base64. No wrapped AES key in the output.
 */
export async function encryptWithECDHKey(data: string, privateKeyBase64: string): Promise<{ iv: string; encryptedData: string }> {
  const privateKey = await importECDHPrivateKeyRaw(privateKeyBase64);
  const aesKey = await deriveAESFromECDHPrivate(privateKey);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(data)
  );

  return {
    iv: arrayBufferToBase64(iv),
    encryptedData: arrayBufferToBase64(ciphertext),
  };
}

/**
 * Decrypt a payload encrypted by encryptWithECDHKey using the same ephemeral private key.
 */
export async function decryptWithECDHKey(
  encryptedPackage: { iv: string; encryptedData: string },
  privateKeyBase64: string
): Promise<string> {
  const privateKey = await importECDHPrivateKeyRaw(privateKeyBase64);
  const aesKey = await deriveAESFromECDHPrivate(privateKey);

  const iv = base64ToArrayBuffer(encryptedPackage.iv);
  const ciphertext = base64ToArrayBuffer(encryptedPackage.encryptedData);

  const plain = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(plain);
}

/**
 * Encrypt a string using a Base64 RSA-OAEP public key.
 */
export async function encryptWithPublicKey(data: string, publicKeyBase64: string): Promise<object> {
  const publicKey = await importCryptoKey(publicKeyBase64, 'spki', ['encrypt']);
  return encryptData(data, publicKey);
}

/**
 * Decrypt an encrypted package using a Base64 RSA-OAEP private key.
 */
export async function decryptWithPrivateKey(encryptedPackage: object, privateKeyBase64: string): Promise<string> {
  const privateKey = await importCryptoKey(privateKeyBase64, 'pkcs8', ['decrypt']);
  return decryptData(encryptedPackage, privateKey);
}

/**
 * Decrypt data using RSA-OAEP private key
 */
export async function decryptData(encryptedPackage: any, privateKey: CryptoKey): Promise<string> {
  try {
    // Decrypt AES key with RSA
    const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedPackage.encryptedAesKey);
    const decryptedAesKeyBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP'
      },
      privateKey,
      encryptedAesKeyBuffer
    );
    
    // Import AES key
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      decryptedAesKeyBuffer,
      {
        name: 'AES-GCM'
      },
      false,
      ['decrypt']
    );
    
    // Decrypt data with AES
    const iv = base64ToArrayBuffer(encryptedPackage.iv);
    const encryptedData = base64ToArrayBuffer(encryptedPackage.encryptedData);
    
    const decryptedDataBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      aesKey,
      encryptedData
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedDataBuffer);
  } catch (error) {
    console.error('Failed to decrypt data:', error);
    throw new Error('Data decryption failed');
  }
}