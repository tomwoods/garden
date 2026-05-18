# Garden — Private Spiritual Relationship Manager

Garden is a privacy-first Progressive Web App for tracking and nurturing personal relationships through a garden metaphor. Each plant represents a person; each act of care represents a spiritual or relational gesture. All data is encrypted client-side and lives on the user's device. Cloud sync is optional and zero-knowledge.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Build Tool | Vite | 5.4.2 |
| Styling | Tailwind CSS | 3.4.1 |
| Routing | React Router | 7.8.2 |
| Local Database | AlaSQL + localStorage | 4.6.6 |
| Cloud Backend | Supabase (Postgres + Edge Functions) | 2.57.0 |
| Icons | Lucide React | 0.344.0 |
| Maps | Leaflet + React Leaflet | 1.9.4 / 4.2.1 |
| Dates | dayjs | 1.11.18 |
| PWA | vite-plugin-pwa + Workbox | 1.2.0 / 7.4.0 |
| Encryption | Web Crypto API (RSA-OAEP, AES-GCM, RSA-PSS) | native |
| Image Signing | @noble/curves (secp256k1) | 2.0.0 |
| Hashing | @noble/hashes (SHA-256) | 2.0.0 |
| IDs | uuid v4 | 11.1.0 |
| Image Upload | UploadThing (proxied via Edge Function) | 7.7.4 |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser / PWA                            │
│                                                                  │
│  ┌──────────────────────────┐  ┌────────────────────────────┐   │
│  │  React App               │  │  Service Worker            │   │
│  │  (UI + Logic)            │  │  - Asset caching (Workbox) │   │
│  │                          │  │  - Notification scheduling │   │
│  │  GardenDB (AlaSQL)       │  │  - Upload queue (IndexedDB)│   │
│  │  Personal garden         │  └────────────────────────────┘   │
│  │                          │                                    │
│  │  SharedGarden_{id} ×N    │                                    │
│  │  One AlaSQL DB per       │                                    │
│  │  shared garden joined    │                                    │
│  └────────────┬─────────────┘                                    │
└───────────────┼──────────────────────────────────────────────────┘
                │ (optional, all data encrypted before leaving device)
                ▼
┌──────────────────────────────────────────────────────────────────┐
│                          Supabase                                │
│                                                                  │
│  Postgres Tables:                                                │
│  - users               (id, public_key, encrypted_backup)        │
│  - plant_images        (E2EE encrypted blobs, quota 100/user)    │
│  - shared_plants       (E2EE per-plant blob + roles JSONB)       │
│  - plant_share_claims  (ephemeral invite claims)                 │
│  - shared_gardens      (E2EE per-garden blob)                    │
│  - garden_share_claims (ephemeral invite claims, 72hr TTL)       │
│  - autocomplete_values (community-shared anonymous text)         │
│                                                                  │
│  Edge Functions (Deno):                                          │
│  Personal:                                                       │
│  - register-user          POST /functions/v1/register-user       │
│  - update-backup          POST /functions/v1/update-backup       │
│  - upload-plant-image     POST /functions/v1/upload-plant-image  │
│  - get-plant-image        POST /functions/v1/get-plant-image     │
│  - delete-plant-image     POST /functions/v1/delete-plant-image  │
│  Shared Gardens:                                                 │
│  - create-shared-garden   POST /functions/v1/create-shared-garden│
│  - sync-shared-garden     POST /functions/v1/sync-shared-garden  │
│  - create-garden-share-claim  POST /functions/v1/...             │
│  - claim-garden-share     POST /functions/v1/claim-garden-share  │
│  Shared Plants:                                                  │
│  - create-shared-plant    POST /functions/v1/create-shared-plant │
│  - sync-shared-plant      POST /functions/v1/sync-shared-plant   │
│  - create-share-claim     POST /functions/v1/create-share-claim  │
│  - claim-plant-share      POST /functions/v1/claim-plant-share   │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow Principles

1. **All data is created locally first.** AlaSQL writes to localStorage immediately.
2. **Cloud sync is fire-and-forget.** If Supabase is unreachable, the local state is authoritative.
3. **Backups are encrypted before leaving the device.** The Supabase `users` table only ever receives an encrypted blob.
4. **Images are compressed to 720px max dimension** before upload. They are stored as E2EE encrypted blobs directly in Postgres (not CDN).
5. **Identity = garden key file.** No passwords. No OAuth. The JSON key file contains the user's UUID and both RSA key pairs.
6. **Shared gardens use a per-garden RSA key pair.** The garden private key is held locally by each member and distributed via ephemeral RSA handshake at invite time. The server never sees it.
7. **Shared plants use per-member public key encryption.** Each authorized user's copy of the plant key is encrypted with their personal RSA public key.

---

## Directory Structure

```
/
├── src/
│   ├── App.tsx                    # Root: routing, key lifecycle, SW integration
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Tailwind base imports
│   │
│   ├── components/
│   │   ├── GardenView.tsx              # Main personal garden dashboard
│   │   ├── PlantCard.tsx               # Card with SVG growth visualization
│   │   ├── PlantDetailView.tsx         # Plant profile — timeline, activities, images
│   │   ├── ActivityListView.tsx        # Filtered activity timeline per type
│   │   ├── ActivityModal.tsx           # Log/edit any activity type
│   │   ├── AddPlantModal.tsx           # Create new plant
│   │   ├── EditPlantModal.tsx          # Edit existing plant
│   │   ├── BulkActivityModal.tsx       # Log one activity across multiple plants
│   │   ├── BulkNotchingModal.tsx       # Log a Ruhi study session for multiple plants
│   │   ├── ScheduleCareModal.tsx       # Schedule a future care event
│   │   ├── PlotDetailView.tsx          # Plot profile with member plants
│   │   ├── PlotsView.tsx               # All personal plots listing
│   │   ├── AddEditPlotModal.tsx        # Create/edit a plot
│   │   ├── SettingsView.tsx            # Preferences, backup, export, notifications
│   │   ├── WelcomeScreen.tsx           # Onboarding: create or restore garden
│   │   ├── KeyBackupPrompt.tsx         # Prompt user to download key file
│   │   ├── PlantImageCapture.tsx       # Camera/file upload with face detection
│   │   ├── PlantImageViewer.tsx        # Image gallery for a plant
│   │   ├── ImageQuotaModal.tsx         # Quota warning dialog
│   │   ├── PlantSelectorChecklist.tsx  # Multi-select for bulk ops
│   │   ├── SlidingMenu.tsx             # Navigation drawer
│   │   ├── MapOverlay.tsx              # Leaflet map for location selection
│   │   ├── LocationPicker.tsx          # Location input component
│   │   ├── ConfirmationModal.tsx       # Generic confirm/cancel dialog
│   │   ├── AdditionalInfoMenu.tsx      # Dynamic custom field editor
│   │   ├── Toast.tsx / ToastContainer.tsx
│   │   ├── InstallPrompt.tsx / IOSInstallInstructions.tsx / UpdatePrompt.tsx
│   │   │
│   │   ├── # Shared Gardens
│   │   ├── SharedGardensListView.tsx   # List all joined shared gardens
│   │   ├── SharedGardenView.tsx        # Shared garden dashboard
│   │   ├── SharedPlantDetailView.tsx   # Shared plant profile with full timeline
│   │   ├── SharedPlotsView.tsx         # Plots list for a shared garden
│   │   ├── SharedPlotDetailView.tsx    # Shared plot detail with bulk activity
│   │   ├── CreateSharedGardenModal.tsx # Create new garden or restore from key file
│   │   ├── InviteToSharedGardenModal.tsx # Generate invite link with QR code
│   │   ├── JoinSharedGardenView.tsx    # Claim invite and join garden
│   │   ├── ManageMembersModal.tsx      # List members, invite, remove
│   │   ├── GardenChangeLogCard.tsx     # Paginated audit log
│   │   │
│   │   └── # Shared Plants
│   │       ├── SharePlantModal.tsx     # Share a personal plant via invite link
│   │       └── ReceivePlantShareView.tsx # Accept and import a shared plant
│   │
│   ├── hooks/
│   │   └── useToast.ts                 # Toast state management hook
│   │
│   └── lib/
│       ├── database.ts                 # Personal AlaSQL DB: all CRUD, backup/restore
│       ├── supabase.ts                 # Supabase client singleton
│       ├── supabaseService.ts          # Cloud backup: register, upload, download
│       ├── cryptoService.ts            # RSA-OAEP encryption, AES-GCM hybrid
│       ├── signatureService.ts         # RSA-PSS signing and verification
│       ├── uploadService.ts            # Image upload queue, quota tracking
│       ├── imageSync.ts                # Sync encrypted image blobs from server
│       ├── imageProcessing.ts          # Compress images to ≤720px
│       ├── faceDetection.ts            # Reject images containing faces
│       ├── notificationService.ts      # Browser notification scheduling
│       ├── stores.ts                   # Reactive state (user, garden, sync)
│       ├── syncService.ts              # Personal garden multi-device merge
│       ├── sharedGardenDatabase.ts     # Per-garden AlaSQL DB + SharedGardenRef registry
│       ├── sharedGardenSyncService.ts  # Shared garden sync engine + invite flow
│       ├── sharedBackupService.ts      # Shared plant sync engine + invite flow
│       ├── plantLinkService.ts         # Bidirectional personal↔shared plant linking
│       ├── harvestService.ts           # Anonymized harvest report generation
│       ├── collectivePulseService.ts   # Aggregate metrics from harvest reports
│       └── sowingSeasonService.ts      # Sowing season window detection
│
├── public/
│   ├── custom-sw.js               # Custom service worker (Workbox + custom logic)
│   ├── manifest.json              # PWA manifest
│   ├── *.svg                      # Plant growth stage overlays
│   └── icon-*.png                 # PWA icons
│
├── supabase/
│   ├── migrations/                     # Postgres schema migrations (apply with MCP tool)
│   └── functions/                      # Deno edge functions
│       ├── register-user/              # User registration
│       ├── update-backup/              # Personal encrypted backup upload
│       ├── upload-plant-image/         # E2EE image upload (RSA-PSS verified)
│       ├── get-plant-image/            # E2EE image retrieval
│       ├── delete-plant-image/         # Image deletion
│       ├── create-shared-garden/       # Create new shared garden
│       ├── sync-shared-garden/         # Read/write/remove-member for shared garden
│       ├── create-garden-share-claim/  # Generate garden invite via ephemeral key
│       ├── claim-garden-share/         # Redeem garden invite claim
│       ├── create-shared-plant/        # Create shared plant record
│       ├── sync-shared-plant/          # Read/write shared plant
│       ├── create-share-claim/         # Generate plant invite claim
│       └── claim-plant-share/          # Redeem plant invite claim
│
├── CLAUDE.md                      # Agent instructions
├── CONTEXT.md                     # Protected files, never-do list
├── README.md                      # This file
├── USERFLOWS.md                   # User journeys and edge cases
├── ROADMAP.md                     # Feature status and milestones
├── VISION.md                      # Long-term product vision
├── MEMORY.md                      # Decision log
├── PRD.md                         # Product requirements document
└── DATA-MODEL.md                  # Full schema, types, API contracts
```

---

## Environment Variables

Create `.env` in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The edge functions use environment variables that are automatically injected by Supabase:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPLOADTHING_SECRET` (set via Supabase secrets dashboard)

---

## Running the App

```bash
npm install
npm run dev       # Start development server (Vite, hot reload)
npm run build     # Production build
npm run preview   # Preview production build locally
npm run lint      # ESLint check
```

The PWA service worker is disabled in development (`devOptions.enabled: false` in `vite.config.ts`).

---

## Routing

### Personal Garden
| Route | Component | Description |
|---|---|---|
| `/` | `GardenView` | Main personal garden dashboard |
| `/plants/:plantId` | `PlantDetailView` | Plant profile |
| `/plants/:plantId/activities/:activityType` | `ActivityListView` | Filtered activity timeline |
| `/settings` | `SettingsView` | App settings |
| `/plots` | `PlotsView` | All personal plots |
| `/plots/:plotId` | `PlotDetailView` | Personal plot detail |

### Shared Gardens
| Route | Component | Description |
|---|---|---|
| `/shared-gardens` | `SharedGardensListView` | List of all joined shared gardens |
| `/shared-garden/:gardenId` | `SharedGardenView` | Shared garden dashboard |
| `/shared-garden/:gardenId/plants/:plantId` | `SharedPlantDetailView` | Shared plant profile with full activity timeline |
| `/shared-garden/:gardenId/plots` | `SharedPlotsView` | Plots list for a shared garden |
| `/shared-garden/:gardenId/plots/:plotId` | `SharedPlotDetailView` | Shared plot detail with bulk activity |
| `/join-shared-garden/:gardenId` | `JoinSharedGardenView` | Invite claim redemption (opened from invite link) |

### Shared Plants (standalone)
| Route | Component | Description |
|---|---|---|
| `/receive-plant-share` | `ReceivePlantShareView` | Accept an incoming shared plant invite |

**Deep linking from notifications:** Notifications include a `?plant={plantId}` query parameter. `GardenView` detects this on mount and navigates to the plant detail view, then clears the parameter from the URL.

---

## Key Design Decisions

For the full rationale behind each decision, see `MEMORY.md`.

- **AlaSQL over IndexedDB directly:** AlaSQL provides SQL query syntax over localStorage, giving us relational joins and sorting without the async complexity of raw IndexedDB.
- **No authentication service:** The garden key file is the identity. This eliminates the account recovery problem and makes the app usable without any server.
- **RSA-PSS for all Edge Function signatures:** A unified signing scheme for backups, images, and shared garden operations. The same key pair is used across all server-side verification.
- **E2EE images stored as Postgres text columns:** Images are AES-GCM encrypted client-side and stored as base64 blobs in `plant_images`. No CDN URLs — the server sees only ciphertext.
- **Single RSA key pair per shared garden:** All members encrypt/decrypt the same ciphertext blob. The garden private key is distributed via ephemeral RSA handshake at invite time — the server never holds it. See Decision 18 in `MEMORY.md`.
- **Snapshot + delta log for shared sync:** Rather than replacing the full garden on every write, members append deltas. Compaction at 50 deltas keeps the payload size bounded. See Decision 17 in `MEMORY.md`.
- **Plant-to-garden links via `additional_info`:** Bidirectional links between personal plants and shared garden plants are stored as JSON sub-fields, avoiding schema changes. See Decision 19 in `MEMORY.md`.
