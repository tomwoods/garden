# MEMORY.md — Decision Log

This file records the significant architectural and product decisions made during development, including the options that were considered and the reasons for each choice. Future agents and developers should read this before proposing changes in these areas.

---

## Decision 1: AlaSQL + localStorage as Local Database

**Date:** Early development (Phase 1)

**Options considered:**
- Raw IndexedDB (via `idb` or `localForage`)
- SQLite via WebAssembly (`wa-sqlite`, `sql.js`, `@electric-sql/pglite`)
- AlaSQL with localStorage backend
- Simple JSON objects in localStorage

**Decision:** AlaSQL with localStorage backend.

**Reasons:**
- AlaSQL provides SQL query syntax (joins, ordering, filtering) without the verbose async API of raw IndexedDB.
- The localStorage backend serializes to a well-understood format that is easy to inspect and debug.
- Backup/restore is straightforward: serialize all tables to JSON, store encrypted blob in Supabase.
- WASM-based SQLite options add significant bundle weight and initialization complexity inappropriate for a lightweight PWA.
- Raw JSON objects do not support the relational queries needed for activity timelines and plot memberships.

**Trade-offs:**
- localStorage has a 5–10MB size limit (browser-dependent). For users with many plants and activities over years, this could become a constraint. The current data model uses minimal storage per record (no full-text blobs). This is acceptable for the near term.
- AlaSQL does not support real migrations. Adding columns requires updating `restoreBackupFromObject()` to handle missing fields gracefully. This is documented as a known debt item.
- Image data URLs in localStorage are the most likely cause of storage exhaustion. Images are moving to Supabase Storage to address this.

---

## Decision 2: No Authentication Service (Garden Key = Identity)

**Date:** Phase 1 architecture

**Options considered:**
- Supabase Auth (email + password)
- Magic link authentication
- Passkey / WebAuthn
- No auth — key file as identity (chosen)

**Decision:** The garden key JSON file is the user's identity. No username, email, or password.

**Reasons:**
- The core privacy promise requires that the server never hold information that can identify the user. An email address breaks this promise.
- The threat model for this app is not "unauthorized access to the account" but "unauthorized access to the plaintext data." The encryption architecture addresses this regardless of auth.
- Auth services create account recovery dependencies. If a user's email is compromised or their auth provider shuts down, they lose access. A local key file has no such dependency.
- The user population (spiritually-motivated, privacy-sensitive individuals) is more likely to understand and embrace a key-file system than a general consumer audience.
- Eliminating auth eliminates an entire class of server-side logic, attack surface, and support requirements.

**Trade-offs:**
- Lost key file = lost garden (unless cloud backup exists). This is communicated clearly during onboarding with the `KeyBackupPrompt` and key file download.
- No account recovery. Intentional. The user's garden is theirs alone.
- Multi-device setup requires the user to carry and restore from the key file. Friction is intentional — the key file is the garden's passport.

---

## Decision 3: RSA-PSS for Backup Signatures

**Date:** Phase 1 security architecture

**Options considered:**
- HMAC-SHA256 (symmetric — requires a shared secret on the server)
- ECDSA with P-256
- RSA-PSS (chosen)

**Decision:** RSA-PSS with 2048-bit keys via Web Crypto API.

**Reasons:**
- Web Crypto API has native, well-audited RSA-PSS support across all modern browsers.
- RSA-PSS uses a separate key pair from the encryption key, providing clear separation of concerns: one key pair for data confidentiality, another for data authenticity.
- The public signing key can be safely stored on Supabase — it proves nothing about the user's data and only enables the server to verify that a backup was submitted by the legitimate key holder.
- HMAC requires the server to hold a shared secret, which creates a server-side secret management problem and weakens the zero-knowledge property.

**Trade-offs:**
- RSA keys are larger than elliptic curve equivalents. However, key generation is a one-time cost and keys are stored in localStorage, so size is not a meaningful constraint.
- RSA operations are slower than ECDSA, but backups are signed rarely (at most once per session). Performance is not a concern.

---

## Decision 4: secp256k1 for Image Upload Signatures

**Date:** Phase 2 (image system)

**Options considered:**
- RSA-PSS (same as backup)
- Ed25519 via Web Crypto (not universally available)
- secp256k1 via `@noble/curves` (chosen at the time)

**Decision:** secp256k1 via `@noble/curves`. *(This decision was later superseded — see Decision 12.)*

**Original reasons:**
- `@noble/curves` is already in the dependency tree.
- secp256k1 signatures are compact and fast to verify server-side in Deno.
- Ed25519 is not available in all browser Web Crypto implementations.

**Why it was replaced:** Managing two signature schemes (secp256k1 for images, RSA-PSS for backups) added cognitive overhead with no security benefit. Decision 12 unified all signing under RSA-PSS using the existing key pair from `signatureService.ts`. The `@noble/curves` dependency remains in the codebase but is no longer on the server-critical auth path.

---

## Decision 5: Face Detection in Client Before Upload

**Date:** Phase 2 (image system)

**Options considered:**
- No face detection (trust the user)
- Server-side face detection (ML API or cloud service)
- Client-side heuristic face detection (chosen)

**Decision:** Client-side heuristic skin-tone clustering in `faceDetection.ts`.

**Reasons:**
- The app's privacy promise means it cannot send images to a third-party ML service for analysis.
- Server-side face detection would require the server to see the image before it is encrypted, violating E2EE.
- The user population's relationships are explicitly private. Uploading photos of people (faces) would undermine the spiritual/anonymous character of the garden.
- A heuristic (skin-tone ratio + central clustering) is "good enough" — it catches accidental selfies and portrait photos while not blocking garden/nature images. It has a non-zero false positive and false negative rate, which is acceptable for this use case.

**Trade-offs:**
- The heuristic is not a reliable face detector. A determined user can bypass it. It is a guard against accidental uploads, not a security control.
- False positives (blocking a valid image because of warm-toned lighting) may frustrate users. The error message should be clear and allow retry.

---

## Decision 6: Image Compression to 720px Max Dimension

**Date:** Phase 2

**Options considered:**
- No compression (upload original)
- Fixed quality (JPEG 0.8) without resize
- Max dimension cap of 1080px
- Max dimension cap of 720px (chosen)

**Decision:** Compress to ≤720px max dimension, JPEG quality 0.85.

**Reasons:**
- 720px is sufficient for the app's display contexts (plant gallery cards, full-screen plant image viewer on mobile screens ≤390px wide).
- Storage quota per user is 50MB shared across 100 images. At 720px JPEG, a compressed photo is typically 50–150KB, well within budget.
- Larger images provide no UI benefit and would exhaust the quota faster.

---

## Decision 7: Supabase as the Sole Backend

**Date:** Phase 1, revised in Phase 2

**Options considered:**
- Supabase only (Postgres + Edge Functions + Storage) — chosen
- Supabase (backup) + UploadThing (images)
- Self-hosted backend

**Decision:** Supabase as the sole backend. UploadThing integration is retained as a CDN proxy layer but Supabase Storage is the authoritative image store.

**Reasons:**
- A single backend simplifies operations, reduces the number of external API integrations, and gives the user one set of credentials to trust.
- UploadThing was evaluated as a CDN delivery layer and remains in the codebase as a proxy (`uploadthing-route` Edge Function) for CDN URL generation. However, the authoritative storage and metadata (E2EE images, `plant_images` table) lives in Supabase.
- Future E2EE for image content requires that the storage layer be controllable — Supabase Storage satisfies this. UploadThing as primary storage would make E2EE harder to enforce.

---

## Decision 8: The Spiritual Metaphor Is Ambient, Not Explicit

**Date:** Design phase

**Options considered:**
- Make the metaphor explicit: label the app "Soul Garden," describe plants as souls in the onboarding.
- Use no metaphor: label everything as "contacts," "interactions," "notes."
- Use the garden metaphor in UI labels: "Tend your souls," "Water with scripture."
- Use garden vocabulary without religious framing (chosen).

**Decision:** Use garden vocabulary throughout — plant, tend, water, sunlight, fruit, pruning — but never explain the spiritual meaning in the UI.

**Reasons:**
- The users who need this app already know what the metaphor means. They do not need it explained.
- Explicit spiritual language in the UI risks alienating users from different faith traditions or makes the app feel prescriptive.
- The metaphor works at multiple levels: someone could use the app simply as a relationship tracker with the garden framing and find it beautiful without ever engaging the spiritual dimension.
- Discretion is itself a spiritual virtue. An app that shouts its piety is incongruent with the practice it supports.

---

## Decision 9: Backup Versioning (Deferred)

**Date:** Phase 1 (noted as debt)

**Decision:** The current backup format has no version field. Schema migrations are not yet implemented.

**Rationale for deferral:**
- In Phase 1, the schema is stable. No columns have been added or removed after initial creation.
- Adding a version field and migration logic requires careful testing. It was deferred to avoid premature complexity.

**Required action (Phase 2 / 3):**
When any schema change is made:
1. Add a `schema_version` field to `getFullBackupAsObject()`.
2. Add a migration switch in `restoreBackupFromObject()` that handles each version gracefully, filling in default values for missing columns.
3. Increment the version number with each schema change.

---

## Decision 11: E2EE Image Storage Directly in Postgres (Not CDN)

**Date:** Phase 2 revision

**Options considered:**
- UploadThing as primary CDN (evaluated and dropped)
- Supabase Storage with per-file encryption (rejected — CDN URLs would expose metadata)
- Encrypted blobs stored directly in Postgres `text` columns (chosen)

**Decision:** Encrypt image data client-side using AES-GCM before it ever leaves the device, then store the ciphertext directly in the `plant_images` table as base64 `text` columns (`image_data_large`, `image_data_small`).

**Reasons:**
- True E2EE: the server stores only ciphertext. Even with direct database access, image content is unreadable.
- No CDN URL leakage: CDN URLs are publicly accessible by design. A URL is enough to retrieve the image. Removing CDN delivery removes this entire attack surface.
- Simplicity: no third-party CDN integration to maintain. One backend (Supabase), one storage model.
- The image sizes involved (≤720px JPEG compressed to ~50–150KB) are manageable as base64 strings in Postgres text columns without meaningful performance impact for this usage scale.

**Trade-offs:**
- Postgres text storage is less efficient than binary blob storage for large images. Acceptable given the compression target (≤720px) and per-user quota (100 images max).
- No CDN delivery means every image fetch goes through an Edge Function and round-trips through Postgres. Acceptable latency for this use case (images are displayed on plant detail pages, not in a feed).
- The previous UploadThing-based fields (`uploadthing_key`, `url`, `file_hash`, `size_bytes`) are no longer in the schema. Any users who uploaded images under the old system would need to re-upload.

---

## Decision 12: RSA-PSS for Image Signatures (Replacing secp256k1)

**Date:** Phase 2 revision

**Context:** The original image upload path used secp256k1 (via `@noble/curves`) for request signing — a different scheme from the RSA-PSS used for backup signatures. The rebuilt image system unified both under RSA-PSS.

**Decision:** All Edge Function signature verification (backups and images) now uses RSA-PSS with SHA-256 and salt length 32, reading the `signature_public_key` column from the `users` table.

**Reasons:**
- Eliminates the two-scheme cognitive split. `signatureService.ts` (RSA-PSS) is now the sole signing mechanism for all server-side operations.
- Reduces the secp256k1 surface in the codebase — `@noble/curves` is still a dependency but is no longer on the server-critical auth path.
- RSA-PSS is already used and tested for backup signing. Reusing the same key pair for image signing simplifies key management.

**Trade-offs:**
- The user's RSA-PSS key pair is now used for both backup and image request authentication. This is a minor reduction in key separation. Acceptable given that both operations are user-initiated and the key never leaves the device.

---

## Decision 10: Companions Are Relationship Records, Not Collaboration

**Date:** Feature design, Phase 1

**Context:** There was a question about whether the Companion feature was intended for collaborative gardening (two users co-tending one plant).

**Decision:** Companions are a private record of a known relationship between two people in the user's garden. They exist only in the user's local database and are not shared or synced with any other user.

**Example:** User has plants for "Maria" and "Luis." They are siblings. The user adds a Companion record: Maria → "siblings" → Luis. This helps the user remember context when tending either plant.

**The plant sharing feature (Phase 3) is entirely separate.** It allows two Garden users to co-view and co-log activities for a plant, but it is not related to the Companion activity type.

---

## Decision 13: Branches — Buds, Notchings, and Capabilities as First-Class Tables

**Date:** Phase 2 / Phase 3 boundary

**Context:** Users wanted to track capacity development alongside the spiritual relationship activities. The existing `additional_info` JSON field could theoretically hold this data, but that approach would make querying, editing, and syncing fragile.

**Decision:** Three dedicated AlaSQL tables: `buds`, `notchings`, `capabilities`.

**Reasons:**
- Each type has a distinct, structured schema. `notchings` in particular requires multiple numeric fields (book, start/end unit/section, sections studied). Stuffing this into JSON would make queries and edits complicated and error-prone.
- Separating the tables keeps backup/restore clean: each array is independently handled in `restoreBackupFromObject()` with graceful fallback for old backups that predate the feature.
- The three types map to a clear progression: Buds (potential) → Notchings (active study) → Capabilities (confirmed capacity). Keeping them separate preserves this semantic distinction in the data model.
- CRUD operations are consistent with all other activity tables, enabling the same edit/delete patterns in the UI.

**Trade-offs:**
- Three new tables add modest complexity to `DatabaseService.init()` and the backup object. Accepted as worthwhile for data clarity.
- Notching is specific to the Ruhi Institute curriculum. The `book` field accepts any string, so the table is not strictly coupled to Ruhi, but the UI currently presents Ruhi book options.

---

## Decision 14: Harvest Reports — SHA-256 Hashed Identifiers for Privacy

**Date:** Phase 2 / Phase 3 boundary

**Context:** Users wanted to share care activity summaries (e.g., for community reporting) without exposing names or personal details. A simple count export would lose the longitudinal structure needed for analytics.

**Options considered:**
- Export raw counts only (no per-plant structure)
- Export with pseudonymous sequential IDs (1, 2, 3...)
- Export with salted SHA-256 hashes (chosen)
- Omit export entirely

**Decision:** All plant and activity IDs in `HarvestReport` are SHA-256 hashes of `userId + id`. Activities retain their timestamps and activity types; all text fields (names, notes, topics) are excluded.

**Reasons:**
- Hashed IDs allow cross-report analytics (the same plant's ID hashes to the same value across reports from the same user) without leaking the real ID.
- Salting with `userId` ensures that two users with different gardens cannot be correlated even if they share the same plant name.
- Excluding all text fields makes the report safe to share without any review: there is nothing in the file that can identify a person.
- `@noble/hashes` is already a dependency (used by the image signing path), so no new package is required.

**Trade-offs:**
- Recipients cannot reconstruct the garden from a report — intentional. This is a reporting format, not a backup format.
- Age group derivation requires `age_info` to be present in `additional_info`. Plants without age info default to `adult` — this is a slight overcount of adults in aggregate reports.

**Collective Pulse (`collectivePulseService.ts`):** A second layer built on top of `HarvestReport` objects. Aggregates one or more reports into high-level metrics (care index, momentum, garden balance, lifecycle velocity, harvest ratio, pruning pulse, weekly/monthly rhythms) entirely client-side. No data ever leaves the device for this computation.

---

## Decision 15: Sowing Season Windows Are Hard-Coded

**Date:** Phase 2 / Phase 3 boundary

**Context:** The app needed a way to surface contextually appropriate moments for starting new relationships (adding plants). The sowing metaphor maps naturally to specific seasonal windows.

**Options considered:**
- User-configurable sowing windows (any date range)
- Hard-coded fixed windows aligned to the Bahá'í administrative calendar (chosen)
- No sowing season feature

**Decision:** Four fixed 14-day sowing windows per year: Spring (Mar 21), Early Summer (Jun 21), Autumn (Sep 21), Winter (Dec 21).

**Reasons:**
- The dates correspond to the start of the Bahá'í administrative periods, which have specific cultural significance for the user base. They are not arbitrary.
- Hard-coding eliminates configuration complexity and keeps the feature simple and reliable. Users do not need to set up windows — they just appear at the right time.
- A 14-day duration is long enough to be practically useful but short enough to feel like a real seasonal moment, not a permanent state.
- The `SowingSeasonBanner` only appears when a window is active or approaching (within 14 days). It is invisible during the dormant periods, keeping the UI uncluttered.

**Trade-offs:**
- Users from different traditions for whom these dates have no significance will see the banner at times that may feel arbitrary. Accepted — the app is designed for a specific community.

---

## Decision 16: Per-Record Timestamp Merge for Cross-Device Conflict Resolution

**Date:** Phase 2 (multi-device sync)

**Context:** When a user makes local changes on one device while another device has independently synced a newer backup to the server, the app cannot simply overwrite one side — both sides may contain records the other does not have, or conflicting edits to the same record.

**Options considered:**
- **Last-write-wins (whole-backup overwrite):** The most recent successful upload unconditionally replaces the server copy. Simple, but destroys any local changes on whichever device "loses." Documented incorrectly as the strategy in early USERFLOWS.md — never implemented as the final approach.
- **Third-party deep merge library (e.g., `deepmerge`, `deepmerge-json`):** Generic recursive object merging. These libraries operate on the wrong abstraction: they merge nested object properties, but the backup format is a collection of flat record arrays. They have no concept of record identity (deduplication by `id`) or of which version of a record is "newer." Custom array strategies would be required that reproduce the domain logic anyway, adding a dependency with no gain.
- **Per-record timestamp-based merge (chosen):** Union all records by `id` across every synced table. When the same `id` exists on both sides, pick the record whose authoritative timestamp is later.

**Decision:** Custom `mergeBackups()` function in `syncService.ts` implementing per-record timestamp arbitration.

**Timestamp priority chain:** `last_interaction` → `datetime` → `created_at`. The first non-null field on a record is used as its authoritative timestamp. This ordering reflects the semantic meaning of each field:
- `last_interaction` is explicitly updated on the `plants` table when any care activity is logged — it represents the most recent meaningful event for a plant and is the strongest signal of recency.
- `datetime` is the user-specified event time on activity records (tendings, waterings, etc.). It may be backdated, but it is still the most semantically meaningful timestamp for those rows.
- `created_at` is the fallback for records that have neither of the above (e.g., plots, plot_memberships, companions).

**Tables covered:** `plants`, `tendings`, `waterings`, `sunlight`, `fruits`, `prunings`, `companions`, `scheduled_events`, `plots`, `plot_memberships`. These are the 10 tables that constitute the full garden backup.

**Tables intentionally excluded:** `buds`, `notchings`, and `capabilities` are not in the merge scope. These tables were added in Phase 2 and are appended to the backup object as independent arrays. Because the merge logic unions records by ID and no record ID will collide across devices for these tables (each record is created on one device), a simple union is effectively what happens during `restoreBackupFromObject()` when the merged backup is applied. No special conflict logic is needed.

**User confirmation step:** Before applying the merged result, the user sees a confirmation prompt (via `onMergeConfirm` callback). This is a deliberate UX choice — the merge touches the user's entire garden. Applying silently felt presumptuous. If the user declines, the sync state is set to `dirty` and neither side is changed.

**Reasons for custom implementation over a library:**
- The merge problem is identity-aware and domain-specific. No general-purpose library can know which timestamp field is authoritative for each table.
- The function is 36 lines with no external dependencies — consistent with Garden's security-conscious posture of minimizing the dependency surface.
- The backup format is intentionally simple (flat arrays of records). A complex merge library would be architectural overkill and harder to audit.

**Trade-offs:**
- If two devices edit the exact same record within the same timestamp resolution (unlikely in practice), the merge arbitrarily favors one version. There is no field-level merge — the whole record from the "newer" side wins. This is acceptable because the records are small and the conflict scenario is rare.
- The merge does not detect deletions: if a record was deleted on one device and modified on the other, the modified version survives the merge. Deletion-aware merging would require tombstone records, which adds schema complexity not warranted at this stage.

---

## Decision 17: Shared Garden Architecture — Snapshot + Delta Log Per Garden

**Date:** Phase 3 (shared gardens implementation)

**Context:** Multiple users co-edit the same garden data. We needed a sync strategy that is conflict-tolerant, works offline, and does not require a real-time server.

**Options considered:**
- **Full snapshot replace on every write:** Simple — the writer serializes the whole garden and overwrites. But with N members writing independently, the last writer wins the entire garden, silently discarding concurrent writes by others.
- **Event sourcing only (no snapshot):** The server holds only the delta log; clients replay from the beginning. Correct but the log grows unbounded and replaying thousands of events on join is expensive.
- **Snapshot + rolling delta log (chosen):** The server holds a `SharedGardenObject` containing a base snapshot plus a bounded list of deltas. Each sync cycle, a client appends its local deltas and replays incoming ones. When the delta count exceeds 50, the first syncer to trigger compaction replaces the deltas with a fresh snapshot.

**Why delta log over full replace:** Two members independently logging activities between sync cycles each produce their own deltas. When either member syncs, they get the other's deltas via the log and apply them locally. A full-replace strategy would erase one member's changes every time the other synced.

**Why compaction at 50 deltas:** Each delta is a small JSON object (~200–500 bytes). At 50 deltas the log is ~10–25KB before encryption, which is manageable. Beyond that, the encrypted blob grows noticeably. 50 is conservative but appropriate for typical garden activity volumes.

**Why first-syncer-wins compaction:** We considered requiring the garden creator to compact (like the `shared_plants` owner role). But gardens have no owner concept — all members are equal. Assigning compaction to any specific member creates a bottleneck. First-syncer is simpler and self-balancing.

**Why one AlaSQL database per garden:** Shared garden data must not contaminate the user's personal GardenDB. Queries for personal plant IDs must not accidentally return shared plant IDs. The isolation also makes it safe to delete a shared garden locally (drop the whole database context) without touching personal data.

**Why `sharedGardenId === gardenId`:** The server-assigned UUID is used as the local namespace too. Using a separate local ID would require a two-level mapping (local ID → server ID) everywhere. Since the server UUID is stable and globally unique, using it directly simplifies all lookup, routing, and localStorage key patterns.

**Trade-offs:**
- If a member is offline for a long time and then syncs, they may miss deltas that were compacted out of the log. All their effects are baked into the snapshot, but those entries may not appear in the change log display. Accepted — the change log is a display convenience, not a correctness mechanism.
- The compaction race: if two members compact simultaneously, one gets a 409 and must re-fetch and retry. Since compaction produces identical content, the retry is idempotent.

---

## Decision 18: Shared Garden Encryption — Single RSA Key Pair Per Garden

**Date:** Phase 3 (shared gardens implementation)

**Context:** All members must be able to encrypt and decrypt the same ciphertext blob. We needed a key distribution model that is E2EE, does not require the server to hold any plaintext, and works offline after initial join.

**Options considered:**
- **Encrypt separately for each member's public key:** The server holds N ciphertext copies, one per member. Each member decrypts with their own key. Used by `shared_plants`. Scales poorly for gardens — every write must re-encrypt for all N members whose public keys the writer must know at write time.
- **Symmetric key shared as a secret:** All members hold the same AES key. Simpler, but symmetric key distribution is hard to make E2EE — the key must be transmitted somehow, which requires an asymmetric step anyway.
- **Single RSA key pair per garden, private key distributed via ephemeral handshake (chosen):** One RSA key pair is generated when the garden is created. All members hold the garden private key locally. The server holds only the garden public key and ciphertext. Any member can encrypt (using the garden public key) or decrypt (using the garden private key).

**Why the garden key pair model wins:** A garden write always produces one ciphertext blob regardless of member count. No member needs to know anyone else's public key at write time. The same key is used by all members indefinitely.

**Ephemeral handshake for key delivery:** When a member invites someone, they generate a one-time ephemeral ECDH key pair (`generateEphemeralECDHKeyPair()` in `cryptoService.ts`), encrypt the garden private key with the ephemeral private key (`encryptWithECDHKey()`), and send the wrapped key to the server. The ephemeral private key travels in the invite URL `#fragment` — it never reaches the server. The invitee presents the short code, receives the wrapped garden key, decrypts it with the ephemeral private key from the URL (`decryptWithECDHKey()`), and now holds the garden private key locally. The server never holds the garden private key or the ephemeral private key.

**Why ECDH instead of RSA for the ephemeral layer:** An ephemeral RSA key pair produces a ~2232-character Base64 private key in the URL fragment, making invite links long and fragile across messaging apps that truncate URLs. The ECDH ephemeral private key is ~124 characters — compact enough to be reliably shared. Security properties are equivalent for this one-shot key transport use case.

**Trade-offs:**
- If a member's device is compromised, the attacker gains the garden private key, which can decrypt all past and future garden ciphertext. This is the same risk as a compromised personal garden key and is accepted.
- Key rotation after member removal is not implemented. Removing a member from `authorized_users` prevents new server reads, but does not prevent decryption of ciphertext they already possess. This is a known limitation accepted for the current phase.

---

## Decision 19: Plant-to-Garden Linking via `additional_info` JSON

**Date:** Phase 3 (shared gardens implementation)

**Context:** A user may have a plant in their personal garden (GardenDB) and the same person represented as a plant in a shared garden. We needed a way to link these two records so that activities the user logs in the shared garden are automatically mirrored to their personal garden.

**Options considered:**
- **New `plant_links` table in GardenDB:** A separate table keyed by `(personal_plant_id, garden_id, shared_plant_id)`. Clean schema, but adds a table to every personal garden and requires migration logic in `restoreBackupFromObject()`.
- **Foreign key columns on `plants`:** E.g., `shared_garden_id` and `shared_plant_id` columns. Clean, but adds two columns to the plants table and requires migration handling.
- **JSON sub-field in `plants.additional_info` (chosen):** Store `sharedGardenLink: { gardenId, sharedPlantId, authorUuid, authorDisplayName }` inside the existing JSON column. The shared garden plant stores `linkedPersonalPlantId` in its own `additional_info`. No schema migration needed.

**Why `additional_info`:** The link is optional metadata on an existing record. The `additional_info` field already serves this purpose for `image_id`, `age_info`, and `location`. Adding another optional sub-field is consistent with established practice and requires no AlaSQL schema change.

**Asymmetric mirroring:** When a synced incoming delta contains an activity authored by the current user, `mirrorActivityToPersonalGarden()` copies it to the personal garden plant. Activities by other members are NOT mirrored. The personal garden is a first-person journal — a user should only see their own acts of care there, not others'.

**Trade-offs:**
- The JSON sub-field approach makes the link invisible to SQL queries — it cannot be indexed or joined. Link lookups are always done by known plant ID via `parseAdditionalInfo()`, not by scanning, so this is acceptable.
- If `additional_info` JSON becomes corrupted, the link is silently lost. The recovery path is to re-link manually. Accepted as an edge case.

---

## Decision 20: Deep Sync as Manual Force-Compaction

**Date:** Phase 3 (shared gardens, sync refinement)

**Context:** The standard `syncSharedGarden()` function only applies remote deltas since `lastSyncTs` and appends local deltas. This is efficient but means a device that has been offline for a long time, or whose `lastSyncTs` is stale, may miss the implicit state embedded in old compacted snapshots. We wanted a recovery path that ensures full convergence from any state.

**Decision:** `deepSyncSharedGarden()` in `sharedGardenSyncService.ts` — a distinct function from the standard sync that:
1. Applies ALL remote deltas (not just those since `lastSyncTs`).
2. Collects local changes since `lastSyncTs`.
3. Forces compaction unconditionally (regardless of delta count).
4. Uploads the compacted result.
5. On 409 conflict, re-fetches, applies remote deltas, rebuilds the compaction, and retries once.

**Why wire to the manual sync button, not background sync:** Background auto-sync (on load staleness check) also calls `deepSyncSharedGarden()` for simplicity — the function is safe to call frequently because it is idempotent (a full compaction of the same state produces the same ciphertext). The cost of always compacting is slightly larger payloads; the benefit is a simpler, single code path with no distinction between "light" and "heavy" sync in the call sites.

**Why not keep the lightweight path for auto-sync:** Two sync functions create divergence risk — a bug in one is not caught by testing the other. A single deep sync function that is always called ensures the test surface is unified.

**Trade-offs:**
- Compaction is always triggered, even when delta count is low. This produces slightly larger encrypted payloads (~5–10% more bytes) than a delta-append would, but stays well within the acceptable range for this application's data volumes.
- If multiple members trigger deep sync simultaneously (e.g., after a period of collective offline activity), the 409 retry logic handles it correctly — each retry re-fetches and re-compacts, so the final state is always the union of all members' changes.

---

## Decision 21: Auto-Sync on Load with 15-Minute Staleness Gate

**Date:** Phase 3 (shared gardens, UX)

**Context:** Members expected shared garden data to feel fresh when they open it. Previously, sync only fired on explicit user action (tap the sync button) or on write operations. Opening a garden to read it — the most common action — did not trigger a sync.

**Options considered:**
- Sync on every mount (no gate): Always fresh, but wasteful for rapid navigation and costly on slow connections.
- Sync on `visibilitychange` for all gardens (existing `syncAllSharedGardens` path): fires when the tab is re-focused, but not on initial mount within a session.
- Staleness gate on mount (chosen): sync fires on mount only if the garden has never been synced or was last synced more than 15 minutes ago.

**Decision:** In `SharedGardenView.tsx`, the mount `useEffect` checks `ref.lastSyncTs`. If absent or more than `15 * 60 * 1000` ms ago, `deepSyncSharedGarden()` is called silently (no success toast). The `isSyncing` guard prevents a double-trigger if the user taps the manual sync button while the auto-sync is already running.

**Why 15 minutes:** Long enough that rapid back-and-forth navigation between gardens does not fire repeated syncs. Short enough that a user who returns to a garden after a coffee break sees fresh data without needing to tap anything. The threshold is a constant in the component and can be adjusted independently.

**Why no toast on auto-sync:** A success toast for an automatic background action the user did not trigger would feel like an interruption. The app's tone is unhurried. Toasts are reserved for responses to explicit user intent. Failures during auto-sync that indicate disconnection (403) do surface a toast since they change the garden's functional state.

**Trade-offs:**
- The 15-minute window means data can be up to 15 minutes stale in the background. For a spiritually-motivated care app (not a real-time collaboration tool), this is acceptable.
- If a member is on a metered connection, the auto-sync fires without warning. An option to disable auto-sync could be added to Settings in a future phase.
