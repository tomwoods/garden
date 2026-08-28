import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

// ─── DB constants ──────────────────────────────────────────────────────────────

const NOTIFICATION_DB      = 'notification-scheduler-db';
const NOTIFICATION_STORE   = 'scheduled-notifications';
const PLANT_SCHEDULE_STORE = 'plant-schedules';
const UPLOAD_QUEUE_DB      = 'upload-queue-db';
const UPLOAD_QUEUE_STORE   = 'pending-uploads';
const SHARE_DB             = 'garden-share-db';
const SHARE_STORE          = 'pending-shared-contact';

// ─── Shared contact DB ────────────────────────────────────────────────────────

async function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SHARE_STORE)) {
        db.createObjectStore(SHARE_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function saveSharedContact(data) {
  const db = await openShareDB();
  const tx = db.transaction([SHARE_STORE], 'readwrite');
  tx.objectStore(SHARE_STORE).put({ id: 'pending', ...data });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

// ─── Share Target fetch handler ───────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const title = formData.get('title') || '';
        const text  = formData.get('text')  || '';
        const file  = formData.get('contact');

        let vcfText = '';
        if (file && typeof file === 'object' && file.size > 0) {
          vcfText = await file.text();
        } else if (typeof text === 'string' && text.trim()) {
          vcfText = text.trim();
        }

        await saveSharedContact({
          title: typeof title === 'string' ? title : '',
          vcfText,
        });
      } catch (_) {
        // best-effort — still redirect so the app opens
      }

      return Response.redirect('/?shared-contact=1', 303);
    })());
    return;
  }
});

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => rescheduleStoredNotifications())
  );
});

// ─── Notification DB ───────────────────────────────────────────────────────────

async function openNotificationDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTIFICATION_DB, 2);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(NOTIFICATION_STORE)) {
        db.createObjectStore(NOTIFICATION_STORE, { keyPath: 'tag' });
      }
      if (!db.objectStoreNames.contains(PLANT_SCHEDULE_STORE)) {
        db.createObjectStore(PLANT_SCHEDULE_STORE, { keyPath: 'plantId' });
      }
    };
  });
}

async function saveNotification(notification) {
  const db = await openNotificationDB();
  const tx = db.transaction([NOTIFICATION_STORE], 'readwrite');
  tx.objectStore(NOTIFICATION_STORE).put(notification);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

async function deleteNotification(tag) {
  const db = await openNotificationDB();
  const tx = db.transaction([NOTIFICATION_STORE], 'readwrite');
  tx.objectStore(NOTIFICATION_STORE).delete(tag);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

async function getAllNotifications() {
  const db = await openNotificationDB();
  const tx = db.transaction([NOTIFICATION_STORE], 'readonly');
  const request = tx.objectStore(NOTIFICATION_STORE).getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

// ─── Plant schedule store (persists across SW restarts) ───────────────────────

function isTranslationKey(str) {
  return typeof str === 'string' && /^[a-z][a-zA-Z0-9_]*$/.test(str) && !str.includes(' ');
}

const FALLBACK_GARDEN_OVERDUE_TITLE = 'Your garden needs attention';
const FALLBACK_GARDEN_OVERDUE_BODY = '{{count}} plants are waiting to be tended';
const FALLBACK_OVERDUE_TITLE = 'Time to tend your garden';

async function savePlantSchedules(plants, gardenOverdueTitle, gardenOverdueBody) {
  const db = await openNotificationDB();
  const tx = db.transaction([PLANT_SCHEDULE_STORE], 'readwrite');
  const store = tx.objectStore(PLANT_SCHEDULE_STORE);
  for (const plant of plants) {
    store.put({ plantId: plant.id, name: plant.name, nextScheduledCare: plant.next_scheduled_care });
  }
  if (
    gardenOverdueTitle && gardenOverdueBody &&
    !isTranslationKey(gardenOverdueTitle) && !isTranslationKey(gardenOverdueBody)
  ) {
    store.put({
      plantId: '__garden_overdue_templates__',
      gardenOverdueTitle,
      gardenOverdueBody
    });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

async function getGardenOverdueTemplates() {
  const db = await openNotificationDB();
  const tx = db.transaction([PLANT_SCHEDULE_STORE], 'readonly');
  const request = tx.objectStore(PLANT_SCHEDULE_STORE).get('__garden_overdue_templates__');
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror   = () => reject(request.error);
  });
}

async function getAllPlantSchedules() {
  const db = await openNotificationDB();
  const tx = db.transaction([PLANT_SCHEDULE_STORE], 'readonly');
  const request = tx.objectStore(PLANT_SCHEDULE_STORE).getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

// ─── Upload queue DB ───────────────────────────────────────────────────────────

async function openUploadDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(UPLOAD_QUEUE_DB, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(UPLOAD_QUEUE_STORE)) {
        db.createObjectStore(UPLOAD_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function saveToUploadQueue(uploadData) {
  const db = await openUploadDB();
  const tx = db.transaction([UPLOAD_QUEUE_STORE], 'readwrite');
  tx.objectStore(UPLOAD_QUEUE_STORE).add(uploadData);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

async function getPendingUploads() {
  const db = await openUploadDB();
  const tx = db.transaction([UPLOAD_QUEUE_STORE], 'readonly');
  const request = tx.objectStore(UPLOAD_QUEUE_STORE).getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

async function removeFromUploadQueue(id) {
  const db = await openUploadDB();
  const tx = db.transaction([UPLOAD_QUEUE_STORE], 'readwrite');
  tx.objectStore(UPLOAD_QUEUE_STORE).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

async function processUploadQueue() {
  try {
    const pendingUploads = await getPendingUploads();
    const allClients = await self.clients.matchAll({ type: 'window' });
    if (allClients.length > 0) {
      for (const upload of pendingUploads) {
        allClients[0].postMessage({
          type: 'PROCESS_UPLOAD_QUEUE',
          payload: { uploadId: upload.id }
        });
      }
    }
  } catch (error) {
    // upload queue processing failed silently
  }
}

// ─── Notification scheduling ──────────────────────────────────────────────────

function supportsTimestampTrigger() {
  return 'showTrigger' in Notification.prototype;
}

function buildNotificationOptions(plantId, title, body, tag) {
  return {
    body,
    icon: '/icon-192x192.png',
    badge: '/icon-badge.png',
    tag,
    renotify: false,
    data: {
      plantId,
      url: `${self.location.origin}/?plant=${plantId}`
    },
    actions: [
      { action: 'open', title: 'Open garden' }
    ]
  };
}

async function scheduleNotificationWithTrigger(plantId, plantName, scheduledTime, tag, notificationTitle, notificationBody) {
  const title = notificationTitle || plantName;
  const body  = notificationBody  || `It's time to tend to ${plantName}.`;

  if (!supportsTimestampTrigger()) {
    await saveNotification({ tag, plantId, plantName, scheduledTime, notificationTitle: title, notificationBody: body });
    return;
  }

  try {
    await self.registration.showNotification(title, {
      ...buildNotificationOptions(plantId, plantName, body, tag),
      showTrigger: new TimestampTrigger(scheduledTime)
    });
  } catch (error) {
    await saveNotification({ tag, plantId, plantName, scheduledTime, notificationTitle: title, notificationBody: body });
  }
}

async function rescheduleStoredNotifications() {
  try {
    const notifications = await getAllNotifications();
    const now = Date.now();
    for (const n of notifications) {
      const title = n.notificationTitle || n.plantName;
      const body  = n.notificationBody  || `It's time to tend to ${n.plantName}.`;
      if (n.scheduledTime <= now) {
        await self.registration.showNotification(title, buildNotificationOptions(
          n.plantId,
          n.plantName,
          body,
          n.tag
        ));
        await deleteNotification(n.tag);
      } else if (supportsTimestampTrigger()) {
        await self.registration.showNotification(title, {
          ...buildNotificationOptions(n.plantId, n.plantName, body, n.tag),
          showTrigger: new TimestampTrigger(n.scheduledTime)
        });
        await deleteNotification(n.tag);
      }
    }
  } catch (_) {
    // non-critical: reschedule best-effort
  }
}

async function checkAndFireNotifications() {
  try {
    const notifications = await getAllNotifications();
    const now = Date.now();
    for (const n of notifications) {
      if (n.scheduledTime <= now) {
        const title = n.notificationTitle || n.plantName;
        const body  = n.notificationBody  || `It's time to tend to ${n.plantName}.`;
        await self.registration.showNotification(title, buildNotificationOptions(
          n.plantId,
          n.plantName,
          body,
          n.tag
        ));
        await deleteNotification(n.tag);
      }
    }
  } catch (_) {
    // non-critical
  }
}

// ─── Overdue care checks — works with or without an open window ───────────────

function buildGardenOverviewOptions(title, body, tag) {
  return {
    body,
    icon: '/icon-192x192.png',
    badge: '/icon-badge.png',
    tag,
    renotify: false,
    data: {
      url: self.location.origin
    },
    actions: [
      { action: 'open', title: 'Open garden' }
    ]
  };
}

function getOverduePlants(schedules, now) {
  const overdue = [];
  for (const plant of schedules) {
    if (plant.plantId === '__garden_overdue_templates__') continue;
    if (plant.nextScheduledCare && plant.nextScheduledCare < now) {
      const hoursSinceDue = (now - plant.nextScheduledCare) / (1000 * 60 * 60);
      if (hoursSinceDue >= 24) {
        overdue.push(plant);
      }
    }
  }
  return overdue;
}

async function checkMissedCare() {
  try {
    const now = Date.now();

    // Prefer reading from local IndexedDB so this works when no window is open
    const schedules = await getAllPlantSchedules();

    if (schedules.length > 0) {
      const overduePlants = getOverduePlants(schedules, now);
      if (overduePlants.length >= 2) {
        const templates = await getGardenOverdueTemplates();
        const title = (templates?.gardenOverdueTitle && !isTranslationKey(templates.gardenOverdueTitle))
          ? templates.gardenOverdueTitle
          : FALLBACK_GARDEN_OVERDUE_TITLE;
        const bodyTemplate = (templates?.gardenOverdueBody && !isTranslationKey(templates.gardenOverdueBody))
          ? templates.gardenOverdueBody
          : FALLBACK_GARDEN_OVERDUE_BODY;
        const body = bodyTemplate.replace('{{count}}', overduePlants.length);

        await self.registration.showNotification(
          title,
          buildGardenOverviewOptions(title, body, 'garden-overdue')
        );
      } else if (overduePlants.length === 1) {
        const plant = overduePlants[0];
        const hoursSinceDue = (now - plant.nextScheduledCare) / (1000 * 60 * 60);
        const daysOverdue = Math.floor(hoursSinceDue / 24);
        const body = daysOverdue === 1
          ? `${plant.name} is waiting to be tended — a day overdue.`
          : `${plant.name} is waiting to be tended — ${daysOverdue} days overdue.`;

        await self.registration.showNotification(
          FALLBACK_OVERDUE_TITLE,
          buildNotificationOptions(plant.plantId, FALLBACK_OVERDUE_TITLE, body, `plant-overdue-${plant.plantId}`)
        );
      }
      return;
    }

    // Fallback: ask the open window for plant data if no schedules are cached
    const allClients = await self.clients.matchAll({ type: 'window' });
    if (allClients.length > 0) {
      allClients[0].postMessage({ type: 'REQUEST_PLANT_DATA' });
    }
  } catch (_) {
    // non-critical
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SCHEDULE_NOTIFICATION':
      await scheduleNotificationWithTrigger(
        payload.plantId,
        payload.plantName,
        payload.scheduledTime,
        payload.tag,
        payload.notificationTitle,
        payload.notificationBody
      );
      break;

    case 'CANCEL_NOTIFICATION': {
      await deleteNotification(payload.tag);
      const active = await self.registration.getNotifications({ tag: payload.tag });
      active.forEach(n => n.close());
      break;
    }

    case 'CHECK_MISSED_CARE':
      await checkMissedCare();
      break;

    case 'PLANTS_DATA':
      if (payload.plants && Array.isArray(payload.plants)) {
        await savePlantSchedules(
          payload.plants,
          payload.gardenOverdueTitle,
          payload.gardenOverdueBody
        );

        const now = Date.now();
        const overdueTitle    = (payload.overdueTitle && !isTranslationKey(payload.overdueTitle))
          ? payload.overdueTitle
          : FALLBACK_OVERDUE_TITLE;
        const overdueTemplate = (payload.overdueTemplate && !isTranslationKey(payload.overdueTemplate))
          ? payload.overdueTemplate
          : null;
        const gardenOverdueTitle = (payload.gardenOverdueTitle && !isTranslationKey(payload.gardenOverdueTitle))
          ? payload.gardenOverdueTitle
          : FALLBACK_GARDEN_OVERDUE_TITLE;
        const gardenOverdueBody = (payload.gardenOverdueBody && !isTranslationKey(payload.gardenOverdueBody))
          ? payload.gardenOverdueBody
          : FALLBACK_GARDEN_OVERDUE_BODY;

        const overduePlants = [];
        for (const plant of payload.plants) {
          if (plant.next_scheduled_care && plant.next_scheduled_care < now) {
            const hoursSinceDue = (now - plant.next_scheduled_care) / (1000 * 60 * 60);
            if (hoursSinceDue >= 24) {
              overduePlants.push(plant);
            }
          }
        }

        if (overduePlants.length >= 2) {
          const body = gardenOverdueBody.replace('{{count}}', overduePlants.length);
          await self.registration.showNotification(
            gardenOverdueTitle,
            buildGardenOverviewOptions(gardenOverdueTitle, body, 'garden-overdue')
          );
        } else if (overduePlants.length === 1) {
          const plant = overduePlants[0];
          const hoursSinceDue = (now - plant.next_scheduled_care) / (1000 * 60 * 60);
          const daysOverdue = Math.floor(hoursSinceDue / 24);
          const body = overdueTemplate
            ? overdueTemplate.replace('{{name}}', plant.name).replace('{{days}}', daysOverdue)
            : (daysOverdue === 1
              ? `${plant.name} is waiting to be tended — a day overdue.`
              : `${plant.name} is waiting to be tended — ${daysOverdue} days overdue.`);

          await self.registration.showNotification(overdueTitle, buildNotificationOptions(
            plant.id,
            overdueTitle,
            body,
            `plant-overdue-${plant.id}`
          ));
        }
      }
      break;

    case 'SYNC_PLANT_SCHEDULES':
      if (payload.plants && Array.isArray(payload.plants)) {
        await savePlantSchedules(
          payload.plants,
          payload.gardenOverdueTitle,
          payload.gardenOverdueBody
        );
      }
      break;

    case 'QUEUE_UPLOAD':
      await saveToUploadQueue(payload.uploadData);
      break;

    case 'UPLOAD_COMPLETE':
      await removeFromUploadQueue(payload.uploadId);
      break;

    case 'SET_OFFLINE_MODE':
      self._offlineModeEnabled = payload.enabled;
      break;

    case 'SET_BACKGROUND_SYNC':
      self._backgroundSyncEnabled = payload.enabled;
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUnowned: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// ─── Background / periodic sync ──────────────────────────────────────────────

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-plant-care') {
    event.waitUntil(checkMissedCare());
  }
  if (event.tag === 'upload-sync' && self._backgroundSyncEnabled !== false) {
    event.waitUntil(processUploadQueue());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-images' && self._backgroundSyncEnabled !== false) {
    event.waitUntil(processUploadQueue());
  }
  if (event.tag === 'check-plant-care') {
    event.waitUntil(checkMissedCare());
  }
});

// ─── Push event (future-proof) ────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Garden', buildNotificationOptions(
        data.plantId || '',
        data.title || 'Garden',
        data.body || 'Time to tend your garden.',
        data.tag || 'garden-push'
      ))
    );
  } catch (_) {
    // malformed push payload — ignore
  }
});
