# USERFLOWS.md — User Journeys and Edge Cases

## Overview

This document maps every meaningful user journey through Garden. Flows are described from the user's perspective, followed by the technical steps that execute each action, and the edge cases that must be handled.

---

## 1. First-Time User — Creating a Garden

### User Experience
The user opens the app for the first time. The Welcome Screen appears with two options: "Plant Your First Seed" and "Open Garden with Key File."

### Flow
1. User taps "Plant Your First Seed."
2. `App.tsx` → `createNewGarden()`:
   - Generates RSA-OAEP key pair (encryption).
   - Generates RSA-PSS key pair (signing/verification).
   - Exports all four keys to Base64 strings.
   - Creates a `User` object: `{ id: uuidv4(), publicKey, privateKey, signingPublicKey, signingPrivateKey }`.
   - Calls `SupabaseService.registerUser(userId, encryptionPublicKey, signingPublicKey)` — registers the user on Supabase with public keys only.
   - Stores the full `User` object in `localStorage['garden-key']`.
   - Stores individual keys separately: `localStorage['user_id']`, `localStorage['signature_private_key']`, `localStorage['signature_public_key']`.
3. App transitions from `WelcomeScreen` to `GardenView`.
4. `KeyBackupPrompt` appears — strongly encouraging the user to download their garden key file.

### Edge Cases
- **Supabase registration fails (offline):** The user can still use the app fully offline. Registration is retried the next time the app loads and has connectivity.
- **User closes the key backup prompt:** The prompt reappears on next launch until `localStorage['key-backup-dismissed']` is set to `'true'` after the user downloads the file, or if `localStorage['garden-restored-from-key']` is `'true'`.
- **Duplicate garden creation:** If `localStorage['garden-key']` already exists, `createNewGarden()` is never called — the app skips the welcome screen entirely.

---

## 2. Returning User — Restoring from Key File

### User Experience
A user who has lost their device data, or is setting up a new device, opens the app and taps "Open Garden with Key File." They select their previously downloaded `garden-key.json` file.

### Flow
1. User taps "Open Garden with Key File" → native file picker opens (accepts `.json`).
2. `App.tsx` → `restoreGardenKey(file)`:
   - Reads the JSON file.
   - Parses and validates the `User` object structure.
   - Stores user data back to `localStorage`.
   - Sets `localStorage['garden-restored-from-key'] = 'true'`.
3. `syncFromServerAfterRestore()` is called:
   - Calls `SupabaseService.downloadBackup(userId)`.
   - Receives the encrypted backup blob from the `users` table.
   - Calls `decryptData(encryptedBackup, privateKey)` using the user's RSA-OAEP private key.
   - Calls `DatabaseService.restoreBackupFromObject(parsedData)` which clears local AlaSQL tables and re-inserts all records.
4. App loads with all data restored.

### Edge Cases
- **Invalid key file (wrong format):** Validation checks for required fields. Shows error toast. User remains on Welcome Screen.
- **No backup on server (user never synced):** The garden is empty. The user's identity is restored, but there is no data. A toast message explains this.
- **Decryption failure (wrong key):** The private key in the key file does not match the public key on the server. This should not happen if the key file is authentic. Shows error toast.
- **Offline during restore:** Cannot download backup. Informs user they need connectivity. User can still proceed with an empty local garden using their identity.
- **Key file missing fields:** Any `User` object missing `id`, `privateKey`, `publicKey`, `signingPrivateKey`, or `signingPublicKey` is rejected.

---

## 3. Adding a Plant (Soul)

### User Experience
The user taps the `+` button in `GardenView`. A modal appears asking for the person's name, an optional description, optional contact info (email, phone), and the care frequency (how often the user wants to tend to this relationship).

### Flow
1. User taps `+` in `GardenView`.
2. `AddPlantModal` opens.
3. User fills in: name (required), description (optional), email/phone (optional), care frequency (default: every 2 weeks).
4. Optional: User taps the age field to open `AgePicker`. The entered age and a `timestamp_age_poll` are stored in `additional_info.age_info`. The effective age is computed dynamically at read time using elapsed time so it stays current without re-entry.
5. Optional: User taps the location field to open `LocationPicker`. Lat/lng are stored in `additional_info.location`. The location is viewable later via `MapOverlay` (Google Maps embed).
6. Optional: User taps the camera icon to open `PlantImageCapture`. Images pass through face detection (`faceDetection.ts`) — faces cause rejection. Accepted images may be cropped in `CropModal`, then compressed to ≤720px before being saved locally and queued for encrypted upload.
7. On submit, `DatabaseService.addPlant(plantData)`:
   - Assigns a UUID.
   - Calculates `next_scheduled_care = now + (frequency * unit_ms)`.
   - Inserts into `plants` AlaSQL table.
   - Fires `plant-care-updated` custom event to schedule a browser notification.
8. `GardenView` re-fetches all plants and re-renders.
9. If the user is registered with Supabase, a background sync uploads an encrypted backup.

### Care Urgency Calculation
On render, each plant is assessed for care urgency:
- `healthy`: time since last tending ≤ 1× the care frequency.
- `mild`: 1× to 3× the care frequency.
- `severe`: more than 3× the care frequency.

The plant card displays the appropriate SVG overlay (green / yellow-brown / brown) to visualize health.

### Edge Cases
- **No name entered:** Submit button is disabled or validation blocks submission.
- **Very short care frequency (e.g., 1 day):** Works correctly. Notifications are scheduled accordingly.
- **Plant added while offline:** Data goes to AlaSQL/localStorage immediately. Backup sync is deferred.

---

## 4. Logging Activities (Acts of Care)

### User Experience
The user opens a plant's detail view and taps one of the care action buttons (Tend, Water, Sunlight, Fruit, Pruning, Companion). A modal appears specific to that activity type.

### Activity Types and Their Fields

**Tending** (quality time)
- Type: conversation / coffee / meal / call / message / activity / [custom]
- Summary: free text

**Watering** (sharing sacred writings or studying together)
- Source: free text (topic, material, book, etc.)
- Progress description: free text

**Sunlight** (prayer)
- Topic: what was prayed for

**Fruit** (selfless act of service)
- Description: what the person did
- Basic activity (optional): whether the act was a core community-building activity type.
  - User checks "Is basic activity?" to reveal the classification field.
  - Preset options: Prayer, Devotional Meeting, Study Circle, Children's Class, Junior Youth Group.
  - Selecting "Other" opens a free-text autocomplete field. Suggestions are fetched from the shared `autocomplete_values` table (`basic_activity` type). A new value entered here is contributed back to the shared table after the record is saved.
  - When `basic_activity` is set, its value is displayed as the activity's title in the timeline instead of the generic "Fruit" label.

**Pruning** (difficult conversation)
- Difficulty: easy / medium / hard
- Description: what was addressed

**Companion** (remembering a relationship between people)
- Relationship descriptor: "siblings," "close friends," "mentor/mentee," etc.
- Linked plant: select from existing plants

### Flow
1. User selects activity type from `PlantDetailView` action bar.
2. `ActivityModal` opens, pre-configured for the selected type.
3. User fills in fields. Optionally sets a custom datetime (defaults to now).
4. User optionally adds custom fields via `AdditionalInfoMenu` (stored as JSON in `additional_info`).
5. On submit: the corresponding `DatabaseService.add[ActivityType]()` method is called.
6. For Tending and Watering: `updatePlantCare()` and `updatePlantInteraction()` are also called, resetting the care clock and scheduling the next notification.
7. `PlantDetailView` reloads activities and re-renders the timeline.

### Edge Cases
- **Logging an activity with a past datetime:** Fully supported via the custom datetime field. The care clock uses the provided timestamp.
- **Companion linking to a deleted plant:** The `plant_b_id` references a plant that has been removed. The companion record will show a "plant no longer exists" fallback in the UI.
- **Editing an existing activity:** The modal accepts an `editingItem` prop. On submit, `DatabaseService.update[ActivityType]()` is called instead of `add`.
- **Deleting an activity:** A confirmation modal is shown. Deletion does not recalculate the care clock (the user can re-log the most recent activity to correct it).

---

## 5. Bulk Activity Logging

### User Experience
From `GardenView`, the user selects multiple plants via the bulk action mode and logs the same activity (Tending or Watering) for all of them at once.

### Flow
1. User activates bulk selection mode.
2. `PlantSelectorChecklist` renders, allowing multi-select.
3. User selects plants and taps the activity type.
4. `BulkActivityModal` opens with the shared activity form.
5. On submit, `DatabaseService.logBulkActivity()` inserts records for all selected plants in a single SQL statement.
6. Care clocks are updated for each plant.

### Edge Cases
- **No plants selected:** Submit is disabled.
- **All plants selected including newly-added ones:** Works correctly — bulk insert handles any number of plants.

---

## 6. Scheduling Future Care

### User Experience
From a plant's card or detail view, the user schedules a reminder for a future care event.

### Flow
1. User opens `ScheduleCareModal` from the plant's options menu.
2. Selects event type (Tending or Watering), date/time, optional description.
3. `DatabaseService.addScheduledEvent()` saves to `scheduled_events` table.
4. `NotificationService.scheduleNotification()` sends a message to the service worker to schedule a browser notification at the specified time.

### Edge Cases
- **Notification permissions not granted:** The reminder is saved to the database but no browser notification fires. User can enable notifications from Settings.
- **App is closed when notification fires:** The service worker wakes and fires the notification independently.
- **User schedules a reminder in the past:** Validation prevents a past datetime from being submitted.

---

## 7. Plant Images

### User Experience
From a plant's detail view, the user taps the images icon. A gallery opens where they can add a photo. Photos must not contain faces. Images are encrypted before leaving the device and stored as encrypted blobs in Supabase — no CDN URL is ever issued.

### Upload Flow
1. User taps the image icon in `PlantDetailView`.
2. `PlantImageCapture` opens. User selects an image from their device.
3. `faceDetection.ts` — heuristic skin-tone clustering checks for faces. Rejects with a toast if a face is detected.
4. `CropModal` opens (optional crop step). User confirms crop.
5. `imageProcessing.ts` — resizes to ≤720px max dimension (large) and 100px (thumbnail), both JPEG at 0.85 quality.
6. Both data URLs are saved locally: `plant_image_{plantId}` (large) and `plant_image_{plantId}_small` (thumbnail) in localStorage.
7. `uploadService.queueUpload(plantId, plantName, images)` adds the job to the async upload queue.
8. Upload queue processes the job:
   a. Generates a UUID `imageId`.
   b. Encrypts both data URLs client-side using AES-GCM (`cryptoService.encryptImageData()`).
   c. Builds a RSA-PSS signature over `imageId + ":" + timestamp` using `signatureService`.
   d. POSTs `{ plantId, imageId, encryptedLarge, encryptedSmall, signature, timestamp }` to the `upload-plant-image` Edge Function with `Authorization: Bearer {userId}`.
   e. Edge Function verifies the signature, checks quota (max 100 rows per user), and upserts into `plant_images`. Updating an existing plant's image does not consume additional quota.
   f. On success, `additional_info.image_id` on the plant record is updated to `imageId` — this is the cross-device sync signal.

### Display Flow (existing device)
- `PlantDetailView` reads the locally-cached data URL from `plant_image_{plantId}_small` and renders it as a thumbnail.
- `PlantImageViewer` fetches the large version on demand: first checks `plant_image_{plantId}` in localStorage; if missing, calls `imageSync.fetchLargeImage()`.

### Cross-Device Sync Flow (new device after restore)
1. After restoring from cloud backup, `syncMissingImages()` in `imageSync.ts` scans all plants.
2. For each plant whose `additional_info.image_id` is set but whose local cache is absent:
   a. Signs `"fetch:" + plantId + ":" + timestamp` with RSA-PSS.
   b. Calls `get-plant-image` Edge Function to retrieve the encrypted blob.
   c. Decrypts locally with `cryptoService.decryptImageData()`.
   d. Caches the result in localStorage under the standard keys.

### Quota System
- Maximum 100 images per user (one per plant).
- `uploadService.getQuotaInfo()` returns `{ used, limit, remaining }`.
- `ImageQuotaModal` warns when quota is reached.
- Replacing an existing plant's image does not consume additional quota.

### Deletion Flow
1. User taps the delete button in `PlantImageViewer`.
2. `uploadService.deleteImageFromServer(plantId)` is called.
3. Signs `"delete:" + plantId + ":" + timestamp` with RSA-PSS.
4. POSTs to `delete-plant-image` Edge Function which removes the row from `plant_images`.
5. Local cache keys are removed from localStorage.
6. `additional_info.image_id` is cleared on the plant record.

### Edge Cases
- **Face detected:** Toast shown. Image is not saved or uploaded.
- **Upload fails (network):** Item remains in the async queue and is retried up to 3 times.
- **Quota exceeded:** Upload is blocked. User must delete the existing image before uploading a new one.
- **Sync on restore does not auto-trigger:** A manual or on-focus sync pass is required after key restore to pull missing images. (Known debt — see ROADMAP.md.)

---

## 8. Cloud Backup and Sync

### User Experience
The app periodically syncs an encrypted backup to Supabase. The user can also trigger a manual sync from Settings, or export a local backup file.

### Automatic Sync Flow
1. After any write operation, the app marks the sync state as `dirty`.
2. On focus or after a debounce period, `syncWithSupabase()` in `GardenView` is called.
3. `DatabaseService.getFullBackupAsObject()` retrieves all local data.
4. `encryptData(jsonString, publicKey)` produces `{ encryptedAesKey, iv, encryptedData }`.
5. `SupabaseService.uploadBackup(userId, encryptedBackup, signingPrivateKey)`:
   a. Signs the encrypted blob with RSA-PSS.
   b. POSTs to the `update-backup` Edge Function.
   c. The function verifies the signature server-side.
   d. On success, updates `users.encrypted_backup` and `users.last_modified`.

### Manual Export (Settings)
- "Export Backup" downloads a `backup-{date}.json` file containing the encrypted backup.
- "Download Garden Key" downloads the `garden-key.json` file with all keys.

### Manual Restore (Settings)
- User uploads a previously exported backup JSON file.
- The app decrypts it locally and calls `DatabaseService.restoreBackupFromObject()`.

### Edge Cases
- **Sync while offline:** Silently fails. State stays `dirty`. Sync is retried on next connectivity.
- **Signature verification failure server-side:** Backup is rejected with HTTP 403. Local data is not lost.
- **Corrupted backup file on server:** The user can restore from their downloaded backup file instead.
- **Two devices syncing simultaneously:** Last-write wins. There is no merge strategy. The most recent successful upload overwrites the previous one.

---

## 9. Plots (Groups of Plants)

### User Experience
Plots are named groups of plants — for example, "Family," "Work Community," "Prayer Group." A plant can belong to multiple plots.

### Flow
1. User navigates to `/plots` via the `SlidingMenu`.
2. `PlotsView` shows all plots with plant counts.
3. User creates a plot: `AddEditPlotModal` → `DatabaseService.createPlot()`.
4. User opens a plot: `PlotDetailView` lists all member plants.
5. User adds/removes plants from a plot: `DatabaseService.updatePlotMemberships()`.

### Edge Cases
- **Deleting a plot:** Only the plot record and its memberships are deleted. The plants themselves are not affected.
- **Deleting a plant that belongs to a plot:** The plant is removed from all plot memberships.

---

## 10. Notifications

### User Experience
When a plant's care is due, the user receives a browser notification even if the app is closed. Tapping the notification opens the app directly to the plant's detail view.

### Flow
1. When a plant's care schedule is updated, a `plant-care-updated` event fires.
2. `App.tsx` listens and calls `NotificationService.scheduleNotification(plantId, plantName, nextCareTimestamp)`.
3. A message is sent to the service worker: `{ type: 'SCHEDULE_NOTIFICATION', ... }`.
4. The service worker saves the notification to IndexedDB.
5. If `TimestampTrigger` is supported (Chrome on Android), the notification is natively scheduled.
6. Fallback: the service worker checks IndexedDB during periodic sync (every 24 hours via `periodicSync`) and fires overdue notifications.
7. Notification payload: `{ title: plantName, body: "Time to care for {plantName}", data: { plantId } }`.
8. Tap action: navigates to `/?plant={plantId}` → `GardenView` redirects to `/plants/{plantId}`.

### Edge Cases
- **Permissions denied:** Graceful degradation — the app still tracks care due dates visually. The Settings screen explains how to enable notifications.
- **Multiple plants due:** Each plant has its own notification with tag `plant-care-{plantId}`. Only one notification per plant is kept alive at a time.
- **Plant deleted while notification is pending:** Service worker checks if the plant still exists before firing. If not, the notification is silently cancelled.

---

## 11. Settings

### Available Settings
- **Download Garden Key:** Re-downloads `garden-key.json`.
- **Export Backup:** Downloads an encrypted backup JSON file.
- **Import Backup:** Uploads and restores a backup JSON file.
- **Sync to Cloud:** Manually triggers Supabase sync.
- **Enable Notifications:** Requests browser notification permission. If granted, schedules notifications for all plants.
- **Image Quota:** Shows current image usage and limit.
- **Delete All Data:** Confirmation flow → `DatabaseService.clearAllData()` → clears all localStorage. Does not delete the Supabase backup.

### Edge Cases
- **Delete All Data while offline:** Local data is cleared but the server backup remains intact. The user can restore from their garden key file.
- **Notifications re-enabled after being disabled:** All plants with future care dates have notifications rescheduled.

---

## 12. Offline Behavior

All core functionality works offline:
- Creating, editing, and deleting plants.
- Logging all activity types.
- Viewing all data, timelines, and images (local data URLs).
- Notification scheduling (via service worker IndexedDB).

The following require connectivity:
- Cloud backup sync.
- Image upload to Supabase Storage.
- Initial user registration.
- Restoring from server backup.

When connectivity is restored:
- The service worker processes the upload queue.
- The app retries the latest backup sync.

---

## 13. PWA Installation

### Android / Chrome
1. Browser shows "Add to Home Screen" prompt after the user has visited a few times.
2. `InstallPrompt` component intercepts the `beforeinstallprompt` event and shows a custom banner.
3. User taps "Install." The app is added as a standalone PWA.

### iOS / Safari
1. Safari does not support `beforeinstallprompt`.
2. `IOSInstallInstructions` component detects iOS and shows a step-by-step guide: "Tap Share → Add to Home Screen."

### Edge Cases
- **PWA already installed:** The install prompt is not shown.
- **User dismisses the prompt:** It does not reappear for the session.

---

## 14. Branches — Buds, Notching, and Capabilities

### User Experience
From a plant's detail view, the Branches card appears at the bottom. It has three sub-sections: Buds, Notching, and Capabilities. Each section header is a full-width tap target (mobile-friendly). Tapping it opens the form for that type.

### Adding a Bud
1. User taps anywhere on the "Buds" row in the Branches card.
2. `BranchesModal` opens in `bud` mode.
3. User enters a short text label (e.g., "teaching", "music").
4. On submit, `DatabaseService.addBud({ plant_id, text })` inserts into `buds`.
5. The card re-renders showing the new bud as an amber pill.

### Adding a Notching
1. User taps anywhere on the "Notching" row.
2. `BranchesModal` opens in `notching` mode.
3. User selects the Ruhi book, start unit/section, end unit/section, and optionally adds a progress description.
4. `sections_studied` is computed from the range.
5. On submit, `DatabaseService.addNotching(...)` inserts into `notchings`.
6. The most recent notching is shown in the card; older entries are accessible via "See more."

### Bulk Notching
From `GardenView`, the user can log the same notching session for multiple plants at once via `BulkNotchingModal`. The same book/range/description is applied to all selected plants in a single operation.

### Adding a Capability
1. User taps anywhere on the "Capabilities" row.
2. `BranchesModal` opens in `capability` mode.
3. User types a capability label, with suggestions from the shared `autocomplete_values` table (`proven_capacity` type). Selecting or submitting a new value upserts it back to the shared table.
4. On submit, `DatabaseService.addCapability({ plant_id, text })` inserts into `capabilities`.
5. Capabilities appear as emerald pills in the card.

### Edge Cases
- **Edit / delete buds and capabilities:** Chips show edit/delete controls on hover (desktop) or via long-press (mobile patterns via `group-hover`).
- **Edit a notching:** The form pre-populates all fields. On submit, `DatabaseService.updateNotching(...)` replaces the record.
- **Delete a notching:** Confirmation modal, then `DatabaseService.deleteNotching(id)`.

---

## 15. Harvest Report

### User Experience
From `SlidingMenu`, the user taps "Harvest" to open `HarvestBriefView`. They can set a date range, preview metrics, and download a privacy-safe report as a JSON file.

### Flow
1. User opens `SlidingMenu` → "Harvest."
2. `HarvestBriefView` renders a quick summary (total plants, total activities, date range).
3. User optionally adjusts the date range.
4. User taps "Preview" → `HarvestPreviewModal` opens with key metrics:
   - Plant count and age distribution (adult / voting youth / youth / junior youth / child).
   - Activity breakdown (tendings, waterings, sunlight, fruits, prunings).
   - Care index (on-track vs. overdue).
5. User taps "Download" → `harvestService.generatePersonalHarvest()` is called.
   - All plant IDs and activity IDs are replaced with salted SHA-256 hashes.
   - Real names, emails, phones, and descriptions are never included.
   - Age groups are derived from `age_info` in `additional_info`; plants without age info default to `adult`.
   - Result is `HarvestReport` (schema version 1).
6. `downloadHarvestReport(report)` triggers a browser download as `harvest-{date}.json`.

### Privacy Guarantees
- No real names, contact info, or UUIDs appear in the exported file.
- All IDs are SHA-256 hashes salted with the user's own UUID (salting is deterministic per user but opaque to outside observers).
- The file format is defined and versioned (`schema_version: 1`).

### Edge Cases
- **No plants in range:** Report generates with empty arrays. Preview shows zeros.
- **Plant has no age_info:** Defaults to `adult` age group.
- **Offline:** Harvest report generation is fully local. No network required.

---

## 16. Adding a Plant from a Contact

### User Experience
The gardener can sow a new plant directly from an existing contact record, avoiding manual re-entry of a name, phone number, email, or notes. Three entry points all converge on the same `ImportContactModal` confirmation flow.

### Entry Points

**A — VCF file import (Settings)**
1. User opens Settings → Garden Management → "Import from File."
2. Native file picker opens, accepting `.vcf` files.
3. `parseVCardFile(text)` parses every `BEGIN:VCARD … END:VCARD` block and returns an array of `ParsedContact` objects.
4. If no valid contacts are found, an error toast is shown and nothing opens.
5. `ImportContactModal` opens pre-populated with the first parsed contact.

**B — Contact Picker API (Settings)**
1. User opens Settings → Garden Management → "Import from Contacts."
2. The native Contact Picker sheet opens (Chrome on Android; not supported on all platforms).
3. User selects one contact. The browser returns `name`, `tel`, `email`, and `note` fields.
4. A single `ParsedContact` is assembled from the raw result.
5. `ImportContactModal` opens pre-populated with that contact.
6. No PHOTO field is available via the Contact Picker path — the photo crop step is skipped.

**C — Share target (from another app)**
1. Another app (Contacts, WhatsApp, etc.) shares a `.vcf` file to Garden.
2. The service worker intercepts the POST to the share target URL and stores the file in IndexedDB.
3. On next app open, `App.tsx` reads the pending shared file, calls `parseVCardFile`, and, if contacts are found, opens `ImportContactModal`.

### Shared Confirmation Flow (all entry points)

1. `ImportContactModal` opens with name, phone, email, and notes pre-filled from the parsed contact.
2. **If multiple contacts are in the VCF file:** a contact selector dropdown appears above the form. Selecting a different contact re-populates all fields and resets the photo state for that contact.
3. **Photo crop step:** If the parsed contact contains a base64-encoded PHOTO field, `CropModal` opens automatically on top of the import modal before the gardener sees the form.
   - The gardener can reposition (drag) and zoom (pinch / buttons) the image.
   - Tapping "Use Photo" exports a 720×720 JPEG blob from the cropper.
   - The blob is converted to a data URL and stored as `croppedPhoto` in local component state.
   - The form then appears with a 100×100 rounded-corner thumbnail of the cropped photo, consistent with the app's standard image display.
   - A hover-to-reveal trash icon allows the gardener to remove the photo before confirming.
   - **Cancelling the crop** discards the photo silently. The import form opens without an image.
4. **Quota check:** Before the crop step, `uploadService.getQuotaInfo()` is checked. If `hasReachedLimit` is true, the photo is skipped entirely and a small inline notice is shown in the form.
5. The gardener reviews and edits any fields, sets the care frequency, and taps "Sow into Garden."
6. `DatabaseService.addPlant()` creates the plant record and returns the new plant with its assigned UUID.
7. If a cropped photo is present: `uploadService.queueUpload(newPlant.id, contact.name, croppedPhoto)` is called — the same queue used for manually captured images.
   - The data URL is saved to `localStorage` under `plant_image_{plantId}_0` immediately (works fully offline).
   - The upload job is processed asynchronously: the image is resized, encrypted with AES-GCM, signed with secp256k1, and POSTed to the `upload-plant-image` Edge Function.
   - On success, `additional_info.image_id` on the plant record is updated and the `plant-image-uploaded` event fires, causing `PlantCard` to display the image.
8. `ImportContactModal` closes. A "Seed sown" success toast is shown. The garden data refreshed event fires and `GardenView` re-renders.

### PHOTO Field Parsing Details

- **Supported formats:** vCard 2.1 (`ENCODING=BASE64`), vCard 3.0 (`ENCODING=b`), vCard 4.0 (inline `data:image/…;base64,…` URI).
- **Multi-line folded payloads:** Base64 data split across continuation lines (lines beginning with a space or tab) is re-assembled automatically.
- **URI-type PHOTO entries** (`VALUE=uri` or `VALUE=url`) are silently skipped. No outbound network request is made to an unknown server.
- **Content type detection:** `TYPE=JPEG`, `TYPE=PNG`, `TYPE=GIF`, `TYPE=WEBP` are recognised. Unrecognised types default to `image/jpeg`.

### Edge Cases
- **No PHOTO in vCard:** The crop step is skipped entirely. Import proceeds directly to the form.
- **URI-type PHOTO:** Silently skipped. Import proceeds without an image.
- **Gardener cancels crop:** Photo is discarded. Import continues and the form opens without an image.
- **Image quota full:** The crop step is skipped. An inline notice in the form explains that the image quota is full. The plant is still sown without an image.
- **Multiple contacts in one VCF:** The contact selector appears. Switching to a different contact resets the photo state — if the newly selected contact has its own PHOTO, the crop step will not re-trigger automatically; the gardener can use the form as-is.
- **Offline at import time:** The plant record is saved to localStorage immediately. If a photo was queued, the upload is retried automatically when connectivity is restored (up to 3 attempts).
- **Contact Picker not supported:** The "Import from Contacts" button is hidden on platforms where `navigator.contacts` is unavailable. Only the file import path is shown.
- **Contact Picker returns no selection:** If the user dismisses the native picker without selecting a contact, no modal opens.
- **Share target received while app is closed:** The vCard is held in IndexedDB by the service worker and processed the next time the app is opened.
