# DATA-MODEL.md — Full Data Model, Schema, Types, and API Contracts

## Overview

Garden uses two data layers:
1. **Local (AlaSQL + localStorage)** — primary store; the authoritative source of truth; fully offline.
2. **Remote (Supabase Postgres)** — secondary store; holds only encrypted backups, public keys, and image metadata.

No plaintext user data (plant names, activity notes, contact info) is ever stored in Supabase. The `autocomplete_values` table stores shared, anonymized text strings (learning sources, proven capacities) contributed voluntarily by users — these contain no names or identifiers.

There are three independent local database contexts:

| Database | Backing | Purpose |
|---|---|---|
| `GardenDB` | AlaSQL + localStorage | The user's personal garden — all private plants and activities |
| `SharedGarden_{gardenId}` | AlaSQL + localStorage | One database per shared garden the user belongs to |
| Shared plant refs | localStorage JSON array | Registry of shared plants synced via `sharedBackupService` |

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
| `basic_activity` | STRING | nullable | Optional classification as a core community-building activity type. When set, used as the display title of the fruit entry in the timeline. |
| `additional_info` | STRING | nullable | JSON string for custom metadata |

**TypeScript Interface:**
```typescript
interface Fruit {
  id: string;
  plant_id: string;
  datetime: number;
  description: string;
  basic_activity?: string;
  additional_info?: string;
}
```

**Side effects:** If at least one Fruit record exists, the plant card shows the fruit overlay SVG.

**`basic_activity` field notes:**
- Populated only when the user checks "Is basic activity?" in the Fruit modal.
- Preset values: `prayer`, `devotional meeting`, `study circle`, `children's class`, `junior youth group`.
- Selecting "Other" opens a free-text autocomplete field populated from the shared `autocomplete_values` table (type `basic_activity`). The entered value is saved to the record and contributed back to that shared table.
- When `basic_activity` is set, it is shown as the activity title instead of the generic "Fruit" label.

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
| `shared_garden_refs_v1` | JSON string | Array of `SharedGardenRef` objects — the registry of all shared gardens on this device |
| `shared_garden_key_{gardenId}` | Base64 string | RSA-OAEP private key (PKCS8) for the named shared garden — used to decrypt the encrypted garden object fetched from Supabase |

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
  sharedGardenLink?: {     // Written by plantLinkService when a personal plant is linked to a shared garden
    gardenId: string;          // Local gardenId of the shared garden
    sharedPlantId: string;     // UUID of the corresponding plant in the shared garden
    authorUuid: string;        // UUID of the user who created the link
    authorDisplayName: string; // Display name of the user who created the link
  };
}
```

**`additional_info` sub-fields on shared garden `plants`:**

Plants in a shared garden (`SharedGarden_{gardenId}`) also use `additional_info`, with one additional sub-field:

```typescript
interface SharedPlantAdditionalInfo extends PlantAdditionalInfo {
  linkedPersonalPlantId?: string; // UUID of the corresponding plant in the user's personal GardenDB
}
```

---

## 2b. Shared Garden Local Database Schema

Each shared garden the user belongs to gets its own isolated AlaSQL database, named `SharedGarden_{gardenId}`. This database is created by `SharedGardenDatabase.init(gardenId)` and shares the same table structure as the personal `GardenDB` for the 13 standard tables, plus two shared-garden-specific tables.

All 13 personal-garden tables are present verbatim (`plants`, `tendings`, `waterings`, `sunlight`, `fruits`, `prunings`, `companions`, `scheduled_events`, `plots`, `plot_memberships`, `buds`, `notchings`, `capabilities`). Refer to section 1 for their schemas.

---

### 2b.1 `garden_members`

All users who belong to this shared garden. Every member has equal write access — there are no roles.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `user_uuid` | STRING | NOT NULL | User's personal UUID (matches their `User.id`) |
| `display_name` | STRING | NOT NULL | How this member appears to others in the garden |
| `joined_at` | NUMBER | NOT NULL | Unix ms timestamp when the member joined |
| `added_by_uuid` | STRING | NOT NULL | UUID of the member who invited this person |

```typescript
interface GardenMember {
  id: string;
  user_uuid: string;
  display_name: string;
  joined_at: number;
  added_by_uuid: string;
}
```

---

### 2b.2 `garden_change_log`

Append-only audit log of all meaningful actions in the garden. Used to display the activity feed in `GardenChangeLogCard`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `actor_uuid` | STRING | NOT NULL | UUID of the member who performed the action |
| `actor_display_name` | STRING | NOT NULL | Display name at time of action |
| `action_type` | STRING | NOT NULL | See action type list below |
| `target_table` | STRING | NOT NULL | Which table was affected |
| `target_id` | STRING | NOT NULL | UUID of the affected record |
| `target_label` | STRING | NOT NULL | Human-readable name of the affected item (e.g., plant name) |
| `occurred_at` | NUMBER | NOT NULL | Unix ms timestamp |

**`action_type` values:**
- `add_plant`, `remove_plant`
- `add_tending`, `edit_tending`, `delete_tending`
- `add_watering`, `edit_watering`, `delete_watering`
- `add_sunlight`, `edit_sunlight`, `delete_sunlight`
- `add_fruit`, `edit_fruit`, `delete_fruit`
- `add_pruning`, `edit_pruning`, `delete_pruning`
- `add_notching`, `edit_notching`, `delete_notching`
- `add_bud`, `delete_bud`
- `add_capability`, `delete_capability`
- `add_companion`, `delete_companion`
- `create_plot`, `edit_plot`, `delete_plot`
- `bulk_tend`, `bulk_water`, `bulk_sunlight`, `bulk_fruit`, `bulk_notch`
- `add_member`, `remove_member`

```typescript
interface GardenChangeLogEntry {
  id: string;
  actor_uuid: string;
  actor_display_name: string;
  action_type: string;
  target_table: string;
  target_id: string;
  target_label: string;
  occurred_at: number;
}
```

---

### 2b.3 `garden_tombstones`

Soft-delete markers. When a record is deleted from a shared garden, a tombstone is written alongside the deletion. During `applyDeltas()`, any delta that tries to INSERT or UPDATE a tombstoned record is treated as a conflict (a `TombstoneConflict`). Tombstones are purged during compaction.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | STRING | PRIMARY KEY | UUID v4 |
| `record_id` | STRING | NOT NULL | UUID of the deleted record |
| `table_name` | STRING | NOT NULL | Table the record was in |
| `deleted_at` | NUMBER | NOT NULL | Unix ms timestamp of deletion |

```typescript
interface SharedGardenTombstone {
  id: string;
  record_id: string;
  table_name: string;
  deleted_at: number;
}
```

---

### 2b.4 `SharedGardenDelta` (in-transit, not a table)

Deltas are not stored in a separate table. They are accumulated in the `SharedGardenObject.deltas` array of the encrypted cloud payload and applied locally via `applyDeltas()`. After application they are not re-stored locally — the local AlaSQL tables are the applied state.

```typescript
interface SharedGardenDelta {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record_id: string;
  data?: Record<string, unknown>;  // full record for INSERT/UPDATE; absent for DELETE
  ts: number;                       // Unix ms — used for last-write-wins arbitration
  authored_by_uuid: string;
  authored_by_display_name: string;
}
```

---

### 2b.5 `SharedGardenRef` (localStorage registry)

One entry per shared garden in the `shared_garden_refs_v1` localStorage key.

```typescript
interface SharedGardenRef {
  gardenId: string;            // local identifier — same as sharedGardenId
  sharedGardenId: string;      // UUID in Supabase shared_gardens table
  gardenName: string;
  myDisplayName: string;
  myUuid: string;
  gardenPublicKeyBase64: string;
  lastSyncTs: number;          // Unix ms of last successful sync — used to identify new deltas
  disconnected?: boolean;      // true if this user has been removed from the garden
}
```

---

### 2b.6 `GardenKeyFileData` (downloaded key file format)

The garden key file (`{name}-garden-key.json`) is a separate, portable credential for a shared garden — distinct from the personal `garden-key.json`. It contains 7 fields:

```typescript
interface GardenKeyFileData {
  gardenId: string;         // local identifier
  sharedGardenId: string;   // UUID in Supabase
  gardenName: string;
  myUuid: string;           // this member's personal UUID
  myDisplayName: string;    // this member's display name in the garden
  gardenPrivateKey: string; // Base64 PKCS8 RSA-OAEP private key for decrypting the garden
  gardenPublicKey: string;  // Base64 SPKI RSA-OAEP public key
}
```

**Important:** The garden key file grants read/write access to the shared garden for the user whose `myUuid` is in the file. Sharing this file with others is equivalent to sharing full garden access. Guard it accordingly.

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

Stores community-shared autocomplete suggestions for learning sources, proven capacities, and basic activity types. Contains no names, identifiers, or private data — only short text strings contributed voluntarily.

```sql
CREATE TABLE IF NOT EXISTS autocomplete_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  count integer DEFAULT 1,
  type text NOT NULL,           -- 'learning_source' | 'proven_capacity' | 'basic_activity'
  language text DEFAULT 'en_US',
  last_updated_by uuid,
  created_at timestamptz DEFAULT now()
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Row UUID |
| `text` | text | The autocomplete string (e.g., "Ruhi Book 1", "tutoring", "home visits") |
| `count` | integer | Number of users who have used this value |
| `type` | text | Category: `learning_source`, `proven_capacity`, or `basic_activity` |
| `language` | text | Locale of the value; currently always `en_US` |
| `last_updated_by` | uuid | UUID of the last user who incremented the count; prevents a single user from inflating counts |

**Access pattern:** `supabaseService.fetchTop200AutocompleteValues(type)` returns the top 200 entries ordered by count. `upsertAutocompleteValue(text, userId, type)` inserts or increments.

**Convenience wrappers in `supabaseService.ts`:**
- `fetchTop200LearningSources()` / `upsertLearningSource(text, userId)` — for Watering source autocomplete
- `fetchTop200ProvenCapacities()` / `upsertProvenCapacity(text, userId)` — for Capability autocomplete
- `fetchTop200BasicActivities()` / `upsertBasicActivity(text, userId)` — for Fruit "Other" basic activity autocomplete

**Count increment rule:** When a value already exists, the count is only incremented if `last_updated_by` differs from the current user. This prevents a single user from artificially inflating community counts.

**RLS Policies:**
- `SELECT`: public (any user can read suggestions).
- `INSERT`: type must be one of `learning_source`, `proven_capacity`, or `basic_activity`; text must be non-empty.
- `UPDATE`: same type allowlist; count must remain non-negative.

---

### 3.4 `shared_plants` Table

Holds encrypted plant data for the plant-sharing feature. Each row represents a single shared plant. The encrypted payload contains a `PlantShareObject` (snapshot + delta log). Authorized users are those who have claimed an invite and been granted access by the owner.

```sql
CREATE TABLE IF NOT EXISTS shared_plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_data text NOT NULL,
  authorized_users jsonb NOT NULL DEFAULT '[]',
  last_modified timestamptz DEFAULT now(),
  user_last_modified uuid,
  snapshot_at timestamptz
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Share record UUID |
| `encrypted_data` | text | `PlantShareObject` encrypted with the plant's RSA public key (hybrid AES-GCM + RSA-OAEP) |
| `authorized_users` | jsonb | Array of user UUIDs who may read/write this record. `authorized_users[0]` is the owner. |
| `last_modified` | timestamptz | Last update timestamp (used for optimistic concurrency — 409 if client's `clientLastModified` does not match) |
| `user_last_modified` | uuid | UUID of the user who last modified this record |
| `snapshot_at` | timestamptz | Timestamp of the last compaction; null until first compaction |

**`PlantShareObject` (encrypted payload structure):**
```typescript
interface PlantShareObject {
  snapshot: {
    plant: Plant;
    tendings: Tending[];
    waterings: Watering[];
    sunlight: Sunlight[];
    fruits: Fruit[];
    prunings: Pruning[];
    buds: Bud[];
    notchings: Notching[];
    capabilities: Capability[];
    snapshot_at: number;
  };
  deltas: SyncDelta[];
  schema_version: number;
}
```

**Roles:**
- `authorized_users[0]` — owner. Performs compaction when delta count exceeds 50. Can remove co-tenders.
- All other entries in `authorized_users` — co-tenders. Can append deltas (read/write). Cannot compact.
- A viewer role is supported in the local `SharedPlantRef` (`shareMode: 'view'`); viewers receive but do not push deltas.

**RLS Policies:**
- Anyone can read (data is encrypted; reading ciphertext reveals nothing without the plant's private key).
- Service role only can insert and update (all writes go through `sync-shared-plant` Edge Function).

---

### 3.5 `shared_gardens` Table

Holds the encrypted state of a shared garden. Each row is one shared garden. Any number of users (members) hold the garden's RSA private key locally and can read/write the encrypted blob. The server never holds the private key.

```sql
CREATE TABLE IF NOT EXISTS shared_gardens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_data text NOT NULL,
  garden_public_key text NOT NULL,
  authorized_users jsonb NOT NULL DEFAULT '[]',
  last_modified timestamptz DEFAULT now(),
  user_last_modified uuid
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Shared garden UUID — also used as the local `gardenId` |
| `encrypted_data` | text | `SharedGardenObject` encrypted with the garden's RSA public key |
| `garden_public_key` | text | RSA-OAEP public key (Base64 SPKI) for this garden — stored in plaintext so invited members can verify key provenance |
| `authorized_users` | jsonb | Array of user UUIDs authorized to read/write this garden |
| `last_modified` | timestamptz | Last write timestamp — used for optimistic concurrency (409 if client's `clientLastModified` does not match) |
| `user_last_modified` | uuid | UUID of the user who last modified this record |

**`SharedGardenObject` (encrypted payload structure):**
```typescript
interface SharedGardenObject {
  snapshot: SharedGardenSnapshot;
  deltas: SharedGardenDelta[];
  schema_version: number;
  garden_name: string;
}

interface SharedGardenSnapshot {
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
  members: GardenMember[];
  change_log: GardenChangeLogEntry[];
  snapshot_at: number;
}

interface SharedGardenDelta {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record_id: string;
  data?: Record<string, unknown>;
  ts: number;
  authored_by_uuid: string;
  authored_by_display_name: string;
}
```

**RLS Policies:**
- Anyone can read (data is encrypted; reading the ciphertext reveals nothing without the garden private key).
- Service role only can insert and update.

---

### 3.6 `garden_share_claims` Table

Ephemeral table that holds a one-time claim for joining a shared garden. The claim stores a garden private key wrapped with an ephemeral RSA public key. The invitee redeems the claim by presenting the matching ephemeral private key (embedded in the invite URL fragment — never sent to the server).

```sql
CREATE TABLE IF NOT EXISTS garden_share_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_garden_id uuid NOT NULL REFERENCES shared_gardens(id) ON DELETE CASCADE,
  short_code text NOT NULL UNIQUE,
  encrypted_garden_key text NOT NULL,
  garden_public_key text NOT NULL,
  invitee_display_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Claim row UUID |
| `shared_garden_id` | uuid | FK to `shared_gardens.id` |
| `short_code` | text | 8-character random alphanumeric code used to look up the claim |
| `encrypted_garden_key` | text | The garden RSA private key encrypted with the ephemeral public key |
| `garden_public_key` | text | The garden's RSA public key (so the invitee can store it without a second round-trip) |
| `invitee_display_name` | text | Display name the invitee will use in the garden |
| `created_at` | timestamptz | Creation timestamp |
| `claimed_at` | timestamptz | Set when the claim is redeemed; null until then |
| `expires_at` | timestamptz | Claims expire after 72 hours |

**Invite URL structure:**
```
https://app.example.com/join-shared-garden/{sharedGardenId}?code={shortCode}#key={ephemeralPrivateKeyBase64}
```
The ephemeral private key is in the URL `#fragment` — it is never sent to the server by the browser.

**RLS Policies:**
- Service role only for all operations. Claims are read and written exclusively through Edge Functions.

---

### 3.7 `plant_share_claims` Table

Equivalent to `garden_share_claims` but for individual shared plants.

```sql
CREATE TABLE IF NOT EXISTS plant_share_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_plant_id uuid NOT NULL REFERENCES shared_plants(id) ON DELETE CASCADE,
  short_code text NOT NULL UNIQUE,
  encrypted_plant_key text NOT NULL,
  plant_public_key text NOT NULL,
  claim_mode text NOT NULL DEFAULT 'co-tend',
  created_at timestamptz DEFAULT now(),
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL
);
```

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Claim row UUID |
| `shared_plant_id` | uuid | FK to `shared_plants.id` |
| `short_code` | text | 8-character random code |
| `encrypted_plant_key` | text | Plant RSA private key encrypted with invitee's public key |
| `plant_public_key` | text | Plant RSA public key |
| `claim_mode` | text | `'co-tend'` or `'view'` |
| `created_at` / `claimed_at` / `expires_at` | timestamptz | Lifecycle timestamps |

**RLS Policies:**
- Service role only.

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

### 5.6 `POST /functions/v1/create-shared-garden`

Create a new shared garden. Stores the initial encrypted snapshot and the garden's public key. Returns the server-assigned `sharedGardenId`.

**Request:**
```json
{
  "encryptedData": "base64-encrypted-SharedGardenObject",
  "gardenPublicKey": "base64-spki-string",
  "gardenName": "string",
  "displayName": "string",
  "timestamp": 1234567890000,
  "signature": "base64-rsa-pss-signature"
}
```

**Signature message:** `"create-shared-garden:" + userId + ":" + timestamp + ":" + gardenName`

**Response 200:**
```json
{ "sharedGardenId": "uuid-string" }
```

**Headers required:** `Authorization: Bearer {userId}`, `Apikey: {SUPABASE_ANON_KEY}`

---

### 5.7 `POST /functions/v1/sync-shared-garden`

Read or write the encrypted state of a shared garden. Supports three actions.

**Headers required:** `Authorization: Bearer {userId}`, `Apikey: {SUPABASE_ANON_KEY}`

#### Action: `read`

Fetch the current encrypted garden object.

**Request:**
```json
{
  "sharedGardenId": "uuid-string",
  "action": "read",
  "timestamp": 1234567890000,
  "signature": "base64-rsa-pss-signature"
}
```

**Signature message:** `"sync-shared-garden:" + userId + ":" + sharedGardenId + ":read:" + timestamp`

**Response 200:**
```json
{
  "encryptedData": "base64-encrypted-SharedGardenObject",
  "lastModified": "ISO-8601-string",
  "authorizedUsers": ["uuid-string", ...]
}
```

**Response 403:** User is not in `authorized_users` — `markGardenDisconnected()` is called client-side.

#### Action: `write`

Push an updated encrypted garden object. Uses optimistic concurrency — 409 if `clientLastModified` does not match the server's `last_modified`.

**Request:**
```json
{
  "sharedGardenId": "uuid-string",
  "action": "write",
  "encryptedData": "base64-encrypted-SharedGardenObject",
  "clientLastModified": "ISO-8601-string-or-null",
  "isCompaction": false,
  "timestamp": 1234567890000,
  "signature": "base64-rsa-pss-signature"
}
```

**Signature message:** `"sync-shared-garden:" + userId + ":" + sharedGardenId + ":write:" + timestamp`

**Response 200:** `{ "success": true }`

**Response 409:** `{ "lastModified": "ISO-8601-string", "encryptedData": "..." }` — client must re-fetch, merge, and retry.

#### Action: `remove-member`

Remove a user from `authorized_users`. Any current member can remove any other member.

**Request:**
```json
{
  "sharedGardenId": "uuid-string",
  "action": "remove-member",
  "targetUserId": "uuid-string",
  "timestamp": 1234567890000,
  "signature": "base64-rsa-pss-signature"
}
```

**Signature message:** `"sync-shared-garden:" + userId + ":" + sharedGardenId + ":remove-member:" + timestamp`

**Response 200:** `{ "success": true }`

---

### 5.8 `POST /functions/v1/create-garden-share-claim`

Generate a one-time invite claim for a shared garden. The caller wraps the garden private key with an ephemeral public key before calling this function. The ephemeral private key travels in the URL fragment to the invitee.

**Request:**
```json
{
  "sharedGardenId": "uuid-string",
  "encryptedGardenKey": "base64-garden-privkey-encrypted-with-ephemeral-pubkey",
  "gardenPublicKey": "base64-spki-string",
  "inviteeDisplayName": "string",
  "timestamp": 1234567890000,
  "signature": "base64-rsa-pss-signature"
}
```

**Signature message:** `"create-garden-share-claim:" + userId + ":" + sharedGardenId + ":" + timestamp`

**Response 200:**
```json
{
  "shortCode": "ABCD1234",
  "expiresAt": "ISO-8601-string"
}
```

---

### 5.9 `POST /functions/v1/claim-garden-share`

Redeem an invite claim. The invitee presents the `shortCode` and their authenticated user ID. The server returns the `encryptedGardenKey` and adds the invitee to `authorized_users`.

**Request:**
```json
{
  "shortCode": "ABCD1234",
  "displayName": "string",
  "timestamp": 1234567890000,
  "signature": "base64-rsa-pss-signature"
}
```

**Signature message:** `"claim-garden-share:" + userId + ":" + shortCode + ":" + timestamp`

**Response 200:**
```json
{
  "encryptedGardenKey": "base64-garden-privkey-wrapped-with-ephemeral-pubkey",
  "gardenPublicKey": "base64-spki-string",
  "sharedGardenId": "uuid-string"
}
```

**Response 404:** Claim not found or expired.
**Response 409:** Claim already redeemed.

---

### 5.10 `POST /functions/v1/create-shared-plant`

Create a new shared plant record in `shared_plants`. The caller provides the initial encrypted payload and the plant's RSA public key.

**Request:**
```json
{
  "encryptedData": "base64-encrypted-PlantShareObject",
  "plantPublicKey": "base64-spki-string",
  "shareMode": "co-tend",
  "timestamp": 1234567890000,
  "signature": "base64-rsa-pss-signature"
}
```

**Signature message:** `"create-shared-plant:" + userId + ":" + timestamp`

**Response 200:** `{ "sharedPlantId": "uuid-string" }`

---

### 5.11 `POST /functions/v1/sync-shared-plant`

Read or write the encrypted state of a shared plant. Supports `read` and `write` actions. Semantics identical to `sync-shared-garden` but operates on `shared_plants`.

**Signature messages:**
- Read: `"sync-shared-plant:" + userId + ":" + sharedPlantId + ":read:" + timestamp`
- Write: `"sync-shared-plant:" + userId + ":" + sharedPlantId + ":write:" + timestamp`

---

### 5.12 `POST /functions/v1/create-share-claim`

Generate a one-time invite for a shared plant. Equivalent to `create-garden-share-claim` but for `shared_plants` / `plant_share_claims`.

---

### 5.13 `POST /functions/v1/claim-plant-share`

Redeem a shared plant invite claim. Adds the invitee to `shared_plants.authorized_users` and returns the encrypted plant key. Equivalent to `claim-garden-share` but for plants.

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

### Personal Garden (GardenDB)
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
```

### Supabase (Cloud)
```
users ── plant_images              (1:many, max 100 per user)
users ── encrypted_backup          (1:1, JSON blob in users.encrypted_backup)
users ── shared_plants             (many:many via authorized_users JSONB)
users ── shared_gardens            (many:many via authorized_users JSONB)
shared_gardens ── garden_share_claims  (1:many, ephemeral invite claims)
shared_plants  ── plant_share_claims   (1:many, ephemeral invite claims)
autocomplete_values                (shared/global, not user-scoped)
```

### Shared Garden (SharedGarden_{gardenId} — per-garden AlaSQL database)
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
         └── companions        (many:many self-join)

plots ───── plot_memberships ── plants    (many:many)
garden_members                            (flat list of who belongs to the garden)
garden_change_log                         (append-only audit log of all actions)
garden_tombstones                         (soft-delete markers, ephemeral — purged on compaction)
```

### Cross-Garden Links (via plants.additional_info)
```
GardenDB.plants.additional_info.sharedGardenLink → SharedGarden_{id}.plants.id
SharedGarden_{id}.plants.additional_info.linkedPersonalPlantId → GardenDB.plants.id
```

---

## 8. Schema Migration Policy

**Current schema version:** (unversioned — to be addressed as debt)

**Notable schema additions:**
- `fruits.basic_activity` (STRING, nullable) — added for the basic activity classification feature. Existing records without this column default to `NULL` (no basic activity set), which is handled gracefully by `restoreBackupFromObject()`.
- `autocomplete_values.type` allowlist expanded from `['learning_source', 'proven_capacity']` to include `'basic_activity'` via an RLS policy migration (`add_basic_activity_to_autocomplete_rls`).

**Required process for any schema change:**
1. Add new column to the AlaSQL `CREATE TABLE` statement in `DatabaseService.init()`.
2. Increment `schema_version` in `getFullBackupAsObject()`.
3. Update `restoreBackupFromObject()` to handle the missing field gracefully for all older schema versions (default values for new columns).
4. Update the `BackupObject` TypeScript interface.
5. If the change affects Supabase tables, write a new migration file in `supabase/migrations/` using the `mcp__supabase__apply_migration` tool.
6. Document the change in `MEMORY.md`.

**Never drop a column.** Existing backups may be missing the column. Add nullable columns only.
