import { SupabaseService } from './supabaseService';
import { DatabaseService, getPendingChanges, clearPendingChanges } from './database';
import { importCryptoKey, decryptData, encryptData } from './cryptoService';
import { syncMissingImages } from './imageSync';
import { uploadService } from './uploadService';

export type SyncState = 'idle' | 'syncing' | 'dirty' | 'error';

interface SyncUser {
  userId: string;
  privateKey: string;
  publicKey: string;
  signingPrivateKey: string;
}

const SYNC_VERSION_KEY = 'last_backup_sync_version';

let _syncState: SyncState = 'idle';
let _syncInProgress = false;
let _syncStateListeners: Array<(state: SyncState) => void> = [];

export function getSyncState(): SyncState {
  return _syncState;
}

export function onSyncStateChange(listener: (state: SyncState) => void): () => void {
  _syncStateListeners.push(listener);
  return () => {
    _syncStateListeners = _syncStateListeners.filter(l => l !== listener);
  };
}

function setSyncState(state: SyncState): void {
  _syncState = state;
  _syncStateListeners.forEach(l => l(state));
}

export function getLastSyncVersion(): string | null {
  return localStorage.getItem(SYNC_VERSION_KEY);
}

export function setLastSyncVersion(version: string): void {
  localStorage.setItem(SYNC_VERSION_KEY, version);
}

function mergeBackups(local: any, remote: any): any {
  const tables = [
    'plants', 'tendings', 'waterings', 'sunlight',
    'fruits', 'prunings', 'companions', 'scheduled_events',
    'plots', 'plot_memberships'
  ];

  const merged: any = { backup_timestamp: Date.now() };

  for (const table of tables) {
    const localRows: any[] = local[table] || [];
    const remoteRows: any[] = remote[table] || [];

    const byId = new Map<string, any>();

    for (const row of remoteRows) {
      byId.set(row.id, row);
    }

    for (const row of localRows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row);
      } else {
        const existing = byId.get(row.id);
        const localTs = row.last_interaction ?? row.datetime ?? row.created_at ?? 0;
        const remoteTs = existing.last_interaction ?? existing.datetime ?? existing.created_at ?? 0;
        if (localTs > remoteTs) {
          byId.set(row.id, row);
        }
      }
    }

    merged[table] = Array.from(byId.values());
  }

  return merged;
}

export async function pushLocalBackup(user: SyncUser): Promise<boolean> {
  if (uploadService.isUploadInProgress()) {
    setSyncState('dirty');
    return false;
  }
  try {
    setSyncState('syncing');
    const backupObject = await DatabaseService.getFullBackupAsObject();
    const backupJson = JSON.stringify(backupObject);

    const publicCryptoKey = await importCryptoKey(user.publicKey, 'spki', ['encrypt']);
    const encryptedData = await encryptData(backupJson, publicCryptoKey);
    const encryptedBackup = JSON.stringify(encryptedData);

    const result = await SupabaseService.uploadBackup(user.userId, encryptedBackup, user.signingPrivateKey);

    if (result.success && result.timestamp) {
      setLastSyncVersion(result.timestamp);
      clearPendingChanges();
      setSyncState('idle');
      return true;
    } else {
      setSyncState('error');
      return false;
    }
  } catch {
    setSyncState('error');
    return false;
  }
}

export async function syncOnAppLoad(
  user: SyncUser,
  onMergeConfirm: () => Promise<boolean>
): Promise<void> {
  if (!navigator.onLine) return;
  if (_syncInProgress) return;

  _syncInProgress = true;

  try {
    setSyncState('syncing');

    const downloadResult = await SupabaseService.downloadBackup(user.userId);

    if (!downloadResult.success || !downloadResult.lastModified) {
      setSyncState(getPendingChanges() ? 'dirty' : 'idle');
      return;
    }

    const remoteVersion = downloadResult.lastModified;
    const localVersion = getLastSyncVersion();

    if (!localVersion) {
      if (getPendingChanges()) {
        await pushLocalBackup(user);
        return;
      }
      if (downloadResult.encryptedBackup) {
        const privateCryptoKey = await importCryptoKey(user.privateKey, 'pkcs8', ['decrypt']);
        const encryptedData = JSON.parse(downloadResult.encryptedBackup);
        const decryptedJson = await decryptData(encryptedData, privateCryptoKey);
        const remoteBackup = JSON.parse(decryptedJson);
        await DatabaseService.restoreBackupFromObject(remoteBackup);
        window.dispatchEvent(new CustomEvent('garden-data-refreshed'));
        const plants = await DatabaseService.getAllPlants();
        syncMissingImages(plants, user);
      }
      setLastSyncVersion(remoteVersion);
      setSyncState('idle');
      return;
    }

    const remoteIsNewer = new Date(remoteVersion) > new Date(localVersion);

    if (!remoteIsNewer) {
      if (getPendingChanges()) {
        await pushLocalBackup(user);
        return;
      }
      setSyncState('idle');
      return;
    }

    if (!downloadResult.encryptedBackup) {
      setSyncState(getPendingChanges() ? 'dirty' : 'idle');
      return;
    }

    const privateCryptoKey = await importCryptoKey(user.privateKey, 'pkcs8', ['decrypt']);
    const encryptedData = JSON.parse(downloadResult.encryptedBackup);
    const decryptedJson = await decryptData(encryptedData, privateCryptoKey);
    const remoteBackup = JSON.parse(decryptedJson);

    if (!getPendingChanges()) {
      await DatabaseService.restoreBackupFromObject(remoteBackup);
      setLastSyncVersion(remoteVersion);
      setSyncState('idle');
      window.dispatchEvent(new CustomEvent('garden-data-refreshed'));
      const plants = await DatabaseService.getAllPlants();
      syncMissingImages(plants, user);
      return;
    }

    const localBackup = await DatabaseService.getFullBackupAsObject();
    const mergedBackup = mergeBackups(localBackup, remoteBackup);

    const confirmed = await onMergeConfirm();
    if (!confirmed) {
      setSyncState('dirty');
      return;
    }

    await DatabaseService.restoreBackupFromObject(mergedBackup);
    window.dispatchEvent(new CustomEvent('garden-data-refreshed'));
    const allPlants = await DatabaseService.getAllPlants();
    syncMissingImages(allPlants, user);

    const mergedJson = JSON.stringify(mergedBackup);
    const publicCryptoKey = await importCryptoKey(user.publicKey, 'spki', ['encrypt']);
    const encryptedMerged = await encryptData(mergedJson, publicCryptoKey);
    const encryptedMergedStr = JSON.stringify(encryptedMerged);

    const uploadResult = await SupabaseService.uploadBackup(user.userId, encryptedMergedStr, user.signingPrivateKey);
    if (uploadResult.success && uploadResult.timestamp) {
      setLastSyncVersion(uploadResult.timestamp);
      clearPendingChanges();
      setSyncState('idle');
    } else {
      setSyncState('error');
    }
  } catch {
    setSyncState('error');
  } finally {
    _syncInProgress = false;
  }
}
