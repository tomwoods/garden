import { resizeImage } from './imageProcessing';
import { signData, importSigningKey } from './signatureService';
import { importCryptoKey, encryptImageData } from './cryptoService';
import { DatabaseService } from './database';
import { v4 as uuidv4 } from 'uuid';

const MAX_IMAGES = 100;

export interface UploadQueueItem {
  id: string;
  plantId: string;
  plantName: string;
  image: string;
  timestamp: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  attempts: number;
}

export type UploadProgressCallback = (progress: { plantId: string; percentage: number }) => void;

class UploadService {
  private queue: Map<string, UploadQueueItem> = new Map();
  private isProcessing = false;
  private progressCallbacks: UploadProgressCallback[] = [];

  onProgress(callback: UploadProgressCallback): () => void {
    this.progressCallbacks.push(callback);
    return () => {
      this.progressCallbacks = this.progressCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyProgress(plantId: string, percentage: number): void {
    this.progressCallbacks.forEach(cb => cb({ plantId, percentage }));
  }

  async queueUpload(plantId: string, plantName: string, image: string): Promise<void> {
    const queueItem: UploadQueueItem = {
      id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      plantId,
      plantName,
      image,
      timestamp: Date.now(),
      status: 'pending',
      attempts: 0,
    };

    await DatabaseService.saveImageLocally({ plantId, dataUrl: image, index: 0, timestamp: Date.now() });

    this.queue.set(queueItem.id, queueItem);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) return;
    this.isProcessing = true;

    for (const [id, item] of this.queue.entries()) {
      if (item.status !== 'pending') continue;

      try {
        item.status = 'uploading';
        item.attempts++;
        await this.uploadImage(item);
        item.status = 'completed';
        this.queue.delete(id);
      } catch (error) {
        console.error('[uploadService] Upload attempt', item.attempts, 'failed:', error);
        item.status = item.attempts >= 3 ? 'failed' : 'pending';
      }
    }

    this.isProcessing = false;
  }

  private async uploadImage(item: UploadQueueItem): Promise<void> {
    const user = await DatabaseService.getCurrentUser();
    if (!user?.signature_private_key) throw new Error('No signing key available');

    const gardenKey = localStorage.getItem('garden-key');
    if (!gardenKey) throw new Error('No garden key found');
    const { publicKey: publicKeyBase64 } = JSON.parse(gardenKey);
    if (!publicKeyBase64) throw new Error('No encryption public key found');

    this.notifyProgress(item.plantId, 10);

    const [large, small] = await Promise.all([
      resizeImage(item.image, 720),
      resizeImage(item.image, 100),
    ]);

    this.notifyProgress(item.plantId, 30);

    const encryptionPublicKey = await importCryptoKey(publicKeyBase64, 'spki', ['encrypt']);

    const [encryptedLarge, encryptedSmall] = await Promise.all([
      encryptImageData(large, encryptionPublicKey),
      encryptImageData(small, encryptionPublicKey),
    ]);

    this.notifyProgress(item.plantId, 70);

    const imageId = uuidv4();
    const timestamp = Date.now();
    const message = `${imageId}:${timestamp}`;

    const privateKey = await importSigningKey(user.signature_private_key, 'pkcs8', ['sign']);
    const signature = await signData(message, privateKey);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-plant-image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.id}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plantId: item.plantId,
        imageId,
        encryptedLarge,
        encryptedSmall,
        signature,
        timestamp,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${text}`);
    }

    this.notifyProgress(item.plantId, 90);

    await DatabaseService.updatePlantImageId(item.plantId, imageId);

    this.notifyProgress(item.plantId, 100);

    window.dispatchEvent(new CustomEvent('plant-image-uploaded', { detail: { plantId: item.plantId } }));
  }

  getQuotaInfo(): { imagesUsed: number; maxImages: number; hasReachedLimit: boolean } {
    const allImages = DatabaseService.getAllImagesLocally();
    const imagesUsed = allImages.length;
    return {
      imagesUsed,
      maxImages: MAX_IMAGES,
      hasReachedLimit: imagesUsed >= MAX_IMAGES,
    };
  }

  async deleteImageFromServer(plantId: string): Promise<void> {
    try {
      const user = await DatabaseService.getCurrentUser();
      if (!user) return;

      const timestamp = Date.now();
      const message = `delete:${plantId}:${timestamp}`;
      const privateKey = await importSigningKey(user.signature_private_key, 'pkcs8', ['sign']);
      const signature = await signData(message, privateKey);

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-plant-image`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.id}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plantId, signature, timestamp }),
      });
    } catch (error) {
      console.debug('[uploadService] Server deletion failed (best effort):', error);
    }
  }

  isUploadInProgress(): boolean {
    if (this.isProcessing) return true;
    for (const item of this.queue.values()) {
      if (item.status === 'pending' || item.status === 'uploading') return true;
    }
    return false;
  }

  async retryFailedUploads(): Promise<void> {
    for (const [_, item] of this.queue.entries()) {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.attempts = 0;
      }
    }
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
}

export const uploadService = new UploadService();
