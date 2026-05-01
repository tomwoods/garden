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