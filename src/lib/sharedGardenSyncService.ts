/**
 * Shared Garden Sync Engine — Snapshot + Delta Log per garden.
 *
 * Mirrors sharedBackupService.ts but operates on full gardens instead of
 * individual plants. Key differences:
 * - No roles — all members are co-gardeners with equal write access.
 * - Conflict detection: only tombstone conflicts require user attention.
 *   All other merges are pure last-write-wins by individual record updated_at.
 * - Compaction: whoever syncs first when deltas > 50 performs compaction.
 * - After applying incoming deltas, own activities are mirrored to personal garden.
 */

import {
  SharedGardenDatabase,
  type SharedGardenObject,
  type SharedGardenDelta,
  type SharedGardenRef,
  getSharedGardenRefs,
  setGardenSyncTs,
  markGardenDisconnected,
  addSharedGardenRef,
} from './sharedGardenDatabase';
import { importCryptoKey, encryptData, decryptData, generateRSAKeyPair, exportCryptoKey, generateEphemeralRSAKeyPair, encryptWithPublicKey } from './cryptoService';
import { signData, importSigningKey } from './signatureService';
import { mirrorActivityToPersonalGarden } from './plantLinkService';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const COMPACTION_THRESHOLD = 50;

export interface GardenSyncUser {
  userId: string;
  signingPrivateKey: string;
}

export interface TombstoneConflict {
  delta: SharedGardenDelta;
  reason: string;
}

export type ConflictResolver = (conflicts: TombstoneConflict[]) => Promise<'keep' | 'discard'[]>;

// ─── Signature helper ─────────────────────────────────────────────────────────

async function buildSignature(message: string, signingPrivateKey: string): Promise<string> {
  const key = await importSigningKey(signingPrivateKey, 'pkcs8', ['sign']);
  return signData(message, key);
}

// ─── Encrypt / decrypt garden objects ─────────────────────────────────────────

async function encryptGardenObject(obj: SharedGardenObject, publicKeyBase64: string): Promise<string> {
  const publicKey = await importCryptoKey(publicKeyBase64, 'spki', ['encrypt']);
  const json = JSON.stringify(obj);
  const encrypted = await encryptData(json, publicKey);
  return JSON.stringify(encrypted);
}

async function decryptGardenObject(encryptedStr: string, privateKeyBase64: string): Promise<SharedGardenObject> {
  const privateKey = await importCryptoKey(privateKeyBase64, 'pkcs8', ['decrypt']);
  const encrypted = JSON.parse(encryptedStr);
  const json = await decryptData(encrypted, privateKey);
  return JSON.parse(json);
}

// ─── Edge function callers ────────────────────────────────────────────────────

async function fetchSharedGarden(
  sharedGardenId: string,
  user: GardenSyncUser
): Promise<{ encryptedData: string; lastModified: string; authorizedUsers: string[] } | null> {
  const timestamp = Date.now();
  const message = `sync-shared-garden:${user.userId}:${sharedGardenId}:read:${timestamp}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-shared-garden`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sharedGardenId, action: 'read', timestamp, signature }),
  });

  if (res.status === 403) return null; // removed from garden
  if (!res.ok) return null;
  const data = await res.json();
  return data.encryptedData
    ? { encryptedData: data.encryptedData, lastModified: data.lastModified, authorizedUsers: data.authorizedUsers ?? [] }
    : null;
}

async function pushSharedGarden(
  sharedGardenId: string,
  encryptedData: string,
  clientLastModified: string | null,
  isCompaction: boolean,
  user: GardenSyncUser
): Promise<{ success: boolean; conflict?: { lastModified: string; encryptedData: string } }> {
  const timestamp = Date.now();
  const message = `sync-shared-garden:${user.userId}:${sharedGardenId}:write:${timestamp}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-shared-garden`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sharedGardenId, action: 'write', encryptedData, clientLastModified, isCompaction, timestamp, signature }),
  });

  if (res.status === 409) {
    const data = await res.json();
    return { success: false, conflict: { lastModified: data.lastModified, encryptedData: data.encryptedData } };
  }
  return { success: res.ok };
}

async function removeMemberOnServer(
  sharedGardenId: string,
  targetUserId: string,
  user: GardenSyncUser
): Promise<boolean> {
  const timestamp = Date.now();
  const message = `sync-shared-garden:${user.userId}:${sharedGardenId}:remove-member:${timestamp}`;
  const signature = await buildSignature(message, user.signingPrivateKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-shared-garden`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sharedGardenId, action: 'remove-member', targetUserId, timestamp, signature }),
  });
  return res.ok;
}

// ─── Per-garden sync ──────────────────────────────────────────────────────────

export async function syncSharedGarden(
  ref: SharedGardenRef,
  user: GardenSyncUser,
  onConflict?: ConflictResolver
): Promise<{ disconnected?: boolean; conflicts?: TombstoneConflict[] }> {
  if (!navigator.onLine) return {};

  const gardenPrivKeyBase64 = localStorage.getItem(`shared_garden_key_${ref.gardenId}`);
  if (!gardenPrivKeyBase64) return {};

  try {
    await SharedGardenDatabase.init(ref.gardenId);

    const remote = await fetchSharedGarden(ref.sharedGardenId, user);
    if (!remote) {
      // 403 = removed from garden
      markGardenDisconnected(ref.gardenId);
      return { disconnected: true };
    }

    const remoteObj = await decryptGardenObject(remote.encryptedData, gardenPrivKeyBase64);
    const lastSyncTs = ref.lastSyncTs;

    // Identify and apply new incoming deltas
    const newDeltas = remoteObj.deltas.filter(d => d.ts > lastSyncTs);
    const conflicts = SharedGardenDatabase.applyDeltas(ref.gardenId, newDeltas);

    if (conflicts.length > 0 && onConflict) {
      // Surface conflicts to UI — user decides per item
      await onConflict(conflicts);
    }

    // Mirror own incoming activities to personal garden
    for (const delta of newDeltas) {
      if (delta.type !== 'DELETE' && delta.data && delta.authored_by_uuid === user.userId) {
        const activityTables = ['tendings', 'waterings', 'sunlight', 'fruits', 'prunings'];
        if (activityTables.includes(delta.table)) {
          await mirrorActivityToPersonalGarden(
            ref.gardenId,
            delta.data.plant_id as string,
            delta.table,
            delta.data,
            delta.authored_by_uuid,
            user.userId
          ).catch(() => {});
        }
      }
    }

    // Gather local changes since last sync
    const myDisplayName = SharedGardenDatabase.getMember(ref.gardenId, user.userId)?.display_name ?? 'Unknown';
    const localDeltas = SharedGardenDatabase.getDeltasSince(ref.gardenId, lastSyncTs, user.userId, myDisplayName);

    if (localDeltas.length === 0 && newDeltas.length === 0) {
      setGardenSyncTs(ref.gardenId, Date.now());
      return {};
    }

    const updatedDeltas = [...remoteObj.deltas, ...localDeltas];
    const shouldCompact = updatedDeltas.length > COMPACTION_THRESHOLD;

    let updatedObj: SharedGardenObject;

    if (shouldCompact) {
      const freshSnapshot = SharedGardenDatabase.getFullSnapshot(ref.gardenId);
      updatedObj = { snapshot: freshSnapshot, deltas: [], schema_version: 1, garden_name: remoteObj.garden_name };
      SharedGardenDatabase.purgeTombstones(ref.gardenId);
    } else {
      updatedObj = { ...remoteObj, deltas: updatedDeltas };
    }

    const encryptedStr = await encryptGardenObject(updatedObj, ref.gardenPublicKeyBase64);
    const pushResult = await pushSharedGarden(ref.sharedGardenId, encryptedStr, remote.lastModified, shouldCompact, user);

    if (pushResult.conflict) {
      // Re-fetch, merge local deltas, retry once
      const serverObj = await decryptGardenObject(pushResult.conflict.encryptedData, gardenPrivKeyBase64);
      const merged = [...serverObj.deltas, ...localDeltas];
      const retryObj: SharedGardenObject = { ...serverObj, deltas: merged };
      const retryEncrypted = await encryptGardenObject(retryObj, ref.gardenPublicKeyBase64);
      await pushSharedGarden(ref.sharedGardenId, retryEncrypted, pushResult.conflict.lastModified, false, user);
    }

    setGardenSyncTs(ref.gardenId, Date.now());
    return conflicts.length > 0 ? { conflicts } : {};
  } catch (err) {
    console.error(`Shared garden sync failed for ${ref.gardenId}:`, err);
    return {};
  }
}

// ─── Sync all shared gardens ──────────────────────────────────────────────────

export async function syncAllSharedGardens(
  user: GardenSyncUser,
  onConflict?: ConflictResolver
): Promise<void> {
  const refs = getSharedGardenRefs().filter(r => !r.disconnected);
  for (const ref of refs) {
    await syncSharedGarden(ref, user, onConflict);
  }
}

// ─── Create a new shared garden ───────────────────────────────────────────────

export async function createSharedGarden(
  gardenName: string,
  myDisplayName: string,
  user: GardenSyncUser & { signingPublicKey?: string }
): Promise<{ gardenId: string } | null> {
  // Generate a garden-specific RSA key pair
  const gardenKeyPair = await generateRSAKeyPair();
  const gardenPublicKeyBase64 = await exportCryptoKey(gardenKeyPair.encryptionKeys.publicKey, 'spki');
  const gardenPrivateKeyBase64 = await exportCryptoKey(gardenKeyPair.encryptionKeys.privateKey, 'pkcs8');

  // Create local garden ID
  const gardenId = uuidv4();

  // Initialize local DB
  await SharedGardenDatabase.init(gardenId);

  // Add creator as member
  SharedGardenDatabase.upsertMember(gardenId, {
    id: uuidv4(),
    user_uuid: user.userId,
    display_name: myDisplayName,
    joined_at: Date.now(),
    added_by_uuid: user.userId,
  });

  // Build initial snapshot
  const snapshot = SharedGardenDatabase.getFullSnapshot(gardenId);
  const gardenObj: SharedGardenObject = { snapshot, deltas: [], schema_version: 1, garden_name: gardenName };

  // Encrypt and upload
  const encryptedStr = await encryptGardenObject(gardenObj, gardenPublicKeyBase64);

  const timestamp = Date.now();
  const message = `create-shared-garden:${user.userId}:${timestamp}:${gardenName}`;
  const signingKey = await importSigningKey(user.signingPrivateKey, 'pkcs8', ['sign']);
  const signature = await signData(message, signingKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-shared-garden`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      encryptedData: encryptedStr,
      gardenPublicKey: gardenPublicKeyBase64,
      gardenName,
      displayName: myDisplayName,
      timestamp,
      signature,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const sharedGardenId: string = data.sharedGardenId;

  // Store garden key locally
  localStorage.setItem(`shared_garden_key_${gardenId}`, gardenPrivateKeyBase64);

  // Register garden ref
  addSharedGardenRef({
    gardenId,
    sharedGardenId,
    gardenName,
    myDisplayName,
    myUuid: user.userId,
    gardenPublicKeyBase64,
    lastSyncTs: Date.now(),
  });

  return { gardenId };
}

// ─── Create an invitation link ────────────────────────────────────────────────

export async function createGardenInvite(
  gardenId: string,
  inviteeDisplayName: string,
  user: GardenSyncUser
): Promise<{ inviteUrl: string } | null> {
  const ref = getSharedGardenRefs().find(r => r.gardenId === gardenId);
  if (!ref) return null;

  const gardenPrivKeyBase64 = localStorage.getItem(`shared_garden_key_${gardenId}`);
  if (!gardenPrivKeyBase64) return null;

  // Generate ephemeral handshake key pair
  const ephemeral = await generateEphemeralRSAKeyPair();

  // Encrypt the garden private key with the ephemeral public key
  const encryptedGardenKey = JSON.stringify(
    await encryptWithPublicKey(gardenPrivKeyBase64, ephemeral.publicKeyBase64)
  );

  // Create claim via edge function
  const timestamp = Date.now();
  const message = `create-garden-share-claim:${user.userId}:${ref.sharedGardenId}:${timestamp}`;
  const signingKey = await importSigningKey(user.signingPrivateKey, 'pkcs8', ['sign']);
  const signature = await signData(message, signingKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-garden-share-claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      sharedGardenId: ref.sharedGardenId,
      encryptedGardenKey,
      inviteeDisplayName,
      timestamp,
      signature,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.shortCode) return null;

  const baseUrl = `${window.location.origin}/join-shared-garden/${ref.sharedGardenId}`;
  const fragment = `gate=${data.shortCode}&key=${encodeURIComponent(ephemeral.privateKeyBase64)}&gid=${gardenId}`;
  return { inviteUrl: `${baseUrl}#${fragment}` };
}

// ─── Claim an invitation (join a shared garden) ───────────────────────────────

export async function claimGardenInvite(
  sharedGardenId: string,
  shortCode: string,
  ephemeralPrivKeyBase64: string,
  myDisplayName: string,
  user: GardenSyncUser
): Promise<{ gardenId: string; gardenName: string } | null> {
  const timestamp = Date.now();
  const message = `claim-garden-share:${user.userId}:${shortCode}:${timestamp}`;
  const signingKey = await importSigningKey(user.signingPrivateKey, 'pkcs8', ['sign']);
  const signature = await signData(message, signingKey);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/claim-garden-share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.userId}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ shortCode, displayName: myDisplayName, timestamp, signature }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.encryptedGardenKey || !data.sharedGardenId) return null;

  // Decrypt the garden private key using the ephemeral private key
  const ephemeralPrivKey = await importCryptoKey(ephemeralPrivKeyBase64, 'pkcs8', ['decrypt']);
  const encryptedObj = JSON.parse(data.encryptedGardenKey);
  const gardenPrivKeyBase64 = await decryptData(encryptedObj, ephemeralPrivKey);

  // Fetch the encrypted garden object
  const syncUser: GardenSyncUser = user;
  const remote = await fetchSharedGarden(sharedGardenId, syncUser);
  if (!remote) return null;

  const gardenObj = await decryptGardenObject(remote.encryptedData, gardenPrivKeyBase64);

  // Create a local garden ID — use sharedGardenId as gardenId for simplicity
  const gardenId = sharedGardenId;

  // Initialize and populate local DB
  await SharedGardenDatabase.init(gardenId);
  SharedGardenDatabase.applySnapshot(gardenId, gardenObj.snapshot);

  // Apply any outstanding deltas
  SharedGardenDatabase.applyDeltas(gardenId, gardenObj.deltas);

  // Store garden key locally
  localStorage.setItem(`shared_garden_key_${gardenId}`, gardenPrivKeyBase64);

  // Add self as member
  SharedGardenDatabase.upsertMember(gardenId, {
    id: uuidv4(),
    user_uuid: user.userId,
    display_name: myDisplayName,
    joined_at: Date.now(),
    added_by_uuid: user.userId,
  });

  // Register garden ref
  addSharedGardenRef({
    gardenId,
    sharedGardenId,
    gardenName: gardenObj.garden_name,
    myDisplayName,
    myUuid: user.userId,
    gardenPublicKeyBase64: data.gardenPublicKey,
    lastSyncTs: Date.now(),
  });

  return { gardenId, gardenName: gardenObj.garden_name };
}

// ─── Remove a member ──────────────────────────────────────────────────────────

export async function removeMemberFromGarden(
  gardenId: string,
  targetUserId: string,
  actorUuid: string,
  actorDisplayName: string,
  user: GardenSyncUser
): Promise<boolean> {
  const ref = getSharedGardenRefs().find(r => r.gardenId === gardenId);
  if (!ref) return false;

  const ok = await removeMemberOnServer(ref.sharedGardenId, targetUserId, user);
  if (!ok) return false;

  SharedGardenDatabase.removeMember(gardenId, targetUserId);
  SharedGardenDatabase.logChange(
    gardenId, actorUuid, actorDisplayName,
    'remove_member', 'garden_members', targetUserId, targetUserId
  );

  // Trigger sync to propagate the change
  await syncSharedGarden(ref, user);
  return true;
}

// ─── Download garden key file ─────────────────────────────────────────────────

export function downloadGardenKeyFile(gardenId: string): void {
  const ref = getSharedGardenRefs().find(r => r.gardenId === gardenId);
  if (!ref) return;

  const privKey = localStorage.getItem(`shared_garden_key_${gardenId}`);
  if (!privKey) return;

  const keyData = {
    gardenId,
    sharedGardenId: ref.sharedGardenId,
    gardenName: ref.gardenName,
    myUuid: ref.myUuid,
    myDisplayName: ref.myDisplayName,
    gardenPrivateKey: privKey,
    gardenPublicKey: ref.gardenPublicKeyBase64,
  };

  const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ref.gardenName.replace(/\s+/g, '-').toLowerCase()}-garden-key.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Restore from key file ────────────────────────────────────────────────────

export interface GardenKeyFileData {
  gardenId: string;
  sharedGardenId: string;
  gardenName: string;
  myUuid: string;
  myDisplayName: string;
  gardenPrivateKey: string;
  gardenPublicKey: string;
}

export function parseGardenKeyFile(raw: string): GardenKeyFileData | null {
  try {
    const data = JSON.parse(raw);
    const required = ['gardenId','sharedGardenId','gardenName','myUuid','myDisplayName','gardenPrivateKey','gardenPublicKey'];
    if (!required.every(k => typeof data[k] === 'string' && data[k].length > 0)) return null;
    return data as GardenKeyFileData;
  } catch {
    return null;
  }
}

export async function restoreSharedGardenFromKeyFile(
  keyFile: GardenKeyFileData,
  user: GardenSyncUser
): Promise<{ gardenId: string; gardenName: string } | { error: string }> {
  const { gardenId, sharedGardenId, gardenName, myUuid, myDisplayName, gardenPrivateKey, gardenPublicKey } = keyFile;

  // Guard: already on device
  const existing = getSharedGardenRefs().find(r => r.gardenId === gardenId);
  if (existing) {
    return { gardenId, gardenName };
  }

  // Store private key locally
  localStorage.setItem(`shared_garden_key_${gardenId}`, gardenPrivateKey);

  // Register the ref before syncing so syncSharedGarden can find the key
  addSharedGardenRef({
    gardenId,
    sharedGardenId,
    gardenName,
    myDisplayName,
    myUuid,
    gardenPublicKeyBase64: gardenPublicKey,
    lastSyncTs: 0,
  });

  // Init local DB and pull the latest state from the server
  await SharedGardenDatabase.init(gardenId);

  const remote = await fetchSharedGarden(sharedGardenId, user);
  if (!remote) {
    // Clean up the ref we just added — garden is gone or we lack access
    const refs = getSharedGardenRefs().filter(r => r.gardenId !== gardenId);
    localStorage.setItem('shared_garden_refs', JSON.stringify(refs));
    localStorage.removeItem(`shared_garden_key_${gardenId}`);
    return { error: 'Could not reach this garden. The garden may have been deleted or you may have been removed.' };
  }

  const gardenObj = await decryptGardenObject(remote.encryptedData, gardenPrivateKey);

  SharedGardenDatabase.applySnapshot(gardenId, gardenObj.snapshot);
  SharedGardenDatabase.applyDeltas(gardenId, gardenObj.deltas);

  // Ensure we are present as a member with the stored display name
  SharedGardenDatabase.upsertMember(gardenId, {
    id: uuidv4(),
    user_uuid: myUuid,
    display_name: myDisplayName,
    joined_at: Date.now(),
    added_by_uuid: myUuid,
  });

  // Update ref with fresh sync timestamp and confirmed garden name
  addSharedGardenRef({
    gardenId,
    sharedGardenId,
    gardenName: gardenObj.garden_name ?? gardenName,
    myDisplayName,
    myUuid,
    gardenPublicKeyBase64: gardenPublicKey,
    lastSyncTs: Date.now(),
  });

  return { gardenId, gardenName: gardenObj.garden_name ?? gardenName };
}
