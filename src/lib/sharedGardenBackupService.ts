import { SharedGardenDatabase, type SharedGardenSnapshot } from './sharedGardenDatabase';
import { encryptWithPublicKey, decryptWithPrivateKey } from './cryptoService';

const SNAPSHOT_FORMAT_VERSION = 1;

interface SnapshotMetadata {
  version: number;
  gardenName: string;
  createdAt: number;
}

interface SnapshotEnvelope {
  metadata: SnapshotMetadata;
  snapshot: SharedGardenSnapshot;
}

export async function exportEncryptedSnapshot(
  gardenId: string,
  gardenName: string,
  publicKeyBase64: string
): Promise<Blob> {
  await SharedGardenDatabase.init(gardenId);
  const snapshot = SharedGardenDatabase.getFullSnapshot(gardenId);

  const envelope: SnapshotEnvelope = {
    metadata: {
      version: SNAPSHOT_FORMAT_VERSION,
      gardenName,
      createdAt: Date.now(),
    },
    snapshot,
  };

  const json = JSON.stringify(envelope);
  const encrypted = await encryptWithPublicKey(json, publicKeyBase64);

  return new Blob([JSON.stringify(encrypted)], { type: 'application/octet-stream' });
}

export interface DecryptedSnapshot {
  metadata: SnapshotMetadata;
  snapshot: SharedGardenSnapshot;
}

export async function decryptSnapshotFile(
  file: File,
  privateKeyBase64: string
): Promise<DecryptedSnapshot> {
  const text = await file.text();
  const encryptedObj = JSON.parse(text);
  const json = await decryptWithPrivateKey(encryptedObj, privateKeyBase64);
  const envelope: SnapshotEnvelope = JSON.parse(json);

  if (envelope.metadata.version !== SNAPSHOT_FORMAT_VERSION) {
    throw new Error('Unsupported snapshot version');
  }

  return { metadata: envelope.metadata, snapshot: envelope.snapshot };
}

export function downloadSnapshotBlob(blob: Blob, gardenName: string) {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = gardenName.replace(/\s+/g, '-').toLowerCase();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}-snapshot-${date}.gardenbackup`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
