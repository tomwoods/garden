import { signData, importSigningKey } from './signatureService';
import { importCryptoKey, encryptImageData, decryptImageData } from './cryptoService';
import { resizeImage } from './imageProcessing';
import { v4 as uuidv4 } from 'uuid';
import type { SharedGardenRef } from './sharedGardenDatabase';

export interface SharedImageUser {
  userId: string;
  signingPrivateKey: string;
}

function getGardenPrivateKey(gardenId: string): string | null {
  return localStorage.getItem(`shared_garden_key_${gardenId}`);
}

function localStorageKey(gardenId: string, plantId: string): string {
  return `shared_plant_image_${gardenId}_${plantId}`;
}

export function getSharedImageLocally(gardenId: string, plantId: string): string | null {
  const raw = localStorage.getItem(localStorageKey(gardenId, plantId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.dataUrl ?? null;
  } catch {
    return null;
  }
}

export function getAllSharedImagesLocally(gardenId: string): Array<{ plantId: string; dataUrl: string }> {
  const prefix = `shared_plant_image_${gardenId}_`;
  const results: Array<{ plantId: string; dataUrl: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const plantId = key.substring(prefix.length);
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.dataUrl) results.push({ plantId, dataUrl: parsed.dataUrl });
        } catch {}
      }
    }
  }
  return results;
}

export function saveSharedImageLocally(gardenId: string, plantId: string, dataUrl: string): void {
  localStorage.setItem(
    localStorageKey(gardenId, plantId),
    JSON.stringify({ dataUrl, timestamp: Date.now() })
  );
}

export function removeSharedImageLocally(gardenId: string, plantId: string): void {
  localStorage.removeItem(localStorageKey(gardenId, plantId));
}

async function buildSignature(
  message: string,
  signingPrivateKeyBase64: string
): Promise<{ signature: string; timestamp: number }> {
  const timestamp = Date.now();
  const privateKey = await importSigningKey(signingPrivateKeyBase64, 'pkcs8', ['sign']);
  const signature = await signData(message, privateKey);
  return { signature, timestamp };
}

export async function uploadSharedGardenImage(
  ref: SharedGardenRef,
  plantId: string,
  image: string,
  user: SharedImageUser
): Promise<string | null> {
  try {
    const gardenPublicKeyBase64 = ref.gardenPublicKeyBase64;
    if (!gardenPublicKeyBase64) return null;

    const [large, small] = await Promise.all([
      resizeImage(image, 720),
      resizeImage(image, 100),
    ]);

    const encryptionPublicKey = await importCryptoKey(gardenPublicKeyBase64, 'spki', ['encrypt']);

    const [encryptedLarge, encryptedSmall] = await Promise.all([
      encryptImageData(large, encryptionPublicKey),
      encryptImageData(small, encryptionPublicKey),
    ]);

    const imageId = uuidv4();
    const { signature, timestamp } = await buildSignature(
      `upload-shared:${imageId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-shared-garden-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plantId,
        imageId,
        encryptedLarge,
        encryptedSmall,
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return null;

    saveSharedImageLocally(ref.gardenId, plantId, small);

    window.dispatchEvent(
      new CustomEvent('shared-plant-image-synced', {
        detail: { gardenId: ref.gardenId, plantId },
      })
    );

    return imageId;
  } catch (error) {
    console.debug('[sharedImageSync] Upload failed:', error);
    return null;
  }
}

export async function downloadAndCacheSharedThumbnail(
  ref: SharedGardenRef,
  plantId: string,
  user: SharedImageUser
): Promise<string | null> {
  try {
    const gardenPrivateKeyBase64 = getGardenPrivateKey(ref.gardenId);
    if (!gardenPrivateKeyBase64) return null;

    const { signature, timestamp } = await buildSignature(
      `fetch-shared:${plantId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-shared-garden-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plantId,
        size: 'small',
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (!result.success || !result.encryptedData) return null;

    const decryptionKey = await importCryptoKey(gardenPrivateKeyBase64, 'pkcs8', ['decrypt']);
    const dataUrl = await decryptImageData(result.encryptedData, decryptionKey);

    saveSharedImageLocally(ref.gardenId, plantId, dataUrl);

    window.dispatchEvent(
      new CustomEvent('shared-plant-image-synced', {
        detail: { gardenId: ref.gardenId, plantId },
      })
    );

    return dataUrl;
  } catch (error) {
    console.debug('[sharedImageSync] Download thumbnail failed:', error);
    return null;
  }
}

export async function fetchSharedLargeImage(
  ref: SharedGardenRef,
  plantId: string,
  user: SharedImageUser
): Promise<string | null> {
  try {
    const gardenPrivateKeyBase64 = getGardenPrivateKey(ref.gardenId);
    if (!gardenPrivateKeyBase64) return null;

    const { signature, timestamp } = await buildSignature(
      `fetch-shared:${plantId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-shared-garden-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plantId,
        size: 'large',
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (!result.success || !result.encryptedData) return null;

    const decryptionKey = await importCryptoKey(gardenPrivateKeyBase64, 'pkcs8', ['decrypt']);
    return await decryptImageData(result.encryptedData, decryptionKey);
  } catch (error) {
    console.debug('[sharedImageSync] Fetch large image failed:', error);
    return null;
  }
}

export async function deleteSharedGardenImage(
  ref: SharedGardenRef,
  plantId: string,
  user: SharedImageUser
): Promise<boolean> {
  try {
    const { signature, timestamp } = await buildSignature(
      `delete-shared:${plantId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-shared-garden-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plantId,
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return false;

    removeSharedImageLocally(ref.gardenId, plantId);

    window.dispatchEvent(
      new CustomEvent('shared-plant-image-synced', {
        detail: { gardenId: ref.gardenId, plantId },
      })
    );

    return true;
  } catch (error) {
    console.debug('[sharedImageSync] Delete failed:', error);
    return false;
  }
}

export async function syncMissingSharedImages(
  ref: SharedGardenRef,
  plants: Array<{ id: string; additional_info?: string }>,
  user: SharedImageUser
): Promise<void> {
  if (!navigator.onLine) return;

  for (const plant of plants) {
    const cached = getSharedImageLocally(ref.gardenId, plant.id);
    if (cached) continue;
    await downloadAndCacheSharedThumbnail(ref, plant.id, user);
  }
}
