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
4. On submit, `DatabaseService.addPlant(plantData)`:
   - Assigns a UUID.
   - Calculates `next_scheduled_care = now + (frequency * unit_ms)`.
   - Inserts into `plants` AlaSQL table.
   - Fires `plant-care-updated` custom event to schedule a browser notification.
5. `GardenView` re-fetches all plants and re-renders.
6. If the user is registered with Supabase, a background sync uploads an encrypted backup.

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
From a plant's detail view, the user taps the images icon. A gallery opens where they can add photos. Photos must not contain faces.

### Flow
1. User taps the image icon in `PlantDetailView`.
2. `PlantImageCapture` opens.
3. User selects one or more images from their device.
4. For each image:
   a. `detectFace(file)` — rejects with an error toast if a face is detected.
   b. `compressImage(file)` — resizes to ≤720px and compresses to JPEG.
   c. The compressed image is read as a data URL.
   d. Saved locally via `DatabaseService.saveImageLocally()`.
5. `uploadService.queueUpload(plantId, plantName, images)` adds images to the upload queue.
6. The upload service processes the queue:
   a. Computes SHA-256 hash of each file.
   b. Signs the hash with the user's secp256k1 private key (timestamp included to prevent replay).
   c. Uploads to the `uploadthing-route` Edge Function as multipart form data.
   d. The Edge Function verifies the signature, checks quota, inserts into `plant_images`, and returns the CDN URL.
   e. The URL and key are saved locally via `DatabaseService.saveUploadedImageUrl()`.

### Quota System
- Maximum 100 images per user.
- `uploadService.getQuotaInfo()` returns `{ used, limit, remaining }`.
- `ImageQuotaModal` warns the user when approaching the limit.
- The `users.image_count` column is incremented server-side on each upload and decremented on deletion.

### Edge Cases
- **Face detected:** Toast shown. Image is not saved or uploaded.
- **Upload fails (network):** Image remains in the local queue and is retried with exponential backoff.
- **Quota exceeded:** Upload is blocked. User must delete existing images before uploading new ones.
- **User deletes an image:** The delete-image Edge Function verifies a new secp256k1 signature over `(delete:uploadthingKey:timestamp)`, removes the file from storage, deletes the `plant_images` record, and decrements `image_count`.

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
