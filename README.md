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
┌─────────────────────────────────────────────────────────┐
│                      Browser / PWA                      │
│                                                         │
│  ┌───────────────┐   ┌───────────────────────────────┐  │
│  │  React App    │   │  Service Worker (custom-sw.js) │  │
│  │  (UI + Logic) │   │  - Asset caching (Workbox)     │  │
│  │               │   │  - Notification scheduling     │  │
│  │  AlaSQL DB    │   │  - Upload queue (IndexedDB)    │  │
│  │  (localStorage│   └───────────────────────────────┘  │
│  │   backend)    │                                       │
│  └───────┬───────┘                                       │
└──────────┼────────────────────────────────────────────┘
           │ (optional, encrypted)
           ▼
┌──────────────────────────────────────────────────────────┐
│                     Supabase                             │
│                                                          │
│  Postgres Tables:                                        │
│  - users (id, public_key, encrypted_backup)              │
│  - shared_plants (for future plant sharing)              │
│  - plant_images (metadata: url, hash, quota tracking)    │
│                                                          │
│  Edge Functions (Deno):                                  │
│  - register-user     POST /functions/v1/register-user    │
│  - update-backup     POST /functions/v1/update-backup    │
│  - upload-image      POST /functions/v1/upload-image     │
│  - delete-image      POST /functions/v1/delete-image     │
│  - uploadthing-route POST /functions/v1/uploadthing-route│
│                                                          │
│  Storage:                                                │
│  - Supabase Storage  (images, E2EE at 720px)             │
└──────────────────────────────────────────────────────────┘
```

### Data Flow Principles

1. **All data is created locally first.** AlaSQL writes to localStorage immediately.
2. **Cloud sync is fire-and-forget.** If Supabase is unreachable, the local state is authoritative.
3. **Backups are encrypted before leaving the device.** The Supabase `users` table only ever receives an encrypted blob.
4. **Images are compressed to 720px max dimension** before upload. They are stored in Supabase Storage with E2EE metadata.
5. **Identity = garden key file.** No passwords. No OAuth. The JSON key file contains the user's UUID and both RSA key pairs.

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
│   │   ├── GardenView.tsx         # Main dashboard — plant list, search, sync
│   │   ├── PlantCard.tsx          # Card with SVG growth visualization
│   │   ├── PlantDetailView.tsx    # Plant profile — timeline, activities, images
│   │   ├── ActivityListView.tsx   # Filtered activity timeline per type
│   │   ├── ActivityModal.tsx      # Log/edit any activity type
│   │   ├── AddPlantModal.tsx      # Create new plant
│   │   ├── EditPlantModal.tsx     # Edit existing plant
│   │   ├── BulkActivityModal.tsx  # Log one activity across multiple plants
│   │   ├── ScheduleCareModal.tsx  # Schedule a future care event
│   │   ├── PlotDetailView.tsx     # Plot profile with member plants
│   │   ├── PlotsView.tsx          # All plots listing
│   │   ├── AddEditPlotModal.tsx   # Create/edit a plot
│   │   ├── SettingsView.tsx       # Preferences, backup, export, notifications
│   │   ├── WelcomeScreen.tsx      # Onboarding: create or restore garden
│   │   ├── KeyBackupPrompt.tsx    # Prompt user to download key file
│   │   ├── PlantImageCapture.tsx  # Camera/file upload with face detection
│   │   ├── PlantImageViewer.tsx   # Image gallery for a plant
│   │   ├── ImageQuotaModal.tsx    # Quota warning dialog
│   │   ├── ManageMembersModal.tsx # (Future) Plant sharing members
│   │   ├── PlantSelectorChecklist.tsx # Multi-select for bulk ops
│   │   ├── SlidingMenu.tsx        # Navigation drawer
│   │   ├── MapOverlay.tsx         # Leaflet map for location selection
│   │   ├── LocationPicker.tsx     # Location input component
│   │   ├── ConfirmationModal.tsx  # Generic confirm/cancel dialog
│   │   ├── AdditionalInfoMenu.tsx # Dynamic custom field editor
│   │   ├── Toast.tsx              # Single toast notification
│   │   ├── ToastContainer.tsx     # Toast list manager
│   │   ├── InstallPrompt.tsx      # PWA install prompt
│   │   ├── IOSInstallInstructions.tsx # iOS-specific install guide
│   │   └── UpdatePrompt.tsx       # App update available banner
│   │
│   ├── hooks/
│   │   └── useToast.ts            # Toast state management hook
│   │
│   └── lib/
│       ├── database.ts            # AlaSQL local DB: all CRUD, backup/restore
│       ├── supabase.ts            # Supabase client singleton
│       ├── supabaseService.ts     # Cloud backup: register, upload, download
│       ├── cryptoService.ts       # RSA-OAEP encryption, AES-GCM hybrid
│       ├── signatureService.ts    # RSA-PSS signing and verification
│       ├── uploadService.ts       # Image upload queue, quota tracking
│       ├── imageSyncService.ts    # Sync image URLs from server to local
│       ├── imageProcessing.ts     # Compress images to ≤720px
│       ├── faceDetection.ts       # Reject images containing faces
│       ├── fileHashing.ts         # SHA-256 file hashing
│       ├── notificationService.ts # Browser notification scheduling
│       ├── stores.ts              # Reactive state (user, garden, sync)
│       ├── uploadthing.ts         # UploadThing client setup
│       └── uploadthingConfig.ts   # UploadThing configuration
│
├── public/
│   ├── custom-sw.js               # Custom service worker (Workbox + custom logic)
│   ├── manifest.json              # PWA manifest
│   ├── *.svg                      # Plant growth stage overlays
│   └── icon-*.png                 # PWA icons
│
├── supabase/
│   ├── migrations/                # Postgres schema migrations (apply with MCP tool)
│   └── functions/                 # Deno edge functions
│       ├── register-user/
│       ├── update-backup/
│       ├── upload-image/
│       ├── delete-image/
│       └── uploadthing-route/
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

| Route | Component | Description |
|---|---|---|
| `/` | `GardenView` | Main dashboard |
| `/plants/:plantId` | `PlantDetailView` | Plant profile |
| `/plants/:plantId/activities/:activityType` | `ActivityListView` | Filtered activity timeline |
| `/settings` | `SettingsView` | App settings |
| `/plots` | `PlotsView` | All plots |
| `/plots/:plotId` | `PlotDetailView` | Plot detail |

**Deep linking from notifications:** Notifications include a `?plant={plantId}` query parameter. `GardenView` detects this on mount and navigates to the plant detail view, then clears the parameter from the URL.

---

## Key Design Decisions

For the full rationale behind each decision, see `MEMORY.md`.

- **AlaSQL over IndexedDB directly:** AlaSQL provides SQL query syntax over localStorage, giving us relational joins and sorting without the async complexity of raw IndexedDB.
- **No authentication service:** The garden key file is the identity. This eliminates the account recovery problem and makes the app usable without any server.
- **RSA-PSS for backup signatures:** Prevents a rogue server or MITM from overwriting a user's backup with corrupted data.
- **secp256k1 for image signatures:** Lightweight, well-audited, matches the domain of the `@noble/curves` library already in the dependency tree.
- **Face detection on upload:** Protects the user from accidentally uploading photos of people, preserving the anonymity of their spiritual relationships.
- **Supabase Storage for images (not UploadThing directly):** All image infrastructure runs through Supabase to maintain a single backend dependency. UploadThing integration exists as a proxy layer for CDN delivery but may be removed in future.
