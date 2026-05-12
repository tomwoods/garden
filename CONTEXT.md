# CONTEXT.md — What the AI Must Protect, Avoid, and Never Change

## Project Vision

Garden is a private, offline-first spiritual relationship manager. Users tend a metaphorical garden where each plant is a person they care for. The app helps them track their acts of care — conversations, prayer, shared study, service — without exposing any of that data to any server in readable form.

**The central promise to users:** Your data belongs to you. The server holds only encrypted ciphertext that only your private key can unlock.

### Non-Goals

- Garden is **not** a social network or collaboration platform (all sharing features are opt-in and strictly user-controlled).
- Garden is **not** a CRM. There are no tags, funnels, conversion tracking, or performance metrics.
- Garden is **not** a devotional app that explains religion to users. It is a private tool used by people who already have a spiritual framework.
- Garden is **not** a gamified habit tracker. No streaks, points, badges, or leaderboards. Ever.
- Garden is **not** a calendar app. Scheduling is supportive, not central.

---

## Branding and Visual Rules

### Color Palette

The app uses a green-based palette anchored to growth, nature, and life. The primary brand color is `green-600` (#16a34a).

| Role | Tailwind Class | Usage |
|---|---|---|
| Primary action | `green-600` / `green-700` | CTA buttons, icons, active states |
| Background light | `green-50` / `emerald-100` | Page backgrounds, cards |
| Background gradient | `from-green-50 to-emerald-100` | Welcome screen, section headers |
| Success / healthy | `green-500` | Health indicators |
| Warning / mild urgency | `amber-500` | Mild care urgency |
| Danger / severe urgency | `red-500` | Overdue care, errors |
| Neutral text | `gray-800` / `gray-600` | Body text |
| Subtle text | `gray-400` | Secondary labels, timestamps |
| Surface | `white` | Cards, modals |

**Prohibited colors:** Purple, indigo, violet, and all shades in those families. This is a firm constraint, not a preference.

### Typography

- Maximum 3 font weights in any view: regular (400), semibold (600), bold (700).
- Headings: bold, gray-800 or white depending on background.
- Body: regular, gray-600.
- Timestamps and meta: regular or medium, gray-400.
- Do not introduce custom fonts. The app uses the system font stack via Tailwind defaults.

### Iconography

- **Only Lucide React.** No other icon library, no SVG imports of external icon sets, no emoji as UI controls.
- Icons in buttons must always have an accessible label (`aria-label` or adjacent visible text).

### Spacing

- The app uses an 8px base spacing system via Tailwind (p-2 = 8px, p-4 = 16px, etc.).
- Maintain consistent padding inside cards: `p-4` or `p-6`.
- Modal content padding: `p-6`.

### Animations

- Transitions only: `transition-colors`, `transition-opacity`, `transition-transform`.
- Duration: 150–200ms for micro-interactions, 300ms for modals.
- No animation libraries. No keyframe-heavy effects.

### Plant Visualizations (SVG Overlays)

The plant card uses SVG overlays from `/public/` and `/src/assets/` to represent growth stages and care urgency. These files must not be modified:
- `up_to_2_days.svg`
- `up_to_7_days.svg`
- `up_to_21_days.svg`
- `up_to_600_days.svg`
- `up_to_600_days_with_fruit.svg`
- `over_600_days.svg`
- `over_600_days_with_fruit.svg`
- `brown_overlay.svg` (severe urgency)
- `yellow_overlay.svg` (mild urgency)
- `dirt_overlay.svg`

---

## Protected Files — Do Not Modify Without Explicit Instruction

These files encode core security, identity, or data architecture decisions that cannot be changed casually:

| File | Why Protected |
|---|---|
| `src/lib/cryptoService.ts` | Defines the encryption algorithm. Changing it breaks all existing backups. |
| `src/lib/signatureService.ts` | Defines backup signature verification. Changing it breaks server-side validation. |
| `src/lib/database.ts` — schema section | AlaSQL table definitions. Adding columns requires migration logic in `restoreBackupFromObject`. |
| `src/lib/sharedGardenDatabase.ts` — schema section | AlaSQL table definitions for all shared garden databases. Changing table definitions breaks all synced shared gardens for all members. |
| `src/lib/sharedGardenSyncService.ts` — encryption functions | `encryptGardenObject` / `decryptGardenObject` / invite handshake. Any change to key format or encryption algorithm makes existing shared gardens unreadable. |
| `src/lib/plantLinkService.ts` — link format | The `sharedGardenLink` sub-field structure stored in `plants.additional_info`. Changing field names breaks existing linked plants silently. |
| `public/custom-sw.js` | Service worker. Incorrect changes break offline support, notifications, and upload queue. |
| `supabase/functions/update-backup/index.ts` | Server-side backup signature verification. Must stay in sync with `signatureService.ts`. |
| `supabase/functions/upload-plant-image/index.ts` | Image upload security. Must stay in sync with image signing in `uploadService.ts` / `imageSync.ts`. |
| `supabase/functions/get-plant-image/index.ts` | Image retrieval. Signature verification must match the scheme in `imageSync.ts`. |
| `supabase/functions/delete-plant-image/index.ts` | Image deletion. Signature verification must match the scheme in `imageSync.ts`. |
| `supabase/functions/sync-shared-garden/index.ts` | Shared garden read/write/remove-member. Signature scheme and optimistic concurrency must stay in sync with `sharedGardenSyncService.ts`. |
| `supabase/functions/claim-garden-share/index.ts` | Garden invite redemption. Signature verification and `authorized_users` mutation must match the client invite flow. |
| `supabase/functions/sync-shared-plant/index.ts` | Shared plant read/write. Must stay in sync with `sharedBackupService.ts`. |
| `supabase/functions/claim-plant-share/index.ts` | Plant invite redemption. Must match the client invite flow in `sharedBackupService.ts`. |
| Personal garden key file format (`garden-key.json`) | 5-field structure: `id`, `publicKey`, `privateKey`, `signingPublicKey`, `signingPrivateKey`. Changing the shape breaks restore for all existing users. |
| Shared garden key file format (`{name}-garden-key.json`) | 7-field structure: `gardenId`, `sharedGardenId`, `gardenName`, `myUuid`, `myDisplayName`, `gardenPrivateKey`, `gardenPublicKey`. Changing the shape breaks restore from existing key files. |

**Rule:** If a task requires modifying any of the above, confirm the full impact before proceeding.

---

## Never-Do List

### Code Quality
- Never use inline styles (`style={{}}`). Always use Tailwind classes.
- Never use `!important` in any CSS.
- Never introduce a new npm package without checking `package.json` first and getting user approval.
- Never use `any` in TypeScript unless the existing file already uses it in that context.
- Never add `console.log` calls that output plant names, user data, or activity content.
- Never create `.css` or `.module.css` files. All styling is Tailwind.

### Security
- Never send plaintext user data (plant names, activities, notes) to any server.
- Never log or expose private keys, even in development.
- Never store sensitive data in sessionStorage or cookies.
- Never add a third-party analytics SDK, tracking pixel, or telemetry service.
- Never call external APIs from the client without routing through a Supabase Edge Function.
- Never bypass or weaken the face detection check in `faceDetection.ts`.
- Never lower the RSA key size below 2048 bits.

### UX / Product
- Never add gamification features: streaks, points, badges, leaderboards, achievement toasts.
- Never add social features that make any user's data visible to others without explicit opt-in sharing.
- Never add push notification opt-in at app launch. It must only be offered from Settings.
- Never display a loading spinner for local database operations — they are synchronous and fast.
- Never remove the garden key backup prompt for new users. It is the only disaster recovery mechanism.
- Never make the spiritual metaphor explicit in UI copy.
- Never add purple, indigo, or violet anywhere in the UI.

### Database / Schema
- Never drop columns. Add nullable columns only, with migration logic in `restoreBackupFromObject`.
- Never change the `id` field type of any table (always UUID string).
- Never store images as base64 data URLs in the AlaSQL database — images go to localStorage via `plant_image_*` keys (local cache) or to the `plant_images` Postgres table (encrypted blobs).
- Never upload plaintext image data to Supabase — images must be AES-GCM encrypted client-side before calling `upload-plant-image`.
- Never store plaintext garden data in the `users.encrypted_backup` column.

---

## Architecture Invariants

These are load-bearing decisions. They must not change without a full architectural review:

1. **Offline-first.** The app must be fully functional without an internet connection. Supabase is enhancement, not requirement.
2. **No auth service.** There is no login/password. The garden key file IS the user's identity. Identity cannot be delegated to an OAuth provider or auth table.
3. **End-to-end encryption.** All encryption and decryption happens in the browser. The server never sees plaintext data. This must be preserved for all data types including future sharing features.
4. **AlaSQL + localStorage as local database.** Do not migrate to IndexedDB directly or SQLite-wasm without a full data migration strategy.
5. **React + Vite + Tailwind.** Do not introduce a component library (MUI, Chakra, shadcn, etc.) that conflicts with Tailwind.
6. **Single-user garden key.** One user = one UUID = one key pair. The multi-device scenario is handled by backup/restore, not account merging.
