import type { Plant } from './database';

export class NotificationService {
  private static permissionGranted = false;

  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      this.permissionGranted = true;
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === 'granted';
      return this.permissionGranted;
    }

    return false;
  }

  static hasPermission(): boolean {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  static async scheduleNotification(
    plantId: string,
    plantName: string,
    scheduledTime: number
  ): Promise<void> {
    if (!this.hasPermission() || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        payload: {
          plantId,
          plantName,
          scheduledTime,
          tag: `plant-care-${plantId}`
        }
      });
    } catch (_) {
      // non-critical
    }
  }

  static async cancelNotification(plantId: string): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: 'CANCEL_NOTIFICATION',
        payload: { tag: `plant-care-${plantId}` }
      });
    } catch (_) {
      // non-critical
    }
  }

  static async checkMissedCareReminders(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'CHECK_MISSED_CARE' });
    } catch (_) {
      // non-critical
    }
  }

  static async syncPlantSchedules(plants: Plant[]): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: 'SYNC_PLANT_SCHEDULES',
        payload: { plants }
      });
    } catch (_) {
      // non-critical
    }
  }
}
