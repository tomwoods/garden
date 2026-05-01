/**
 * Shared Backup Service — Event Sourcing sync engine for shared plants.
 *
 * Sync order guarantee: personal garden backup runs first (in syncService.ts),
 * then syncAllSharedPlants() is called here for each shared plant in turn.
 *
 * Architecture: Snapshot + Delta Log per plant.
 * - The encrypted blob in shared_plants contains a PlantShareObject: { snapshot, deltas }.
 * - On each sync cycle, new local deltas are appended; incoming deltas are replayed.
 * - The owner (authorized_users[0]) compacts when deltas.length > 50.
 */

import {
  DatabaseService,
  type PlantShareObject,
  type SyncDelta,
  type ConflictRecord,
  type SharedPlantRef,
  getSharedPlantRefs,
  getSharedSyncTs,
  setSharedSyncTs,
  clearPlantPendingChange,
} from './database';
import { importCryptoKey, encryptData, decryptData } from './cryptoService';
import { signData, importSigningKey } from './signatureService';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const COMPACTION_THRESHOLD = 50;

interface SyncUser {
  userId: string;
  privateKey: string;
  publicKey: string;
  signingPrivateKey: string;
}

// ─── Signature helper ─────────────────────────────────────────────────────

async function buildSignature(message: string, signingPrivateKey: string): Promise<string> {
  const key = await importSigningKey(signingPrivateKey, 'pkcs8', ['sign']);
  return signData(message, key);
}

// ─── Edge function callers ────────────────────────────────────────────────

async function fetchSharedPlant(
  sharedPlantId: string,
  user: SyncUser
): Promise<{ encryptedData: string; lastModified: string; snapshotAt: string | null } | null> {
  const timestamp = Date.now();
  const message = `sync-shared-plant:${user.userId}:${sharedPlantId}:read:${timestamp}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-shared-plant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sharedPlantId, action: 'read', timestamp, signature }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.encryptedData) return null;
  return { encryptedData: data.encryptedData, lastModified: data.lastModified, snapshotAt: data.snapshotAt ?? null };
}

async function pushSharedPlant(
  sharedPlantId: string,
  encryptedData: string,
  clientLastModified: string | null,
  isCompaction: boolean,
  user: SyncUser
): Promise<{ success: boolean; conflict?: { lastModified: string; encryptedData: string } }> {
  const timestamp = Date.now();
  const message = `sync-shared-plant:${user.userId}:${sharedPlantId}:write:${timestamp}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-shared-plant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      sharedPlantId,
      action: 'write',
      encryptedData,
      clientLastModified,
      isCompaction,
      timestamp,
      signature,
    }),
  });

  if (res.status === 409) {
    const data = await res.json();
    return { success: false, conflict: { lastModified: data.lastModified, encryptedData: data.encryptedData } };
  }

  return { success: res.ok };
}

// ─── Encrypt / decrypt plant share objects ────────────────────────────────

async function encryptPlantShareObject(
  obj: PlantShareObject,
  plantPublicKeyBase64: string
): Promise<string> {
  const publicKey = await importCryptoKey(plantPublicKeyBase64, 'spki', ['encrypt']);
  const json = JSON.stringify(obj);
  const encrypted = await encryptData(json, publicKey);
  return JSON.stringify(encrypted);
}

async function decryptPlantShareObject(
  encryptedStr: string,
  plantPrivateKeyBase64: string
): Promise<PlantShareObject> {
  const privateKey = await importCryptoKey(plantPrivateKeyBase64, 'pkcs8', ['decrypt']);
  const encrypted = JSON.parse(encryptedStr);
  const json = await decryptData(encrypted, privateKey);
  return JSON.parse(json);
}

// ─── Conflict resolution ──────────────────────────────────────────────────

export type ConflictResolver = (conflicts: ConflictRecord[]) => Promise<ConflictRecord[]>;

// Default: keep incoming (last-writer-wins, silent). Replace with UI prompt if desired.
async function defaultConflictResolver(conflicts: ConflictRecord[]): Promise<ConflictRecord[]> {
  // Return empty array = accept all incoming values for conflicted records
  return [];
}

// ─── Per-plant sync ───────────────────────────────────────────────────────

export async function syncSharedPlant(
  ref: SharedPlantRef,
  user: SyncUser,
  onConflict: ConflictResolver = defaultConflictResolver
): Promise<void> {
  if (!navigator.onLine) return;

  const plantPrivKeyBase64 = localStorage.getItem(`plant_priv_${ref.plantId}`);
  if (!plantPrivKeyBase64) {
    console.warn(`No plant private key found for plant ${ref.plantId} — skipping sync`);
    return;
  }

  try {
    // 1. Pull remote
    const remote = await fetchSharedPlant(ref.sharedPlantId, user);
    if (!remote) return;

    const remoteObj = await decryptPlantShareObject(remote.encryptedData, plantPrivKeyBase64);
    const lastSyncTs = getSharedSyncTs(ref.plantId);

    // 2. Identify new deltas since last sync
    const newDeltas = remoteObj.deltas.filter(d => d.ts > lastSyncTs);

    // 3. Apply incoming deltas to local DB
    const conflicts = await DatabaseService.applyPlantDeltas(ref.plantId, newDeltas);

    // 4. Resolve conflicts (silent by default, or via UI prompt)
    if (conflicts.length > 0) {
      const resolved = await onConflict(conflicts);
      // Apply the resolver's chosen versions for conflicted records
      for (const resolution of resolved) {
        await DatabaseService.applyPlantDeltas(ref.plantId, [{
          id: uuidv4(),
          type: 'UPDATE',
          table: resolution.table,
          record_id: resolution.record_id,
          plant_id: ref.plantId,
          data: resolution.incoming,
          ts: (resolution.incoming.updated_at as number) ?? Date.now(),
          author_uuid: 'conflict-resolution',
        }]);
      }
    }

    // 5. If viewer — we are done after applying remote deltas
    if (ref.role === 'viewer') {
      setSharedSyncTs(ref.plantId, Date.now());
      return;
    }

    // 6. Co-tender or owner — gather local changes and push
    const localDeltas = await DatabaseService.getPlantDeltasSince(ref.plantId, lastSyncTs, user.userId);

    if (localDeltas.length === 0 && newDeltas.length === 0) {
      setSharedSyncTs(ref.plantId, Date.now());
      return;
    }

    // 7. Build the updated PlantShareObject
    const updatedDeltas = [...remoteObj.deltas, ...localDeltas];
    const shouldCompact = ref.ownedByMe && updatedDeltas.length > COMPACTION_THRESHOLD;

    let updatedObj: PlantShareObject;

    if (shouldCompact) {
      // Owner performs compaction: fresh snapshot + empty delta log
      const freshSnapshot = await DatabaseService.getPlantSnapshotAsObject(ref.plantId);
      if (!freshSnapshot) return;
      updatedObj = { ...freshSnapshot, schema_version: 1 };
      // Purge tombstones for this plant after compaction
      DatabaseService.purgeTombstonesForPlant(ref.plantId);
    } else {
      updatedObj = { ...remoteObj, deltas: updatedDeltas };
    }

    // 8. Encrypt and push
    const encryptedStr = await encryptPlantShareObject(updatedObj, ref.plantPublicKeyBase64);
    const pushResult = await pushSharedPlant(
      ref.sharedPlantId,
      encryptedStr,
      remote.lastModified,
      shouldCompact,
      user
    );

    if (pushResult.conflict) {
      // Server was updated by another device between our read and write.
      // Re-decrypt the server's version, merge our local deltas into it, and retry once.
      const serverObj = await decryptPlantShareObject(pushResult.conflict.encryptedData, plantPrivKeyBase64);
      const mergedDeltas = [...serverObj.deltas, ...localDeltas];
      const retryObj: PlantShareObject = { ...serverObj, deltas: mergedDeltas };
      const retryEncrypted = await encryptPlantShareObject(retryObj, ref.plantPublicKeyBase64);
      await pushSharedPlant(ref.sharedPlantId, retryEncrypted, pushResult.conflict.lastModified, false, user);
    }

    clearPlantPendingChange(ref.plantId);
    setSharedSyncTs(ref.plantId, Date.now());
  } catch (err) {
    console.error(`Shared plant sync failed for ${ref.plantId}:`, err);
  }
}

// ─── Sync all shared plants ───────────────────────────────────────────────

export async function syncAllSharedPlants(
  user: SyncUser,
  onConflict?: ConflictResolver
): Promise<void> {
  const refs = getSharedPlantRefs();
  for (const ref of refs) {
    await syncSharedPlant(ref, user, onConflict);
  }
}

// ─── Create a new share (called from SharePlantModal) ─────────────────────

export async function createSharedPlant(
  plantId: string,
  shareMode: 'view' | 'co-edit',
  plantPublicKeyBase64: string,
  user: SyncUser
): Promise<{ sharedPlantId: string } | null> {
  const snapshot = await DatabaseService.getPlantSnapshotAsObject(plantId);
  if (!snapshot) return null;

  const encryptedStr = await encryptPlantShareObject(snapshot, plantPublicKeyBase64);

  const timestamp = Date.now();
  const message = `create-shared-plant:${user.userId}:${timestamp}:${shareMode}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-shared-plant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      encryptedData: encryptedStr,
      plantPublicKey: plantPublicKeyBase64,
      shareMode,
      timestamp,
      signature,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.sharedPlantId ? { sharedPlantId: data.sharedPlantId } : null;
}

// ─── Create a share claim (called from SharePlantModal after createSharedPlant) ─

export async function createShareClaim(
  sharedPlantId: string,
  encryptedPlantKey: string,
  claimMode: 'view' | 'co-edit',
  user: SyncUser
): Promise<{ shortCode: string } | null> {
  const timestamp = Date.now();
  const message = `create-share-claim:${user.userId}:${sharedPlantId}:${timestamp}:${claimMode}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-share-claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sharedPlantId, encryptedPlantKey, claimMode, timestamp, signature }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.shortCode ? { shortCode: data.shortCode } : null;
}

// ─── Claim a shared plant (called from ReceivePlantShareView) ─────────────

export async function claimPlantShare(
  shortCode: string,
  user: SyncUser
): Promise<{ encryptedPlantKey: string; sharedPlantId: string; mode: string } | null> {
  const timestamp = Date.now();
  const message = `claim-plant-share:${user.userId}:${shortCode}:${timestamp}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/claim-plant-share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ shortCode, timestamp, signature }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.encryptedPlantKey || !data.sharedPlantId) return null;
  return { encryptedPlantKey: data.encryptedPlantKey, sharedPlantId: data.sharedPlantId, mode: data.mode };
}

// ─── Pull and preview a shared plant (after claiming) ────────────────────

export async function pullSharedPlantPreview(
  sharedPlantId: string,
  plantPrivateKeyBase64: string,
  user: SyncUser
): Promise<PlantShareObject | null> {
  const remote = await fetchSharedPlant(sharedPlantId, user);
  if (!remote) return null;
  try {
    return await decryptPlantShareObject(remote.encryptedData, plantPrivateKeyBase64);
  } catch {
    return null;
  }
}
