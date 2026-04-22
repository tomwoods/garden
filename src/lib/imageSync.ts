import { signData, importSigningKey } from './signatureService';
import { importCryptoKey, decryptImageData } from './cryptoService';
import { DatabaseService, type Plant } from './database';

interface SyncUser {
  userId: string;
  privateKey: string;
  signingPrivateKey: string;
}

async function buildFetchSignature(
  plantId: string,
  signingPrivateKeyBase64: string
): Promise<{ signature: string; timestamp: number }> {
  const timestamp = Date.now();
  const message = `fetch:${plantId}:${timestamp}`;
  const privateKey = await importSigningKey(signingPrivateKeyBase64, 'pkcs8', ['sign']);
  const signature = await signData(message, privateKey);
  return { signature, timestamp };
}

export async function downloadAndCacheThumbnail(
  plantId: string,
  user: SyncUser
): Promise<string | null> {
  try {
    const { signature, timestamp } = await buildFetchSignature(plantId, user.signingPrivateKey);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-plant-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plantId, size: 'small', signature, timestamp }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (!result.success || !result.encryptedData) return null;

    const decryptionKey = await importCryptoKey(user.privateKey, 'pkcs8', ['decrypt']);
    const dataUrl = await decryptImageData(result.encryptedData, decryptionKey);

    await DatabaseService.saveImageLocally({ plantId, dataUrl, index: 0, timestamp: Date.now() });

    window.dispatchEvent(new CustomEvent('plant-image-synced', { detail: { plantId } }));

    return dataUrl;
  } catch (error) {
    console.debug('[imageSync] Failed to download thumbnail for plant', plantId, ':', error);
    return null;
  }
}

export async function fetchLargeImage(
  plantId: string,
  user: SyncUser
): Promise<string | null> {
  try {
    const { signature, timestamp } = await buildFetchSignature(plantId, user.signingPrivateKey);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-plant-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plantId, size: 'large', signature, timestamp }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (!result.success || !result.encryptedData) return null;

    const decryptionKey = await importCryptoKey(user.privateKey, 'pkcs8', ['decrypt']);
    return await decryptImageData(result.encryptedData, decryptionKey);
  } catch (error) {
    console.debug('[imageSync] Failed to fetch large image for plant', plantId, ':', error);
    return null;
  }
}

export async function syncMissingImages(plants: Plant[], user: SyncUser): Promise<void> {
  if (!navigator.onLine) return;

  const plantsNeedingSync = plants.filter((plant) => {
    if (!plant.additional_info) return false;
    try {
      const info = JSON.parse(plant.additional_info);
      if (!info.imageId) return false;
      const cached = DatabaseService.getImagesForPlant(plant.id);
      return cached.length === 0;
    } catch {
      return false;
    }
  });

  for (const plant of plantsNeedingSync) {
    await downloadAndCacheThumbnail(plant.id, user);
  }
}
