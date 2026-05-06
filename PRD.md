# PRD.md — Product Requirements Document

## Overview

Garden is a privacy-first Progressive Web App that helps individuals track and deepen their personal relationships through a spiritual garden metaphor. Each person in the user's life is represented as a plant. Acts of care — conversation, shared prayer, shared study, service, honest dialogue — are recorded as activities. The garden visualizes the health of each relationship based on how recently and consistently it has been tended.

All data is encrypted client-side. The server holds only encrypted ciphertext. The app works fully offline. No user accounts, no passwords, no email required.

---

## Personas

### Primary: The Devoted Friend
A spiritually motivated person who maintains intentional relationships with family, friends, and community members. They pray for people, visit them, share readings or discussions with them, and care when they drift apart. They do not want a CRM — they want a companion tool that honors the weight of these relationships without reducing them to a contact list.

**Needs:**
- A private, offline-first journal of acts of care.
- Visual signals when a relationship has gone quiet.
- Reminders without nagging.
- Absolute confidence that their data is not seen by anyone else.

**Fears:**
- Their garden being readable to a company, a server operator, or an attacker.
- Gamification that trivializes the practice.
- Data loss.

---

### Secondary (Future): The Pastoral Partner
A spiritual companion — a mentor, a deacon, a prayer partner — who shares responsibility for nurturing a specific person with another Garden user. They need to see what their partner has logged for a shared plant, and to add their own care records.

**Needs:**
- Opt-in plant sharing with another user.
- Ability to see the other party's care activities for the shared plant.
- Privacy: shared plants are visible only to explicitly authorized users.

---

### Tertiary (Future): The Community Gardener
A person who maintains many relationships across multiple communities — perhaps a community organizer, a religious teacher, or a pastoral worker. They need an overview of their entire garden at a glance, group organization via plots, and periodic reports for personal reflection.

**Needs:**
- Garden visualization for at-a-glance health overview.
- Plots for group organization.
- Anonymized activity reports for personal review.
- Bulk activity logging.

---

## Feature Requirements

### F1. Identity and Security

**F1.1 Garden Key Creation**
- The system generates two RSA key pairs (RSA-OAEP 2048-bit for encryption, RSA-PSS 2048-bit for signing) when the user creates their garden.
- A unique UUID is assigned as the user ID.
- Keys are stored in localStorage.
- The user is prompted to download a `garden-key.json` file immediately after creation.
- Acceptance: User can create a garden, download the key file, and restore from it on a different browser.

**F1.2 Garden Key Restore**
- The user uploads their `garden-key.json` file.
- The system validates the file structure, restores keys to localStorage, and downloads the encrypted backup from Supabase.
- The encrypted backup is decrypted client-side using the user's private key.
- Acceptance: All plants and activities from before the restore are accessible after restore.

**F1.3 Key Backup Prompt**
- A banner appears in GardenView after first login and on every subsequent launch until the user downloads their key file.
- The banner cannot be permanently dismissed without downloading the key.
- Acceptance: User who has not downloaded the key always sees the prompt on launch.

**F1.4 Passphrase Idle Lock (Planned)**
- After a configurable idle period (default: 30 minutes), the local database is encrypted with a passphrase-derived key (PBKDF2-SHA256, 310,000 iterations).
- The user must enter their passphrase to unlock.
- The passphrase is never stored.
- Acceptance: After idle timeout, the app shows a lock screen. Correct passphrase unlocks, wrong passphrase shows error.

---

### F2. Plants (Souls)

**F2.1 Create Plant**
- Required: name (string, max 100 chars).
- Optional: description, email, phone.
- Required: care frequency (integer + "days" or "weeks" unit, min 1, max 365 days / 52 weeks).
- On creation: `next_scheduled_care` is set to `now + frequency`.
- Acceptance: Plant appears in garden view sorted by care urgency.

**F2.2 Edit Plant**
- All fields editable.
- Changing care frequency recalculates `next_scheduled_care` from `last_cared_for`.
- Acceptance: Edited data persists across app reloads.

**F2.3 Delete Plant**
- Requires confirmation modal.
- Cascades: deletes all tendings, waterings, sunlight, fruits, prunings, companions, and scheduled events for the plant.
- Does not delete plot records — only removes the plant from plot memberships.
- Acceptance: Deleted plant and all its data disappear from all views.

**F2.4 Care Urgency Display**
- Each plant card displays a visual state based on how long since the last Tending or Watering activity.
- `healthy`: within 1× care frequency → green plant SVG.
- `mild`: 1× to 3× care frequency → yellow/amber overlay.
- `severe`: more than 3× → brown overlay.
- Acceptance: A plant tended today shows healthy. A plant not tended in 3× its frequency shows severe.

**F2.5 Growth Stage**
- Plants age from the day they are created:
  - 0–6 days: seed/sprout SVG.
  - 7–89 days: shoot SVG.
  - 90+ days: bush SVG.
- Fruit overlay appears on the plant card if any Fruit activity has been recorded.
- Acceptance: Plant visual matches age and activity history.

**F2.6 Plant Search**
- A search input in GardenView filters plants by name in real time.
- Acceptance: Typing "mar" shows only plants whose names contain "mar" (case-insensitive).

**F2.7 Additional Custom Fields**
- Each plant can have arbitrary additional fields stored as JSON in `additional_info`.
- The `AdditionalInfoMenu` component provides a UI for adding key/value pairs.
- Acceptance: Custom fields survive backup/restore.

---

### F3. Activities (Acts of Care)

**F3.1 Tending (Quality Time)**
- Fields: type (predefined list + custom), summary (free text).
- Predefined types: conversation, coffee, meal, call, message, activity.
- Updates `last_cared_for` and `next_scheduled_care`.
- Acceptance: After logging a Tending, the plant's care clock resets and its urgency state becomes healthy.

**F3.2 Watering (Shared Study / Sacred Writings)**
- Fields: source (free text, what was shared), progress description (free text).
- Updates `last_cared_for` and `next_scheduled_care`.
- Acceptance: Watering resets the care clock identically to Tending.

**F3.3 Sunlight (Prayer)**
- Fields: topic (what was prayed for).
- Does NOT update the care clock.
- Acceptance: Logging Sunlight does not change the plant's urgency state.

**F3.4 Fruit (Selfless Service)**
- Fields: description (what the person did); optional `basic_activity` classification.
- Does NOT update the care clock.
- Shows fruit overlay on plant card if at least one Fruit activity exists.
- **Basic activity classification (optional):**
  - An "Is basic activity?" checkbox reveals the classification field.
  - Preset options: Prayer, Devotional Meeting, Study Circle, Children's Class, Junior Youth Group.
  - An "Other" option opens a free-text autocomplete field backed by the shared `autocomplete_values` table (`basic_activity` type).
  - When `basic_activity` is set, its value is shown as the timeline entry title in place of the generic "Fruit" label.
  - Custom "Other" values entered by the user are contributed to the shared autocomplete table after save. A user re-submitting the same value does not increment the community count (only a different user can increment it).
- Acceptance criteria:
  - Plant card gains fruit overlay after first Fruit is logged.
  - When `basic_activity` is set, that value appears as the title on the timeline entry.
  - Selecting a preset does not write to `autocomplete_values`. Only custom "Other" values do.
  - The autocomplete field for "Other" displays community suggestions ordered by frequency.

**F3.5 Pruning (Difficult Conversation)**
- Fields: difficulty (easy / medium / hard), description.
- Does NOT update the care clock.
- Acceptance: Pruning appears in activity timeline without affecting urgency.

**F3.6 Companion (Relationship Record)**
- Fields: relationship descriptor (free text), linked plant (select from existing plants).
- Stored bidirectionally — queried by `plant_a_id OR plant_b_id`.
- Acceptance: A Companion record appears in the timelines of both linked plants.

**F3.7 Custom Datetime**
- All activity modals allow the user to set a custom date/time for backdating.
- Defaults to current time.
- Acceptance: An activity backdated to last week appears in the timeline at the correct position.

**F3.8 Edit and Delete Activities**
- All activity types support edit and delete.
- Edit: opens the modal pre-populated with existing values.
- Delete: requires confirmation.
- Acceptance: Edited and deleted activities reflect immediately in the timeline.

**F3.9 Bulk Activity Logging**
- User selects multiple plants and logs the same Tending or Watering for all.
- Each plant receives a separate activity record with its own UUID.
- Care clocks updated for all selected plants.
- Acceptance: After bulk log, all selected plants show healthy urgency.

---

### F4. Plots (Groups)

**F4.1 Create and Manage Plots**
- User creates named plots (e.g., "Family," "Prayer Group").
- Optional description per plot.
- Plants can belong to multiple plots.
- Acceptance: A plant can appear in two different plots simultaneously.

**F4.2 Plot Detail View**
- Shows all member plants with their urgency states.
- Quick access to each plant's detail view.
- Acceptance: Plot detail accurately reflects current plant care states.

**F4.3 Delete Plot**
- Deletes plot and memberships only. Plants are unaffected.
- Acceptance: Plants remain in the garden after their plot is deleted.

---

### F5. Scheduling and Notifications

**F5.1 Scheduled Events**
- User schedules a Tending or Watering event for a future date/time.
- A browser notification fires at the scheduled time.
- The event is stored in `scheduled_events`.
- Acceptance: Notification fires on time when the browser is closed.

**F5.2 Automatic Care Reminders**
- When a care activity is logged, a notification is automatically scheduled for `next_scheduled_care`.
- The notification tag is `plant-care-{plantId}` — only one active notification per plant.
- Acceptance: Logging a Tending for a weekly-care plant schedules a notification for 7 days later.

**F5.3 Notification Deep Link**
- Tapping a notification opens the app and navigates to the plant's detail view.
- URL: `/?plant={plantId}` → app redirects to `/plants/{plantId}`.
- Acceptance: Tapping a notification opens the correct plant.

**F5.4 Notification Permission**
- Permission is requested only from the Settings screen, never at app launch.
- If denied, the app operates normally without notifications.
- Acceptance: Opening the app for the first time never shows a notification permission dialog.

---

### F6. Images

**F6.1 Image Capture**
- User selects images from their device (camera or file picker).
- Supports multiple images per plant.
- Acceptance: Multiple images can be added in one session.

**F6.2 Face Detection**
- Images containing faces are rejected before upload.
- User sees a clear error message.
- Acceptance: An obvious portrait photo is rejected. A photo of a book or landscape is accepted.

**F6.3 Compression**
- Images are compressed to ≤720px max dimension before storage/upload.
- Acceptance: A 4000×3000px photo is stored at 720px on the longest side.

**F6.4 Upload and Quota**
- Images are uploaded to Supabase Storage via the Edge Function pipeline.
- Maximum 100 images per user.
- `ImageQuotaModal` warns at 80% usage and blocks at 100%.
- Acceptance: User cannot upload image #101 until they delete one.

**F6.5 E2EE for Images at Rest (Planned)**
- Each image is encrypted client-side with a unique AES-GCM key before upload.
- The AES key is encrypted with the user's RSA-OAEP public key and stored in `plant_images.encrypted_key`.
- The server stores and serves only ciphertext. Decryption happens client-side on load.
- Acceptance: The raw bytes stored in Supabase Storage are not a valid image file without decryption.

---

### F7. Cloud Backup

**F7.1 Automatic Encrypted Backup**
- After any write operation, the full local database is serialized, encrypted with the user's public key, signed with their private signing key, and uploaded to Supabase.
- The server verifies the signature before accepting the backup.
- Acceptance: After logging an activity, the Supabase `users.encrypted_backup` column is updated.

**F7.2 Manual Export**
- User can download the encrypted backup as a JSON file from Settings.
- User can download their garden key file from Settings.
- Acceptance: Downloaded files are valid JSON and can be used for restore.

**F7.3 Import and Restore**
- User can upload a backup JSON file in Settings.
- The app decrypts it and restores the local database.
- Acceptance: After import, all previously-exported data is accessible.

---

### F8. Anonymized Reports (Planned)

**F8.1 Report Generation**
- User selects a date range and activity types.
- A PDF is generated client-side.
- Plant names are replaced with placeholder identifiers by default (e.g., "Plant A," "Plant B").
- User can opt to include real names.
- Acceptance: Generated PDF includes activity counts by type, days between visits, and care trends — with no identifying information by default.

---

### F9. Plant Sharing

**F9.1 Share a Plant**
- Owner opens `SharePlantModal` from a personal plant's detail view.
- The app generates a per-plant RSA key pair and creates an initial encrypted snapshot in `shared_plants`.
- An invite claim is generated via `create-share-claim`: the plant private key is wrapped with an ephemeral RSA key and the ephemeral private key travels in the invite URL fragment (never touches the server).
- Acceptance: An invite link is generated and the encrypted plant snapshot is uploaded to `shared_plants`.

**F9.2 Accept a Share**
- Recipient opens the invite link → `ReceivePlantShareView`.
- The app calls `claim-plant-share` Edge Function with the short code and the invitee's RSA-PSS signature.
- Server adds the invitee to `authorized_users` and returns the wrapped plant private key.
- Invitee decrypts the plant key using the ephemeral private key from the URL fragment, fetches and decrypts the plant snapshot, and imports it locally.
- The plant link is established via `plantLinkService.importPlantFromSharedGarden()`: only the invitee's own past activities are imported to their personal garden.
- Acceptance: The shared plant appears in the invitee's garden. All activities from the owner are visible. Activities the invitee logs sync to both parties.

**F9.3 Activity Sync on a Shared Plant**
- `syncSharedPlant()` in `sharedBackupService.ts` applies incoming deltas, mirrors the current user's own activities to their personal garden, appends local deltas, and pushes.
- Owner compacts at 50 deltas. Co-tenders do not compact. Viewers skip the push.
- Acceptance: An activity logged by one party appears in the other party's timeline after their next sync.

**F9.4 Plant-to-Garden Linking**
- A personal plant can be linked to a shared garden plant via `linkPlantToSharedGarden()`.
- When linked, the user's own activities in the shared garden are automatically mirrored to their personal plant. Activities by other members are never mirrored.
- Acceptance: A Tending logged by the current user in a shared garden appears in their personal plant's timeline. A Tending logged by another member does not.

**F9.5 Revoke Share (Planned)**
- Owner removes the co-tender from `authorized_users` via the shared plant's settings.
- On the co-tender's next sync, the 403 response marks their local copy revoked (read-only).
- Acceptance: Revoked co-tender can view past activities but cannot add new ones.

---

### F12. Shared Gardens

**F12.1 Create Shared Garden**
- User opens `CreateSharedGardenModal`, enters a garden name and display name, and taps "Create garden."
- A per-garden RSA key pair is generated. An initial empty snapshot is encrypted and uploaded to `shared_gardens`.
- The garden private key is stored locally in `localStorage['shared_garden_key_{gardenId}']`.
- A garden key file (`{name}-garden-key.json`) containing the RSA key pair and member identity is offered for download immediately after creation. Users are strongly encouraged to save it.
- Acceptance: The garden appears in `SharedGardensListView`. The creator is the only member. The garden is immediately navigable.

**F12.2 Invite Members**
- Any current member opens `ManageMembersModal` and taps "Invite member."
- `InviteToSharedGardenModal` generates an invite URL via `create-garden-share-claim`: the garden private key is wrapped with an ephemeral RSA key; the ephemeral private key travels in the `#fragment` of the invite URL.
- The invite is shared out-of-band. It expires after 72 hours.
- Invitee opens the link → `JoinSharedGardenView` → claims the invite via `claim-garden-share`.
- Server verifies the invitee's RSA-PSS signature, adds them to `authorized_users`, and returns the wrapped garden key.
- Invitee decrypts the garden key, fetches and decrypts the current garden state, and populates their local database.
- Acceptance: The invitee can see all plants and activities. New activities they log appear in all other members' gardens on next sync.

**F12.3 Shared Garden Sync**
- `syncSharedGarden(ref, user)` runs automatically on app focus, after any write, and on app load.
- Incoming deltas are applied last-write-wins. Tombstone conflicts (activity added to deleted plant) are surfaced via `onConflict` callback.
- The current user's own incoming activities are mirrored to their personal garden via `mirrorActivityToPersonalGarden()`.
- Local changes since last sync are appended to the delta log. Compaction fires at 50 deltas.
- All writes use optimistic concurrency (409 handled by re-fetch + retry).
- Acceptance: Activity logged by one member appears in all other members' views after their next sync. Offline sync skips gracefully and retries on reconnect.

**F12.4 Restore from Garden Key File**
- User opens `CreateSharedGardenModal` → "Restore from key file" tab.
- User selects their `{name}-garden-key.json` file. All 7 fields are validated.
- If the garden is already on the device: shows "already on device" notice and offers to open it directly.
- Otherwise: fetches the latest encrypted state from Supabase, decrypts, populates local database, and registers the garden ref.
- Acceptance: All plants and activities from the garden are accessible after restore. The user appears in the member list with their stored display name.

**F12.5 Remove a Member**
- Any member can remove any other member via `ManageMembersModal`.
- `removeMemberFromGarden()` writes a `remove_member` entry to the change log, then calls `sync-shared-garden` with `action: 'remove-member'` to remove the user from `authorized_users`.
- On the removed member's next sync, a 403 response triggers `markGardenDisconnected()`. The garden becomes read-only in their app.
- Acceptance: Removed member can view the garden's last known state locally but cannot push new changes. New sync attempts return 403.

**F12.6 Shared Garden Plots**
- Any member can create, edit, delete plots, and manage plot memberships.
- Plots and memberships sync via the delta log to all members.
- Bulk activity is supported from `SharedPlotDetailView`: one activity per plant in the plot, plus a single `bulk_{type}` change log entry.
- Acceptance: A plot created by one member appears in all other members' gardens after sync. Bulk activity from a plot updates all selected plants.

**F12.7 Garden Change Log**
- Every meaningful action (plant added, activity logged, plot created, member added/removed, bulk operation) writes an entry to `garden_change_log`.
- `GardenChangeLogCard` displays a paginated, reverse-chronological feed of these entries attributed to their author.
- The change log is included in the snapshot and in deltas, so all members see the same history.
- Acceptance: Any member can open the change log and see who logged what and when, back to the garden's creation.

---

### F10. Multilingual Support (Planned)

**F10.1 Supported Languages**
- English (default), Spanish, French.

**F10.2 Language Selection**
- User selects language from Settings. Preference stored in localStorage.
- All UI strings, labels, and activity type names are localized.
- Dates and times formatted according to locale (using dayjs locale support).
- Acceptance: Switching to Spanish shows all UI text in Spanish, with Spanish date formats.

---

### F11. Garden Visualization (Future)

**F11.1 Visual Garden Map**
- An interactive top-down view of the user's entire garden rendered with Phaser (or equivalent).
- Each plant is represented as a sprite with visual state reflecting growth stage and care urgency.
- Companion relationships shown as connecting lines.
- Acceptance: A plant in severe urgency state appears visually wilted. A healthy plant is full and bright.

**F11.2 Plant Navigation**
- Tapping a plant in the visualization navigates to its detail view.
- Acceptance: Tapping a plant opens PlantDetailView for that plant.

**F11.3 Position Persistence**
- Plant positions (x, y) in the visualization are saved to `plants.additional_info`.
- Acceptance: After closing and reopening the app, plants are in the same positions.

---

## Non-Functional Requirements

### NFR1. Privacy
- No user-identifiable data (names, emails, activity content) is ever transmitted unencrypted to any server.
- No third-party analytics, tracking, or telemetry of any kind.
- The server may store only: user UUID, public keys, and an encrypted blob.

### NFR2. Security
- RSA-OAEP 2048-bit for data encryption.
- RSA-PSS 2048-bit for backup signing.
- secp256k1 for image upload authorization.
- AES-GCM for symmetric data encryption.
- SHA-256 for file integrity hashing.
- All cryptographic operations use the browser's native Web Crypto API.
- No cryptographic keys are transmitted over the network.

### NFR3. Offline First
- All core features (create, read, update, delete plants and activities) must work without internet access.
- Cloud sync degrades gracefully when offline — no errors shown to the user, sync retried on reconnect.

### NFR4. Performance
- The garden view with 50 plants should render in under 200ms on a mid-range Android device.
- Local database operations are synchronous and should not cause visible UI jank.
- Image compression should complete in under 3 seconds for a typical 5MB photo.

### NFR5. PWA Standards
- Installable on Android (Chrome) and iOS (Safari).
- Works standalone (no browser chrome after installation).
- Service worker caches all static assets for offline use.
- App update prompt shown when a new version is available.

### NFR6. Accessibility
- All interactive elements have visible focus states.
- All icon-only buttons have `aria-label` attributes.
- Color is never the only indicator of state (urgency states also use SVG overlays, not just color).
- Touch targets are at least 44×44px on mobile.

### NFR7. Data Integrity
- Backup signature verification prevents unauthorized backup overwrites.
- Image upload signature verification prevents unauthorized image uploads.
- The garden key file is the only mechanism for identity recovery — the system must never silently create a new identity on behalf of an existing user.
