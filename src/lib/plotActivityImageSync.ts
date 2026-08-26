import { signData, importSigningKey } from './signatureService';
import { importCryptoKey, encryptImageData, decryptImageData } from './cryptoService';
import { resizeImage } from './imageProcessing';
import { v4 as uuidv4 } from 'uuid';
import type { SharedGardenRef } from './sharedGardenDatabase';
import type { SharedImageUser } from './sharedImageSync';

function getGardenPrivateKey(gardenId: string): string | null {
  return localStorage.getItem(`shared_garden_key_${gardenId}`);
}

function plotActivityImageKey(gardenId: string, plotActivityId: string, imageIndex: number): string {
  return `plot_activity_image_${gardenId}_${plotActivityId}_${imageIndex}`;
}

export function getPlotActivityImageLocally(gardenId: string, plotActivityId: string, imageIndex: number): string | null {
  const raw = localStorage.getItem(plotActivityImageKey(gardenId, plotActivityId, imageIndex));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.dataUrl ?? null;
  } catch {
    return null;
  }
}

export function getAllPlotActivityImagesLocally(gardenId: string, plotActivityId: string): string[] {
  const results: string[] = [];
  for (let i = 0; i < 4; i++) {
    const img = getPlotActivityImageLocally(gardenId, plotActivityId, i);
    if (img) results.push(img);
  }
  return results;
}

export function savePlotActivityImageLocally(gardenId: string, plotActivityId: string, imageIndex: number, dataUrl: string): void {
  localStorage.setItem(
    plotActivityImageKey(gardenId, plotActivityId, imageIndex),
    JSON.stringify({ dataUrl, timestamp: Date.now() })
  );
}

export function removePlotActivityImageLocally(gardenId: string, plotActivityId: string, imageIndex: number): void {
  localStorage.removeItem(plotActivityImageKey(gardenId, plotActivityId, imageIndex));
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

export async function uploadPlotActivityImage(
  ref: SharedGardenRef,
  plotActivityId: string,
  imageIndex: number,
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
      `upload-plot-activity:${imageId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-plot-activity-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plotActivityId,
        imageId,
        imageIndex,
        encryptedLarge,
        encryptedSmall,
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return null;

    savePlotActivityImageLocally(ref.gardenId, plotActivityId, imageIndex, small);

    window.dispatchEvent(
      new CustomEvent('plot-activity-image-synced', {
        detail: { gardenId: ref.gardenId, plotActivityId, imageIndex },
      })
    );

    return imageId;
  } catch (error) {
    console.debug('[plotActivityImageSync] Upload failed:', error);
    return null;
  }
}

export async function downloadPlotActivityThumbnails(
  ref: SharedGardenRef,
  plotActivityId: string,
  user: SharedImageUser
): Promise<string[]> {
  try {
    const gardenPrivateKeyBase64 = getGardenPrivateKey(ref.gardenId);
    if (!gardenPrivateKeyBase64) return [];

    const { signature, timestamp } = await buildSignature(
      `fetch-plot-activity:${plotActivityId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-plot-activity-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plotActivityId,
        size: 'small',
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return [];

    const result = await response.json();
    if (!result.success || !result.images) return [];

    const decryptionKey = await importCryptoKey(gardenPrivateKeyBase64, 'pkcs8', ['decrypt']);
    const thumbnails: string[] = [];

    for (const img of result.images) {
      const dataUrl = await decryptImageData(img.encryptedData, decryptionKey);
      savePlotActivityImageLocally(ref.gardenId, plotActivityId, img.imageIndex, dataUrl);
      thumbnails[img.imageIndex] = dataUrl;
    }

    return thumbnails.filter((thumbnail): thumbnail is string => Boolean(thumbnail));
  } catch (error) {
    console.debug('[plotActivityImageSync] Download thumbnails failed:', error);
    return [];
  }
}

export async function fetchPlotActivityLargeImage(
  ref: SharedGardenRef,
  plotActivityId: string,
  imageIndex: number,
  user: SharedImageUser
): Promise<string | null> {
  try {
    const gardenPrivateKeyBase64 = getGardenPrivateKey(ref.gardenId);
    if (!gardenPrivateKeyBase64) return null;

    const { signature, timestamp } = await buildSignature(
      `fetch-plot-activity:${plotActivityId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-plot-activity-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plotActivityId,
        size: 'large',
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (!result.success || !result.images) return null;

    const targetImg = result.images.find((i: { imageIndex: number }) => i.imageIndex === imageIndex);
    if (!targetImg) return null;

    const decryptionKey = await importCryptoKey(gardenPrivateKeyBase64, 'pkcs8', ['decrypt']);
    return await decryptImageData(targetImg.encryptedData, decryptionKey);
  } catch (error) {
    console.debug('[plotActivityImageSync] Fetch large image failed:', error);
    return null;
  }
}

export async function deletePlotActivityImage(
  ref: SharedGardenRef,
  plotActivityId: string,
  imageIndex: number,
  user: SharedImageUser
): Promise<boolean> {
  try {
    const { signature, timestamp } = await buildSignature(
      `delete-plot-activity:${plotActivityId}:${Date.now()}`,
      user.signingPrivateKey
    );

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-plot-activity-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.userId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sharedGardenId: ref.sharedGardenId,
        plotActivityId,
        imageIndex,
        signature,
        timestamp,
      }),
    });

    if (!response.ok) return false;

    removePlotActivityImageLocally(ref.gardenId, plotActivityId, imageIndex);

    window.dispatchEvent(
      new CustomEvent('plot-activity-image-synced', {
        detail: { gardenId: ref.gardenId, plotActivityId, imageIndex },
      })
    );

    return true;
  } catch (error) {
    console.debug('[plotActivityImageSync] Delete failed:', error);
    return false;
  }
}
