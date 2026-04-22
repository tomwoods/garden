import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

// ─── DB constants ──────────────────────────────────────────────────────────────

const NOTIFICATION_DB      = 'notification-scheduler-db';
const NOTIFICATION_STORE   = 'scheduled-notifications';
const PLANT_SCHEDULE_STORE = 'plant-schedules';
const UPLOAD_QUEUE_DB      = 'upload-queue-db';
const UPLOAD_QUEUE_STORE   = 'pending-uploads';

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

async function savePlantSchedules(plants) {
  const db = await openNotificationDB();
  const tx = db.transaction([PLANT_SCHEDULE_STORE], 'readwrite');
  const store = tx.objectStore(PLANT_SCHEDULE_STORE);
  for (const plant of plants) {
    store.put({ plantId: plant.id, name: plant.name, nextScheduledCare: plant.next_scheduled_care });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
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
    badge: '/icon-192x192.png',
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

async function scheduleNotificationWithTrigger(plantId, plantName, scheduledTime, tag) {
  if (!supportsTimestampTrigger()) {
    await saveNotification({ tag, plantId, plantName, scheduledTime });
    return;
  }

  try {
    await self.registration.showNotification(plantName, {
      ...buildNotificationOptions(plantId, plantName, `It's time to tend to ${plantName}.`, tag),
      showTrigger: new TimestampTrigger(scheduledTime)
    });
  } catch (error) {
    await saveNotification({ tag, plantId, plantName, scheduledTime });
  }
}

async function rescheduleStoredNotifications() {
  try {
    const notifications = await getAllNotifications();
    const now = Date.now();
    for (const n of notifications) {
      if (n.scheduledTime <= now) {
        await self.registration.showNotification(n.plantName, buildNotificationOptions(
          n.plantId,
          n.plantName,
          `It's time to tend to ${n.plantName}.`,
          n.tag
        ));
        await deleteNotification(n.tag);
      } else if (supportsTimestampTrigger()) {
        await self.registration.showNotification(n.plantName, {
          ...buildNotificationOptions(n.plantId, n.plantName, `It's time to tend to ${n.plantName}.`, n.tag),
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
        await self.registration.showNotification(n.plantName, buildNotificationOptions(
          n.plantId,
          n.plantName,
          `It's time to tend to ${n.plantName}.`,
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

async function checkMissedCare() {
  try {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Prefer reading from local IndexedDB so this works when no window is open
    const schedules = await getAllPlantSchedules();

    if (schedules.length > 0) {
      for (const plant of schedules) {
        if (plant.nextScheduledCare && plant.nextScheduledCare < now) {
          const hoursSinceDue = (now - plant.nextScheduledCare) / (1000 * 60 * 60);
          if (hoursSinceDue >= 24) {
            const daysOverdue = Math.floor(hoursSinceDue / 24);
            const body = daysOverdue === 1
              ? `${plant.name} is waiting to be tended — a day overdue.`
              : `${plant.name} is waiting to be tended — ${daysOverdue} days overdue.`;

            await self.registration.showNotification('Time to tend your garden', buildNotificationOptions(
              plant.plantId,
              'Time to tend your garden',
              body,
              `plant-overdue-${plant.plantId}`
            ));
          }
        }
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
        payload.tag
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
        await savePlantSchedules(payload.plants);

        const now = Date.now();
        for (const plant of payload.plants) {
          if (plant.next_scheduled_care && plant.next_scheduled_care < now) {
            const hoursSinceDue = (now - plant.next_scheduled_care) / (1000 * 60 * 60);
            if (hoursSinceDue >= 24) {
              const daysOverdue = Math.floor(hoursSinceDue / 24);
              const body = daysOverdue === 1
                ? `${plant.name} is waiting to be tended — a day overdue.`
                : `${plant.name} is waiting to be tended — ${daysOverdue} days overdue.`;

              await self.registration.showNotification('Time to tend your garden', buildNotificationOptions(
                plant.id,
                'Time to tend your garden',
                body,
                `plant-overdue-${plant.id}`
              ));
            }
          }
        }
      }
      break;

    case 'SYNC_PLANT_SCHEDULES':
      if (payload.plants && Array.isArray(payload.plants)) {
        await savePlantSchedules(payload.plants);
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
