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

### Plants (Souls) — Extended Fields
- [DONE] Age picker — record person's age at time of entry; effective age computed dynamically (`AgePicker`, stored in `additional_info.age_info`)
- [DONE] Location picker — optional lat/lng stored in `additional_info.location`; viewable on an in-app map (`LocationPicker`, `MapOverlay`)
- [DONE] Image attachment — one photo per plant; face detection gates upload; crop tool available (`PlantImageCapture`, `CropModal`)

### Activities (Acts of Care)
- [DONE] Tending (quality time) — type selection + summary
- [DONE] Watering (sharing writings) — source + progress; learning source autocomplete backed by `autocomplete_values`
- [DONE] Sunlight (prayer) — topic
- [DONE] Fruit (service) — description; optional basic activity classification (preset types + "Other" free-text backed by shared `autocomplete_values` with `basic_activity` type)
- [DONE] Pruning (difficult conversation) — difficulty + description
- [DONE] Companion (relationship memory) — descriptor + linked plant
- [DONE] Edit and delete for all activity types
- [DONE] Custom datetime per activity (backdate support)
- [DONE] Additional custom fields per activity (JSON `additional_info`)
- [DONE] Activity timeline on plant detail view (merged and sorted)
- [DONE] Bulk activity logging (Tending and Watering across multiple plants)
- [DONE] Bulk Notching — log a Ruhi study session for multiple plants at once (`BulkNotchingModal`)

### Branches (Capacity Development)
- [DONE] Buds — record potential interests and gifts per person (`buds` table)
- [DONE] Notchings — track systematic Ruhi curriculum study sessions per person (`notchings` table; book, unit/section range, sections studied, progress description)
- [DONE] Capabilities — record proven developed capacities per person (`capabilities` table)
- [DONE] Branches card in `PlantDetailView` with full-row tap targets for mobile usability
- [DONE] Community autocomplete for proven capacities backed by shared `autocomplete_values` table

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

### Sowing Season
- [DONE] `sowingSeasonService.ts` — four annual 14-day sowing windows (Spring, Early Summer, Autumn, Winter); computes state (dormant / approaching / active) and days remaining
- [DONE] `SowingSeasonBanner` — contextual banner in `GardenView` during active and approaching windows

### Shared Autocomplete
- [DONE] `autocomplete_values` table in Supabase — stores community learning sources and proven capacities (no personal data)
- [DONE] `AutocompleteInput` component — ranked dropdown with 24-hour local cache, keyboard navigation
- [DONE] `LearningSourceInput` — autocomplete for Watering activities, upserts on submit
- [DONE] Proven capacity autocomplete in Branches / Capabilities form

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
- [DONE] Image sync from server to local (`imageSync.ts`) — fetch encrypted blob, decrypt client-side, cache in localStorage
- [DONE] Image display in `PlantDetailView` — show local cached image or fetch from server on demand (`PlantImageViewer`)
- [DONE] Image upload queue with retry logic (`uploadService.ts` — async queue, max 3 retries)
- [DONE] Image crop tool before save (`CropModal`)
- [DONE] Signature scheme unified to RSA-PSS for all Edge Function calls (images and backups use the same key pair)

### Multi-Device Sync
- [DONE] Encrypted backup stored in Supabase after each write
- [DONE] Restore from server backup via garden key file
- [DONE] Conflict detection and per-record merge — when a device with pending local changes encounters a newer server backup, `mergeBackups()` in `syncService.ts` unions all records by `id` across 10 tables and resolves conflicts using a timestamp priority chain (`last_interaction` → `datetime` → `created_at`). The user confirms before the merged result is applied and re-uploaded.
- [PLANNED] Passphrase-lock for localStorage — after a configurable idle period, local data is encrypted at rest using a passphrase-derived key (PBKDF2). The user must re-enter their passphrase to unlock. This is additive security on top of the existing key file system.

---

## Phase 3 — Sharing, Reporting, and Localization (In Progress)

### Shared Gardens
A fully collaborative garden where any number of members co-tend the same set of plants and log activities together. All garden data is E2EE — the server holds only ciphertext encrypted with the garden's RSA key pair. The garden private key is held locally by each member and never transmitted to the server (distributed via ephemeral RSA handshake at invite time).

- [DONE] `shared_gardens` Supabase table with `authorized_users` JSONB access control
- [DONE] `garden_share_claims` table — ephemeral invite claims (72-hour TTL short codes)
- [DONE] `sharedGardenDatabase.ts` — per-garden AlaSQL database with 15 tables (13 standard + `garden_members` + `garden_change_log` + `garden_tombstones`)
- [DONE] `sharedGardenSyncService.ts` — snapshot + delta log sync engine; compaction at 50 deltas; 409 conflict retry; tombstone-aware delta application
- [DONE] `create-shared-garden` Edge Function
- [DONE] `sync-shared-garden` Edge Function — `read`, `write`, `remove-member` actions
- [DONE] `create-garden-share-claim` Edge Function — ephemeral key handshake
- [DONE] `claim-garden-share` Edge Function — redeems invite, adds member to `authorized_users`
- [DONE] `CreateSharedGardenModal` — two-tab UI: create new garden or restore from key file
- [DONE] `JoinSharedGardenView` — invite claim redemption flow
- [DONE] `SharedGardensListView` — list all joined gardens with stats
- [DONE] `SharedGardenView` — main shared garden dashboard with plant list and member panel
- [DONE] `SharedPlantDetailView` — full activity timeline for a shared plant
- [DONE] `SharedPlotsView` + `SharedPlotDetailView` — plots and bulk activity in shared garden context
- [DONE] `GardenChangeLogCard` — paginated audit log of all garden actions
- [DONE] `ManageMembersModal` — list members, generate invites, remove members
- [DONE] `InviteToSharedGardenModal` — invite generation with QR code and copy link
- [DONE] Garden key file download and restore from key file
- [DONE] Disconnected garden mode — read-only when removed
- [PLANNED] Key rotation after member removal

### Plant Sharing
A user may share the care record of a specific plant with one other Garden user. Both parties can view and log activities for the shared plant. Data is E2EE — each share has its own RSA key pair distributed via an ephemeral invite claim flow.

- [DONE] `shared_plants` Supabase table with `authorized_users` JSONB and role model (owner / co-tender / viewer)
- [DONE] `plant_share_claims` table — ephemeral invite claims
- [DONE] `sharedBackupService.ts` — per-plant snapshot + delta log sync; owner-only compaction; viewer role skips push
- [DONE] `create-shared-plant`, `sync-shared-plant`, `create-share-claim`, `claim-plant-share` Edge Functions
- [DONE] `plantLinkService.ts` — bidirectional link between personal plant and shared plant; asymmetric activity mirroring
- [DONE] `SharePlantModal` — share a plant via invite link
- [DONE] `ReceivePlantShareView` — accept and import a shared plant
- [PLANNED] Revoke share flow
- [PLANNED] Share plant from `PlantDetailView` directly

### Anonymized Harvest Reports
A user can generate a JSON report of their care activity over a specified time period. All identifying information is replaced with salted SHA-256 hashes — no real names, emails, or plant IDs appear in the exported file.

- [DONE] `harvestService.ts` — generates `HarvestReport` with hashed IDs, age groups, and activity counts
- [DONE] `HarvestPreviewModal` — shows summary metrics before download
- [DONE] `HarvestBriefView` / `HarvestBriefDocument` — inline report view
- [DONE] Date range and optional plant filter
- [DONE] Age categorization: adult / voting youth / youth / junior youth / child (computed from `age_info`)
- [DONE] Download as `harvest-{date}.json`
- [PLANNED] PDF generation (client-side, using browser print)
- [PLANNED] Activity type filter (include/exclude specific types)

### Collective Pulse Analytics
An aggregated, client-side analytical layer that processes one or more `HarvestReport` objects to produce high-level garden health metrics. No data leaves the device.

- [DONE] `collectivePulseService.ts` — computes `CollectivePulse` from reports
- [DONE] `CareIndex` — ratio of plants on-track vs. overdue (`CareIndexBar`)
- [DONE] `GardenBalance` — breakdown of activity types as a radar chart (`FlowerRadarChart`)
- [DONE] `LifecycleVelocity` — seeds / shoots / mature distribution (`LifecycleVelocityDisplay`)
- [DONE] `Momentum` — growing / steady / slowing classification per plant (`MomentumSummary`)
- [DONE] `WeeklyPattern` + `MonthlyTrend` — care rhythm over time (`CommunityRhythmChart`)
- [DONE] `HarvestRatio` — fruit per soul, fruit per tending
- [DONE] `PruningPulse` — pruning count and monthly distribution
- [DONE] Sowing window overlap analysis (`sowingSeasonService.ts`)

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
