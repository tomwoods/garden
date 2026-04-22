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
- secp256k1 via `@noble/curves` (chosen)

**Decision:** secp256k1 via `@noble/curves`.

**Reasons:**
- `@noble/curves` is already in the dependency tree (it supports multiple curves including secp256k1).
- secp256k1 signatures are compact, fast to verify server-side in Deno, and widely understood.
- Ed25519 is not available in all browser Web Crypto implementations at the time of development.
- Image upload signatures use a different mechanism than backup signatures to provide defense in depth: an attacker who obtains the user's RSA keys cannot use them to forge image upload requests, and vice versa.

**Trade-offs:**
- Managing two signature schemes adds cognitive overhead. This is mitigated by clear separation: `signatureService.ts` = RSA-PSS for backups, `uploadService.ts` uses secp256k1 for images.
- `@noble/curves` adds a small bundle cost, but it is already required, so the marginal cost is zero.

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
