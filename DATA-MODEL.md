# DATA-MODEL.md — Full Data Model, Schema, Types, and API Contracts

## Overview

Garden uses two data layers:
1. **Local (AlaSQL + localStorage)** — primary store; the authoritative source of truth; fully offline.
2. **Remote (Supabase Postgres)** — secondary store; holds only encrypted backups, public keys, and image metadata.

No plaintext user data (plant names, activity notes, contact info) is ever stored in Supabase. The `autocomplete_values` table stores shared, anonymized text strings (learning sources, proven capacities) contributed voluntarily by users — these contain no names or identifiers.

---

## 1. Local Database Schema (AlaSQL / localStorage)

The local database is named `GardenDB` and is backed by localStorage via AlaSQL's `LOCALSTORAGE DATABASE` feature. All tables are created by `DatabaseService.init()` on first launch.

---

### 1.1 `plants`

Represents a person (soul) in the user's garden.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `name` | STRING | NOT NULL | Person's name (display label) |
| `email` | STRING | nullable | Optional contact email |
| `phone` | STRING | nullable | Optional contact phone |
| `last_interaction` | NUMBER | DEFAULT 0 | Unix ms timestamp of most recent Tending or Watering |
| `created_at` | NUMBER | NOT NULL | Unix ms timestamp of plant creation |
| `care_frequency_multiplier` | NUMBER | DEFAULT 2 | Numeric component of care frequency |
| `care_frequency_unit` | STRING | DEFAULT 'weeks' | 'days' or 'weeks' |
| `next_scheduled_care` | NUMBER | NOT NULL | Unix ms timestamp when next care is due |
| `last_cared_for` | NUMBER | NOT NULL | Unix ms timestamp of last care event (Tending or Watering) |
| `description` | STRING | nullable | Free-text description of the person |
| `additional_info` | STRING | nullable | JSON string for custom key/value metadata. Also carries `image_id` (UUID) when the plant has an uploaded image, used as the cross-device sync signal |

**TypeScript Interface:**
```typescript
interface Plant {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  last_interaction: number;
  created_at: number;
  care_frequency_multiplier: number;
  care_frequency_unit: 'days' | 'weeks';
  next_scheduled_care: number;
  last_cared_for: number;
  additional_info?: string; // JSON — may contain { image_id, age_info, location }
}
```

**Care Clock Logic:**
```
care_period_ms = care_frequency_multiplier * (unit === 'weeks' ? 7 * 86400000 : 86400000)
next_scheduled_care = last_cared_for + care_period_ms
```

**Urgency Calculation** (at render time):
```
ratio = (now - last_cared_for) / care_period_ms
healthy:  ratio <= 1
mild:     1 < ratio <= 3
severe:   ratio > 3
```

---

### 1.2 `tendings`

A Tending activity — quality time with the person (conversation, coffee, meal, call, etc.).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `datetime` | NUMBER | NOT NULL | Unix ms timestamp when the activity occurred |
| `type` | STRING | NOT NULL | 'conversation' / 'coffee' / 'meal' / 'call' / 'message' / 'activity' / [custom] |
| `summary` | STRING | nullable | Free-text summary of the interaction |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Tending {
  id: string;
  plant_id: string;
  datetime: number;
  type: string;
  summary: string;
  additional_info?: string;
}
```

**Side effects on write:** Updates `plants.last_interaction` and triggers care clock reset via `updatePlantCare()`.

---

### 1.3 `waterings`

A Watering activity — sharing sacred writings or studying together.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `datetime` | NUMBER | NOT NULL | Unix ms timestamp |
| `source` | STRING | NOT NULL | What was shared (book, passage, topic) |
| `progress_description` | STRING | nullable | How the study went, reflections |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Watering {
  id: string;
  plant_id: string;
  datetime: number;
  source: string;
  progress_description: string;
  additional_info?: string;
}
```

**Side effects on write:** Same as Tending — resets care clock.

---

### 1.4 `sunlight`

A Sunlight activity — prayer for the person.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `datetime` | NUMBER | NOT NULL | Unix ms timestamp |
| `topic` | STRING | NOT NULL | What was prayed for |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Sunlight {
  id: string;
  plant_id: string;
  datetime: number;
  topic: string;
  additional_info?: string;
}
```

**Note:** Sunlight does NOT update the care clock. It is a supplementary spiritual act.

---

### 1.5 `fruits`

A Fruit activity — a selfless act of service performed by the person.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `datetime` | NUMBER | NOT NULL | Unix ms timestamp |
| `description` | STRING | NOT NULL | Description of the service act |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Fruit {
  id: string;
  plant_id: string;
  datetime: number;
  description: string;
  additional_info?: string;
}
```

**Side effects:** If at least one Fruit record exists, the plant card shows the fruit overlay SVG.

---

### 1.6 `prunings`

A Pruning activity — a difficult conversation or correction.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `datetime` | NUMBER | NOT NULL | Unix ms timestamp |
| `difficulty` | STRING | NOT NULL | 'easy' / 'medium' / 'hard' |
| `description` | STRING | nullable | What was discussed |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Pruning {
  id: string;
  plant_id: string;
  datetime: number;
  difficulty: string;
  description: string;
  additional_info?: string;
}
```

---

### 1.7 `companions`

A Companion record — remembers a known relationship between two people in the garden.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_a_id` | STRING | NOT NULL | References `plants.id` (one side of relationship) |
| `relationship_descriptor` | STRING | NOT NULL | Free text: "siblings," "close friends," "mentor/mentee" |
| `plant_b_id` | STRING | NOT NULL | References `plants.id` (other side of relationship) |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Companion {
  id: string;
  plant_a_id: string;
  relationship_descriptor: string;
  plant_b_id: string;
  additional_info?: string;
}
```

**Query pattern:** Always query by `plant_a_id OR plant_b_id` to fetch both sides:
```sql
SELECT * FROM companions WHERE plant_a_id = ? OR plant_b_id = ?
```

---

### 1.8 `scheduled_events`

Future care reminders — Tending or Watering events scheduled for a specific date/time.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `event_type` | STRING | NOT NULL | 'tending' or 'watering' |
| `scheduled_date` | NUMBER | NOT NULL | Unix ms timestamp of the scheduled event |
| `description` | STRING | nullable | Optional reminder note |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface ScheduledEvent {
  id: string;
  plant_id: string;
  event_type: 'tending' | 'watering';
  scheduled_date: number;
  description?: string;
  additional_info?: string;
}
```

---

### 1.9 `plots`

A named group of plants.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `name` | STRING | NOT NULL | Plot name (e.g., "Family," "Prayer Group") |
| `description` | STRING | nullable | Optional description |
| `created_at` | NUMBER | NOT NULL | Unix ms timestamp |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Plot {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  additional_info?: string;
}
```

---

### 1.10 `plot_memberships`

Many-to-many join between plots and plants.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plot_id` | STRING | NOT NULL | References `plots.id` |
| `plant_id` | STRING | NOT NULL | References `plants.id` |

**TypeScript Interface:**
```typescript
interface PlotMembership {
  id: string;
  plot_id: string;
  plant_id: string;
}

interface PlotWithMembers extends Plot {
  members: Plant[];
}
```

---

### 1.11 `buds`

A Bud — a potential interest, gift, or quality identified in the person. Represents dormant capacity not yet developed.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `text` | STRING | NOT NULL | Label for the bud (e.g., "teaching", "music") |
| `created_at` | NUMBER | NOT NULL | Unix ms timestamp |

**TypeScript Interface:**
```typescript
interface Bud {
  id: string;
  plant_id: string;
  text: string;
  created_at: number;
}
```

---

### 1.12 `notchings`

A Notching record — a systematic study session using the Ruhi Institute curriculum. Tracks which book, units, and sections were studied and how many sections were covered.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `datetime` | NUMBER | NOT NULL | Unix ms timestamp of the study session |
| `book` | STRING | NOT NULL | Book identifier (e.g., `ruhi_1`, `ruhi_3`) |
| `start_unit` | NUMBER | NOT NULL | Starting unit number |
| `start_section` | NUMBER | NOT NULL | Starting section number within the start unit |
| `end_unit` | NUMBER | NOT NULL | Ending unit number |
| `end_section` | NUMBER | NOT NULL | Ending section number within the end unit |
| `sections_studied` | NUMBER | NOT NULL | Computed count of sections covered |
| `progress_description` | STRING | nullable | Free-text reflection on the session |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Notching {
  id: string;
  plant_id: string;
  datetime: number;
  book: string;
  start_unit: number;
  start_section: number;
  end_unit: number;
  end_section: number;
  sections_studied: number;
  progress_description?: string;
  additional_info?: string;
}
```

**Display format:** `{book.replace('ruhi_', 'Ruhi Book ')} — U{start_unit}S{start_section} to U{end_unit}S{end_section}`

---

### 1.13 `capabilities`

A Capability — a developed or proven capacity for service, confirmed through action.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `plant_id` | STRING | NOT NULL | References `plants.id` |
| `text` | STRING | NOT NULL | Label for the capability (e.g., "tutoring", "children's class") |
| `created_at` | NUMBER | NOT NULL | Unix ms timestamp |

**TypeScript Interface:**
```typescript
interface Capability {
  id: string;
  plant_id: string;
  text: string;
  created_at: number;
}
```

---

## 2. localStorage Key Map

Beyond the AlaSQL `GardenDB` tables (stored under the `GardenDB` localStorage prefix by AlaSQL), these additional keys are used:

| Key Pattern | Value Type | Description |
|---|---|---|
| `garden-key` | JSON string | Full `User` object with all keys |
| `user_id` | string | User UUID |
| `signature_private_key` | Base64 string | RSA-PSS private key (PKCS8) |
| `signature_public_key` | Base64 string | RSA-PSS public key (SPKI) |
| `garden-restored-from-key` | `'true'` | Suppresses key backup prompt after restore |
| `key-backup-dismissed` | `'true'` | User has downloaded key file |
| `plant_image_{plantId}` | JSON string | `{ plantId, dataUrl, timestamp, imageId }` — local cached image (large version, base64 data URL) |
| `plant_image_{plantId}_small` | JSON string | `{ plantId, dataUrl, timestamp, imageId }` — local cached thumbnail (100px, base64 data URL) |
| `has_pending_local_changes` | `'true'` | Set on any write; cleared after successful cloud backup sync |
| `autocomplete_cache_{type}` | JSON string | `{ values: [...], fetchedAt: number }` — 24-hour local cache of top autocomplete suggestions for a given type |

**User Object Structure (garden-key.json):**
```typescript
interface User {
  id: string;               // UUID v4
  publicKey: string;        // RSA-OAEP public key, Base64 SPKI
  privateKey: string;       // RSA-OAEP private key, Base64 PKCS8
  signingPublicKey: string; // RSA-PSS public key, Base64 SPKI
  signingPrivateKey: string;// RSA-PSS private key, Base64 PKCS8
}
```

**`additional_info` sub-fields on `plants`:**

`plants.additional_info` is a JSON string. Recognized sub-fields written by the app:

```typescript
interface PlantAdditionalInfo {
  image_id?: string;       // UUID of the plant's uploaded image — used by imageSync to detect missing local cache
  age_info?: {             // Written by AgePicker
    age: number;
    timestamp_age_poll: number;  // Unix ms when the age was recorded; used to compute current effective age
    is_over_21: boolean;
  };
  location?: {             // Written by LocationPicker
    lat: number;
    lng: number;
  };
}
```

---

## 3. Cloud Database Schema (Supabase Postgres)

### 3.1 `users` Table

Stores public keys and encrypted backups. No plaintext user data.

```sql
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  public_key text NOT NULL,
  signature_public_key text NOT NULL,
  encrypted_backup text,
  last_modified timestamptz DEFAULT now(),
  created timestamptz DEFAULT now(),
  encryption_key text,
  image_count integer DEFAULT 0
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | User's UUID (self-assigned, from garden key) |
| `public_key` | text | RSA-OAEP public key (Base64 SPKI) for encrypting data to this user |
| `signature_public_key` | text | RSA-PSS public key (Base64 SPKI) for verifying backup signatures |
| `encrypted_backup` | text | Encrypted JSON string: `{ encryptedAesKey, iv, encryptedData }` (all Base64) |
| `last_modified` | timestamptz | Timestamp of last successful backup upload |
| `created` | timestamptz | Row creation timestamp |
| `encryption_key` | text | nullable, legacy — not actively used |
| `image_count` | integer | Running count of uploaded images; capped at 100 |

**RLS Policies:**
- Anyone can read (public keys are not sensitive; needed for plant sharing).
- Service role only can insert and update (all writes go through Edge Functions).

---

### 3.2 `autocomplete_values` Table

Stores community-shared autocomplete suggestions for learning sources and proven capacities. Contains no names, identifiers, or private data — only short text strings contributed voluntarily.

```sql
CREATE TABLE IF NOT EXISTS autocomplete_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  count integer DEFAULT 1,
  type text NOT NULL,           -- 'learning_source' | 'proven_capacity'
  language text DEFAULT 'en_US',
  last_updated_by uuid,
  created_at timestamptz DEFAULT now()
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Row UUID |
| `text` | text | The autocomplete string (e.g., "Ruhi Book 1", "tutoring") |
| `count` | integer | Number of users who have used this value |
| `type` | text | Category: `learning_source` or `proven_capacity` |
| `language` | text | Locale of the value; currently always `en_US` |
| `last_updated_by` | uuid | UUID of the last user who incremented the count; prevents a single user from inflating counts |

**Access pattern:** `supabaseService.fetchTop200AutocompleteValues(type)` returns the top 200 entries ordered by count. `upsertAutocompleteValue(text, userId, type)` inserts or increments.

**RLS Policies:**
- `SELECT`: public (any user can read suggestions).
- `INSERT`/`UPDATE`: authenticated users (via the Supabase anon key from the client).

---

### 3.4 `shared_plants` Table

For the planned plant sharing feature. Holds encrypted plant data accessible to authorized users.

```sql
CREATE TABLE IF NOT EXISTS shared_plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_data text NOT NULL,
  authorized_users jsonb NOT NULL DEFAULT '[]',
  last_modified timestamptz DEFAULT now(),
  user_last_modified uuid
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Share record UUID |
| `encrypted_data` | text | Plant data encrypted with recipient's public key |
| `authorized_users` | jsonb | Array of user UUIDs who may access this record |
| `last_modified` | timestamptz | Last update timestamp |
| `user_last_modified` | uuid | Which user last modified this record |

**RLS Policies:**
- Anyone can read (data is encrypted; reading ciphertext reveals nothing).
- Service role only can insert and update.

---

### 3.5 `plant_images` Table

Stores E2EE encrypted image data directly in Postgres. No plaintext image content, no CDN URLs. Each plant has at most one image record (one row per `user_id + plant_id`), holding two encrypted blobs: a full-resolution version (720px) and a thumbnail (100px).

```sql
CREATE TABLE IF NOT EXISTS plant_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plant_id text NOT NULL,
  image_id text NOT NULL,
  image_data_large text NOT NULL,
  image_data_small text NOT NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  UNIQUE(user_id, plant_id)
);

CREATE INDEX IF NOT EXISTS idx_plant_images_user_id ON plant_images(user_id);
CREATE INDEX IF NOT EXISTS idx_plant_images_plant_id ON plant_images(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_images_image_id ON plant_images(image_id);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Row UUID |
| `user_id` | uuid | FK to `users.id` — image owner |
| `plant_id` | text | Local plant UUID this image belongs to |
| `image_id` | text | Client-generated UUID; used as the cross-device sync signal stored in `plant.additional_info` |
| `image_data_large` | text | AES-GCM encrypted base64 of the 720px image |
| `image_data_small` | text | AES-GCM encrypted base64 of the 100px thumbnail |
| `created_at` | timestamptz | Upload timestamp |
| `metadata` | jsonb | Reserved for future extensibility |

**Uniqueness constraint:** `UNIQUE(user_id, plant_id)` — one image per plant. Uploading a new image for a plant upserts the row, replacing the previous image.

**Quota:** Maximum 100 rows per user, counted by the `upload-plant-image` Edge Function before inserting a new row. Updating an existing plant's image does not consume additional quota.

**RLS Policies:**
- `SELECT`: authenticated users can read only their own rows (`auth.uid() = user_id`).
  - Note: the app uses the user's UUID as the Bearer token, not Supabase Auth. Edge Functions use service role for all writes.
- `INSERT`/`UPDATE`/`DELETE`: service role only (all writes through Edge Functions with RSA-PSS signature verification).

---

## 4. Encrypted Backup Format

The encrypted backup is the serialized form of the full local database. It is created by `DatabaseService.getFullBackupAsObject()` and encrypted by `cryptoService.encryptData()`.

### Plaintext Backup Object
```typescript
interface BackupObject {
  plants: Plant[];
  tendings: Tending[];
  waterings: Watering[];
  sunlight: Sunlight[];
  fruits: Fruit[];
  prunings: Pruning[];
  companions: Companion[];
  scheduled_events: ScheduledEvent[];
  plots: Plot[];
  plot_memberships: PlotMembership[];
  buds: Bud[];
  notchings: Notching[];
  capabilities: Capability[];
  backup_timestamp: number;
  schema_version?: number; // To be added — currently absent
}
```

### Encrypted Backup Structure (stored in `users.encrypted_backup`)
```typescript
interface EncryptedBackup {
  encryptedAesKey: string; // RSA-OAEP encrypted AES-256 key, Base64
  iv: string;              // AES-GCM initialization vector, Base64 (12 bytes)
  encryptedData: string;   // AES-GCM ciphertext of JSON.stringify(BackupObject), Base64
}
```

### Encryption Algorithm
1. Generate random 256-bit AES key.
2. Generate random 12-byte IV.
3. `ciphertext = AES-GCM-Encrypt(key=aesKey, iv=iv, data=JSON.stringify(BackupObject))`.
4. `wrappedKey = RSA-OAEP-Encrypt(key=userPublicKey, data=aesKey)`.
5. Output: `{ encryptedAesKey: base64(wrappedKey), iv: base64(iv), encryptedData: base64(ciphertext) }`.

### Backup Signature
Computed by `signData(JSON.stringify(EncryptedBackup), rsaPssPrivateKey)` using RSA-PSS with SHA-256 and salt length 32. The Base64 signature is sent alongside the encrypted backup to the `update-backup` Edge Function.

---

## 5. Supabase Edge Function API Contracts

All Edge Functions are deployed to `https://{PROJECT_REF}.supabase.co/functions/v1/`.

### 5.1 `POST /functions/v1/register-user`

Register a new user with their public keys.

**Request:**
```json
{
  "userId": "uuid-string",
  "encryptionPublicKey": "base64-spki-string",
  "signingPublicKey": "base64-spki-string"
}
```

**Response 200:**
```json
{
  "message": "User registered successfully",
  "userId": "uuid-string"
}
```

**Response 400:**
```json
{ "error": "Missing required fields" }
```

**Response 409:**
```json
{ "error": "User already exists" }
```

**Headers required:** `Authorization: Bearer {SUPABASE_ANON_KEY}`

---

### 5.2 `POST /functions/v1/update-backup`

Upload an encrypted backup. Requires valid RSA-PSS signature.

**Request:**
```json
{
  "userId": "uuid-string",
  "encryptedBackup": "{\"encryptedAesKey\":\"...\",\"iv\":\"...\",\"encryptedData\":\"...\"}",
  "signature": "base64-rsa-pss-signature"
}
```

**Response 200:**
```json
{
  "message": "Backup updated successfully",
  "timestamp": "2026-03-18T12:00:00.000Z"
}
```

**Response 400:**
```json
{ "error": "Invalid backup structure" }
```

**Response 403:**
```json
{ "error": "Invalid signature" }
```

**Response 404:**
```json
{ "error": "User not found" }
```

**Headers required:**
```
Authorization: Bearer {SUPABASE_ANON_KEY}
x-user-id: {userId}
Content-Type: application/json
```

**Server-side verification process:**
1. Parse the `encryptedBackup` string to validate it contains `encryptedAesKey`, `iv`, and `encryptedData`.
2. Fetch `signature_public_key` from `users` table for the given `userId`.
3. Convert Base64 SPKI key to PEM format.
4. Import key using `SubtleCrypto.importKey('spki', ...)`.
5. Verify: `SubtleCrypto.verify({ name: 'RSA-PSS', saltLength: 32 }, publicKey, signatureBytes, data)`.
6. If valid: `UPDATE users SET encrypted_backup = ?, last_modified = now() WHERE id = ?`.

---

### 5.3 `POST /functions/v1/upload-plant-image`

Upload an E2EE-encrypted image for a plant. Requires RSA-PSS signature. Upserts (replaces) any existing image for the same plant.

**Request (JSON):**
```json
{
  "plantId": "uuid-string",
  "imageId": "uuid-string",
  "encryptedLarge": "base64-string",
  "encryptedSmall": "base64-string",
  "signature": "base64-rsa-pss-signature",
  "timestamp": 1234567890000
}
```

**Response 200:**
```json
{ "success": true, "imageId": "uuid-string" }
```

**Response 400:**
```json
{ "error": "Missing required fields" }
```

**Response 401:**
```json
{ "error": "Timestamp expired" }
```

**Response 401:**
```json
{ "error": "Invalid signature" }
```

**Response 429:**
```json
{ "error": "Image quota reached" }
```

**Headers required:**
```
Authorization: Bearer {userId}
Content-Type: application/json
```

**Timestamp window:** The timestamp must be within 5 minutes of server time.

**Signature verification (RSA-PSS, SHA-256, salt 32):**
```
message = imageId + ":" + timestamp
```

**Quota logic:** The function counts existing rows for the user. If the count is ≥ 100 AND no existing row exists for this `plant_id`, it returns 429. Updating an existing plant's image does not count against the quota.

---

### 5.4 `POST /functions/v1/get-plant-image`

Retrieve an encrypted image blob for a plant. Requires RSA-PSS signature.

**Request (JSON):**
```json
{
  "plantId": "uuid-string",
  "size": "small" | "large",
  "signature": "base64-rsa-pss-signature",
  "timestamp": 1234567890000
}
```

**Response 200:**
```json
{
  "success": true,
  "imageId": "uuid-string",
  "encryptedData": "base64-string"
}
```

**Response 404:**
```json
{ "error": "Image not found" }
```

**Headers required:**
```
Authorization: Bearer {userId}
Content-Type: application/json
```

**Signature message:** `"fetch:" + plantId + ":" + timestamp`

---

### 5.5 `POST /functions/v1/delete-plant-image`

Delete a plant's image from `plant_images`. Requires RSA-PSS signature.

**Request (JSON):**
```json
{
  "plantId": "uuid-string",
  "signature": "base64-rsa-pss-signature",
  "timestamp": 1234567890000
}
```

**Response 200:**
```json
{ "success": true }
```

**Response 401/404:** Standard auth/not-found errors.

**Signature message:** `"delete:" + plantId + ":" + timestamp`

**Side effects:** Deletes all rows in `plant_images` where `user_id = userId AND plant_id = plantId`.

---

## 6. Service Worker Data Contracts

The service worker (`public/custom-sw.js`) maintains two IndexedDB stores:

### 6.1 Notification Store (`notification-db` / `notifications`)

```typescript
interface ScheduledNotification {
  plantId: string;
  plantName: string;
  scheduledTime: number;  // Unix ms
  title: string;
  body: string;
}
```

**Messages accepted:**
- `{ type: 'SCHEDULE_NOTIFICATION', plantId, plantName, scheduledTime, title, body }`
- `{ type: 'CANCEL_NOTIFICATION', plantId }`
- `{ type: 'CHECK_MISSED_CARE' }`

### 6.2 Upload Queue (`upload-queue-db` / `uploads`)

```typescript
interface QueuedUpload {
  id: string;
  plantId: string;
  plantName: string;
  imageDataUrls: string[];
  timestamp: number;
  retryCount: number;
}
```

**Messages accepted:**
- `{ type: 'QUEUE_UPLOAD', plantId, plantName, images }`
- `{ type: 'PROCESS_QUEUE' }`

---

## 7. Relationships Diagram (Text)

```
plants ──┬── tendings         (1:many)
         ├── waterings         (1:many)
         ├── sunlight          (1:many)
         ├── fruits            (1:many)
         ├── prunings          (1:many)
         ├── scheduled_events  (1:many)
         ├── buds              (1:many)
         ├── notchings         (1:many)
         ├── capabilities      (1:many)
         └── companions        (many:many self-join via plant_a_id / plant_b_id)

plots ───── plot_memberships ── plants    (many:many)

users (Supabase) ── plant_images (Supabase)      (1:many, max 100 per user)
users (Supabase) ── encrypted_backup             (1:1, JSON blob in users.encrypted_backup)
users (Supabase) ── shared_plants                (many:many via authorized_users JSONB)
autocomplete_values (Supabase)                   (shared/global, not user-scoped)
```

---

## 8. Schema Migration Policy

**Current schema version:** (unversioned — to be addressed as debt)

**Required process for any schema change:**
1. Add new column to the AlaSQL `CREATE TABLE` statement in `DatabaseService.init()`.
2. Increment `schema_version` in `getFullBackupAsObject()`.
3. Update `restoreBackupFromObject()` to handle the missing field gracefully for all older schema versions (default values for new columns).
4. Update the `BackupObject` TypeScript interface.
5. If the change affects Supabase tables, write a new migration file in `supabase/migrations/` using the `mcp__supabase__apply_migration` tool.
6. Document the change in `MEMORY.md`.

**Never drop a column.** Existing backups may be missing the column. Add nullable columns only.
