# ROADMAP.md — Feature Status and Milestones

## Legend

| Symbol | Meaning |
|---|---|
| DONE | Fully built and stable |
| IN PROGRESS | Partially implemented, actively being developed |
| PLANNED | Designed and prioritized, not yet started |
| FUTURE | On the horizon, not yet scoped |
| DEBT | Technical debt or known issue to address |

---

## Phase 1 — Core Garden (Complete)

### Identity & Security
- [DONE] Garden key generation (RSA-OAEP + RSA-PSS key pairs)
- [DONE] Garden key file download and restore
- [DONE] AlaSQL + localStorage local database with full offline support
- [DONE] Encrypted cloud backup (RSA-OAEP hybrid encryption + AES-GCM)
- [DONE] Server-side backup signature verification (RSA-PSS via Edge Function)
- [DONE] User registration via Supabase Edge Function (public keys only)

### Plants (Souls)
- [DONE] Create, read, update, delete plants
- [DONE] Care frequency configuration (days or weeks)
- [DONE] Care urgency calculation (healthy / mild / severe)
- [DONE] SVG-based plant growth visualization (seed → shoot → bush)
- [DONE] Fruit overlay on plant card when fruit activity recorded
- [DONE] Plant search in garden view
- [DONE] Additional custom fields per plant (JSON `additional_info`)

### Activities (Acts of Care)
- [DONE] Tending (quality time) — type selection + summary
- [DONE] Watering (sharing writings) — source + progress
- [DONE] Sunlight (prayer) — topic
- [DONE] Fruit (service) — description
- [DONE] Pruning (difficult conversation) — difficulty + description
- [DONE] Companion (relationship memory) — descriptor + linked plant
- [DONE] Edit and delete for all activity types
- [DONE] Custom datetime per activity (backdate support)
- [DONE] Additional custom fields per activity (JSON `additional_info`)
- [DONE] Activity timeline on plant detail view (merged and sorted)
- [DONE] Bulk activity logging (Tending and Watering across multiple plants)

### Plots (Groups)
- [DONE] Create, rename, delete plots
- [DONE] Add/remove plants from plots
- [DONE] Plot detail view with member list

### Scheduling & Notifications
- [DONE] Scheduled care events per plant (stored in `scheduled_events`)
- [DONE] Browser notification scheduling via service worker
- [DONE] TimestampTrigger support (Chrome/Android native scheduling)
- [DONE] Periodic sync fallback for missed notifications (24-hour interval)
- [DONE] Notification deep-link to plant detail view
- [DONE] Notification permission prompt in Settings

### PWA
- [DONE] Full offline support (assets + local database)
- [DONE] Service worker with Workbox precaching
- [DONE] PWA manifest (name, icons, theme color)
- [DONE] Install prompt (Android/Chrome)
- [DONE] iOS install instructions
- [DONE] App update prompt
- [DONE] Background sync hooks in service worker

---

## Phase 2 — Images and Multi-Device (In Progress)

### Image Management
- [DONE] Image capture via file input (camera + gallery)
- [DONE] Face detection — rejects photos containing faces
- [DONE] Image compression to ≤720px max dimension (large) and 100px thumbnail (small)
- [DONE] Per-user image quota tracking (max 100 images per user)
- [DONE] `ImageQuotaModal` — user-facing quota warning
- [DONE] `plant_images` table in Supabase with RLS (rebuilt — E2EE schema, no CDN)
- [DONE] E2EE image storage: images encrypted client-side (AES-GCM) before upload, stored as encrypted blobs in Postgres
- [DONE] `upload-plant-image` Edge Function — RSA-PSS signature verification, upsert with quota check
- [DONE] `get-plant-image` Edge Function — RSA-PSS signature verification, returns encrypted blob by size
- [DONE] `delete-plant-image` Edge Function — RSA-PSS signature verification, removes plant image row
- [IN PROGRESS] Image sync from server to local (`imageSync.ts`) — fetch encrypted blob, decrypt client-side, cache in localStorage
- [IN PROGRESS] Image display in `PlantDetailView` — show local cached image or fetch from server on demand
- [PLANNED] Image upload queue with offline retry (service worker integration)

### Multi-Device Sync
- [DONE] Encrypted backup stored in Supabase after each write
- [DONE] Restore from server backup via garden key file
- [PLANNED] Conflict detection — show user a prompt when the server backup is newer than local state
- [PLANNED] Passphrase-lock for localStorage — after a configurable idle period, local data is encrypted at rest using a passphrase-derived key (PBKDF2). The user must re-enter their passphrase to unlock. This is additive security on top of the existing key file system.

---

## Phase 3 — Sharing, Reporting, and Localization (Planned)

### Plant Sharing
A user may choose to share the care record of a specific plant with one or more other Garden users. When care activities are logged by either party for a shared plant, the other party's app receives the updates on next sync.

Architecture constraints:
- Shared data must remain E2EE. The shared plant's data is encrypted with the recipient's public key, not just the sender's.
- Sharing is plant-level, not garden-level. No user can see another user's full garden.
- Each share is an explicit opt-in action, initiated by the plant's owner.
- The `shared_plants` table in Supabase holds the encrypted payload and the authorized user ID list.
- Revoking access means removing the recipient from `authorized_users` and re-encrypting the data.

Implementation steps:
- [PLANNED] Share plant modal (owner selects a recipient by Garden ID or scan)
- [PLANNED] Edge Function: create-share — encrypts plant data for recipient's public key
- [PLANNED] Edge Function: accept-share — recipient downloads and decrypts the shared plant
- [PLANNED] Activity merge on shared plant — conflict resolution strategy TBD
- [PLANNED] Revoke share flow

### Anonymized Activity Reports
A user can generate a PDF report of their care activity over a specified time period. The report is anonymized — it does not contain real names or identifying information. Plant names are replaced with placeholder identifiers unless the user explicitly opts to include names.

- [PLANNED] Date range selector
- [PLANNED] Activity type filter (include/exclude specific types)
- [PLANNED] Anonymization options (replace names, include/exclude contact info)
- [PLANNED] PDF generation (client-side, using browser print or a lightweight PDF library)
- [PLANNED] Report covers: total activities by type, plants tended, frequency trends, care gaps

### Multilingual Support
The app will support English, Spanish, and French as the first three languages.

- [PLANNED] i18n architecture — React context-based locale provider, translation key files
- [PLANNED] Language selection in Settings
- [PLANNED] All UI strings extracted to translation files
- [PLANNED] Activity type labels localized
- [PLANNED] Care urgency labels localized
- [PLANNED] Date/time formatting by locale (dayjs locale support)
- [PLANNED] RTL support deferred to a future phase

Translation key files will live in `src/i18n/{locale}.json`.
Default locale: `en`.

---

## Phase 4 — Garden Visualization (Future)

### Interactive Garden Map
A visual, top-down view of the user's garden rendered using Phaser (or a comparable WebGL-capable 2D library). Each plant occupies a position in the visual space. Plant appearance, animation state, and neighbor relationships reflect real data.

Goals:
- Provide an at-a-glance overview of the entire garden's health.
- Show companion relationships as visible connections between plants.
- Animate care urgency: a plant that is overdue begins to wilt visually.
- Allow the user to tap a plant in the visualization to navigate to its detail view.

Architecture notes:
- Phaser renders to a canvas element inside a React wrapper.
- Plant positions can be manually arranged by the user or auto-laid-out by a force-directed algorithm.
- The visualization reads from the same AlaSQL local database — no new data layer.
- Plant growth stage and urgency state are mapped to sprite/animation sets.

Implementation steps:
- [FUTURE] Evaluate Phaser vs. lightweight alternatives (Konva, PixiJS) for bundle size impact
- [FUTURE] Design sprite set for each growth stage (seed, shoot, bush) and care state (healthy, mild, severe)
- [FUTURE] Build React wrapper component for the Phaser canvas
- [FUTURE] Position persistence: save plant (x, y) to `additional_info` in the plants table
- [FUTURE] Companion relationship rendering as edges/lines between plant nodes
- [FUTURE] Animated transitions for state changes

---

## Phase 5 — Identity Hardening (Future)

- [FUTURE] Passphrase protection for the garden key file (PBKDF2-derived key wrapping)
- [PLANNED] Idle-lock: after a configurable period of inactivity, localStorage data is encrypted with a passphrase-derived key and requires unlock to access
- [FUTURE] Biometric unlock on mobile (Web Authentication API / device keychain)
- [FUTURE] Key rotation: generate new key pair and re-encrypt all data while preserving history

---

## Open Technical Debt

| Item | Description | Priority |
|---|---|---|
| DEBT | `database.ts` has `console.log` calls with `alasql` debug output in production. Should be removed or gated behind `import.meta.env.DEV`. | Medium |
| DEBT | `GardenView.tsx` has a `<Bug />` icon import from Lucide that is only shown in a debug overlay. This overlay and its import should be removed from production builds. | Low |
| DEBT | `supabaseService.ts` uses `.single()` for the backup download query — should use `.maybeSingle()` to avoid throwing when no backup exists. | High |
| DEBT | Image data URLs stored in localStorage under `plant_image_*` keys from the old image system may still exist on some devices. The new sync layer should handle graceful detection of stale keys. | Medium |
| DEBT | The `restoreBackupFromObject()` method in `database.ts` does not handle schema migrations. If a new column is added in a future release, old backup objects will be missing that column. A schema version field and migration function must be added. | High |
| DEBT | After restoring from cloud backup on a new device, locally-cached images are absent until `imageSync.ts` fetches and decrypts them from Supabase. The restore flow should trigger an image sync pass automatically. | High |
| DEBT | The service worker's upload queue uses `XMLHttpRequest` patterns. Should be standardized to `fetch` with the same retry logic. | Low |
| DEBT | No error boundary in the React tree. An unhandled render error in any component will blank the entire app. Add a top-level `ErrorBoundary`. | Medium |
| DEBT | `stores.ts` uses a custom Svelte-inspired store pattern rather than React state. Consider replacing with `useContext` + `useReducer` for consistency. | Low |
| DEBT | The `vite.config.ts` PWA manifest description still reads "Track and manage your garden plots, plants, and activities" — the spiritual metaphor description is absent. | Low |
