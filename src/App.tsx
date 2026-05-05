import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { GardenView } from './components/GardenView';
import { PlantDetailView } from './components/PlantDetailView';
import { ActivityListView } from './components/ActivityListView';
import { SettingsView } from './components/SettingsView';
import { PlotsView } from './components/PlotsView';
import { PlotDetailView } from './components/PlotDetailView';
import { HarvestBriefView } from './components/harvest/HarvestBriefView';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ReceivePlantShareView } from './components/ReceivePlantShareView';
import { SharedGardensListView } from './components/SharedGardensListView';
import { SharedGardenView } from './components/SharedGardenView';
import { SharedPlantDetailView } from './components/SharedPlantDetailView';
import { JoinSharedGardenView } from './components/JoinSharedGardenView';
import { DatabaseService, type Plant, getPendingChanges } from './lib/database';
import { generateRSAKeyPair, exportCryptoKey } from './lib/cryptoService';
import { importCryptoKey, decryptData } from './lib/cryptoService';
import { exportCryptoKey as exportSigningKey } from './lib/signatureService';
import { SupabaseService } from './lib/supabaseService';
import { ToastContainer } from './components/ToastContainer';
import { UpdatePrompt } from './components/UpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { useToast } from './hooks/useToast';
import { NotificationService } from './lib/notificationService';
import { syncOnAppLoad, setLastSyncVersion } from './lib/syncService';
import { syncAllSharedPlants } from './lib/sharedBackupService';
import { syncAllSharedGardens } from './lib/sharedGardenSyncService';
import { syncMissingImages } from './lib/imageSync';
import { uploadService } from './lib/uploadService';
import { ImportContactModal } from './components/ImportContactModal';
import { parseVCardFile } from './lib/vCardParser';
import type { ParsedContact } from './lib/vCardParser';
import { Leaf } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;

interface User {
  userId: string;
  publicKey: string;
  privateKey: string;
  signingPublicKey: string;
  signingPrivateKey: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMergePrompt, setShowMergePrompt] = useState(false);
  const mergeResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userRef = useRef<User | null>(null);
  const { toasts, success, error, removeToast } = useToast();
  const [sharedContacts, setSharedContacts] = useState<ParsedContact[] | null>(null);

  userRef.current = user;

  const handleMergeConfirm = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      mergeResolveRef.current = resolve;
      setShowMergePrompt(true);
    });
  }, []);

  const runSync = useCallback(async (currentUser: User) => {
    await syncOnAppLoad(currentUser, handleMergeConfirm);
    // After personal garden syncs, sync all shared plants in turn
    await syncAllSharedPlants(currentUser).catch(() => {});
    // Then sync all shared gardens
    await syncAllSharedGardens(currentUser).catch(() => {});
    window.dispatchEvent(new CustomEvent('garden-data-refreshed'));
  }, [handleMergeConfirm]);

  const startAutoSync = useCallback((currentUser: User) => {
    if (autoSyncTimerRef.current) {
      clearInterval(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setInterval(async () => {
      if (!navigator.onLine) return;
      if (!getPendingChanges()) return;
      if (uploadService.isUploadInProgress()) return;

      await runSync(currentUser);
    }, AUTO_SYNC_INTERVAL_MS);
  }, [runSync]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing Garden app...');

        await DatabaseService.init();
        console.log('Database initialized with persistence');

        const storedUser = localStorage.getItem('garden-key');
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          setUser(userData);
          localStorage.setItem('user_id', userData.userId);
          localStorage.setItem('signature_private_key', userData.signingPrivateKey);
          localStorage.setItem('signature_public_key', userData.signingPublicKey);
          console.log('Restored existing garden from storage');

          startAutoSync(userData);
          runSync(userData);
        } else {
          console.log('No existing garden found');
        }

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(async (registration) => {
            try {
              if ('periodicSync' in registration) {
                await (registration as any).periodicSync.register('check-plant-care', {
                  minInterval: 4 * 60 * 60 * 1000
                });
              }
            } catch (_) {
              // periodic sync not supported
            }

            try {
              const plants = await DatabaseService.getAllPlants();
              registration.active?.postMessage({
                type: 'SYNC_PLANT_SCHEDULES',
                payload: { plants }
              });
            } catch (_) {
              // non-critical
            }
          });

          navigator.serviceWorker.addEventListener('message', async (event) => {
            if (event.data.type === 'REQUEST_PLANT_DATA') {
              const plants = await DatabaseService.getAllPlants();
              const sw = await navigator.serviceWorker.ready;
              sw.active?.postMessage({
                type: 'PLANTS_DATA',
                payload: { plants }
              });
            }
          });

          window.addEventListener('plant-care-updated', async (event: any) => {
            const { plantId, nextCareTimestamp, plantName } = event.detail;
            await NotificationService.scheduleNotification(plantId, plantName, nextCareTimestamp);
            const plants = await DatabaseService.getAllPlants();
            await NotificationService.syncPlantSchedules(plants);
          });
        }

        setIsLoading(false);
        console.log('Garden app ready!');
      } catch (err) {
        console.error('Failed to initialize app:', err);
        setIsLoading(false);
      }
    };

    initializeApp();

    return () => {
      if (autoSyncTimerRef.current) {
        clearInterval(autoSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shared-contact') !== '1') return;

    window.history.replaceState({}, '', '/');

    const readSharedContact = async () => {
      try {
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open('garden-share-db', 1);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
          req.onupgradeneeded = (e) => {
            const d = (e.target as IDBOpenDBRequest).result;
            if (!d.objectStoreNames.contains('pending-shared-contact')) {
              d.createObjectStore('pending-shared-contact', { keyPath: 'id' });
            }
          };
        });

        const tx = db.transaction(['pending-shared-contact'], 'readwrite');
        const store = tx.objectStore('pending-shared-contact');
        const record: any = await new Promise((resolve, reject) => {
          const r = store.get('pending');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        store.delete('pending');

        if (!record) return;

        const vcfText: string = record.vcfText || '';
        if (!vcfText.trim()) return;

        const contacts = parseVCardFile(vcfText);
        if (contacts.length > 0) {
          setSharedContacts(contacts);
        } else if (record.title) {
          setSharedContacts([{ name: record.title }]);
        }
      } catch {
        // non-critical
      }
    };

    readSharedContact();
  }, []);

  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && userRef.current) {
        runSync(userRef.current);
      }
    };

    const handleFocus = () => {
      if (userRef.current) {
        runSync(userRef.current);
      }
    };

    const handleOnline = () => {
      if (userRef.current) {
        runSync(userRef.current);
        uploadService.retryFailedUploads();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [user, runSync]);

  const handleConfirmSharedContact = async (contact: ParsedContact & {
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    photoDataUrl?: string;
  }) => {
    const newPlant = await DatabaseService.addPlant({
      name: contact.name,
      phone: contact.phone,
      description: contact.note,
      care_frequency_multiplier: contact.care_frequency_multiplier,
      care_frequency_unit: contact.care_frequency_unit,
    });
    if (contact.photoDataUrl) {
      await uploadService.queueUpload(newPlant.id, contact.name, contact.photoDataUrl);
    }
    setSharedContacts(null);
    success('Seed sown', `${contact.name} has been planted in your garden`);
    window.dispatchEvent(new CustomEvent('garden-data-refreshed'));
  };

  const createNewGarden = async () => {
    console.log('Creating new garden with persistent storage...');

    try {
      const keyPairs = await generateRSAKeyPair();

      const publicKeyString = await exportCryptoKey(keyPairs.encryptionKeys.publicKey, 'spki');
      const privateKeyString = await exportCryptoKey(keyPairs.encryptionKeys.privateKey, 'pkcs8');

      const signingPublicKeyString = await exportSigningKey(keyPairs.signingKeys.publicKey, 'spki');
      const signingPrivateKeyString = await exportSigningKey(keyPairs.signingKeys.privateKey, 'pkcs8');

      const newUser: User = {
        userId: uuidv4(),
        publicKey: publicKeyString,
        privateKey: privateKeyString,
        signingPublicKey: signingPublicKeyString,
        signingPrivateKey: signingPrivateKeyString
      };

      console.log('Registering user with Supabase...');
      const registrationResult = await SupabaseService.registerUser(
        newUser.userId,
        newUser.publicKey,
        newUser.signingPublicKey
      );

      if (!registrationResult.success) {
        console.error('Failed to register with Supabase:', registrationResult.error);
        error('Cloud backup failed', 'Failed to register with cloud backup. You can still use the app locally.');
      } else {
        console.log('Successfully registered with Supabase');
        if (registrationResult.timestamp) {
          setLastSyncVersion(registrationResult.timestamp);
        }
      }

      localStorage.setItem('garden-key', JSON.stringify(newUser));
      localStorage.setItem('user_id', newUser.userId);
      localStorage.setItem('signature_private_key', newUser.signingPrivateKey);
      localStorage.setItem('signature_public_key', newUser.signingPublicKey);
      setUser(newUser);
      startAutoSync(newUser);
    } catch (err) {
      console.error('Failed to create new garden:', err);
      error('Garden creation failed', 'Failed to create garden. Please try again.');
    }
  };

  const restoreGardenKey = (gardenKeyFile: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const gardenKeyData = JSON.parse(e.target?.result as string);
        if (gardenKeyData.userId && gardenKeyData.publicKey && gardenKeyData.privateKey) {
          localStorage.setItem('garden-key', JSON.stringify(gardenKeyData));
          localStorage.setItem('user_id', gardenKeyData.userId);
          localStorage.setItem('signature_private_key', gardenKeyData.signingPrivateKey);
          localStorage.setItem('signature_public_key', gardenKeyData.signingPublicKey);
          localStorage.setItem('garden-restored-from-key', 'true');

          await syncFromServerAfterRestore(gardenKeyData);

          setUser(gardenKeyData);
          startAutoSync(gardenKeyData);
        } else {
          throw new Error('Invalid garden key file format');
        }
      } catch (err) {
        console.error('Failed to restore from garden key:', err);
        error('Invalid garden key', 'Invalid garden key file. Please check the file and try again.');
      }
    };
    reader.readAsText(gardenKeyFile);
  };

  const syncFromServerAfterRestore = async (userData: User) => {
    try {
      console.log('Syncing with server after garden key restore...');

      const downloadResult = await SupabaseService.downloadBackup(userData.userId, userData.signingPrivateKey);

      if (downloadResult.success && downloadResult.encryptedBackup) {
        console.log('Found server backup, restoring to local database...');

        const privateKey = await importCryptoKey(userData.privateKey, 'pkcs8', ['decrypt']);

        const encryptedData = JSON.parse(downloadResult.encryptedBackup);
        const decryptedJson = await decryptData(encryptedData, privateKey);
        const backupData = JSON.parse(decryptedJson);

        await DatabaseService.restoreBackupFromObject(backupData);

        if (downloadResult.lastModified) {
          setLastSyncVersion(downloadResult.lastModified);
        }

        const plants = await DatabaseService.getAllPlants();
        syncMissingImages(plants, userData);

        console.log('Successfully synced with server backup');
        success('Garden restored', 'Your garden has been updated with the latest data from the server.');
      } else {
        console.log('No server backup found, continuing with local data');
      }
    } catch (syncError) {
      console.warn('Could not sync with server after restore, continuing with local data:', syncError);
    }
  };

  const restoreFromBackup = (backupFile: File) => {
    restoreGardenKey(backupFile);
  };

  console.log('App render - isLoading:', isLoading, 'user:', user);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 animate-spin">
            <Leaf className="w-16 h-16 text-green-600" />
          </div>
          <p className="text-gray-600">Preparing your garden...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Router>
          <WelcomeScreen
            onCreateGarden={createNewGarden}
            onRestoreGardenKey={restoreGardenKey}
          />
        </Router>
        <ToastContainer
          toasts={toasts}
          onRemoveToast={removeToast}
        />
      </>
    );
  }

  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<GardenView />} />
          <Route path="/plants/:plantId" element={<PlantDetailView />} />
          <Route path="/plants/:plantId/activities/:activityType" element={<ActivityListView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/plots" element={<PlotsView />} />
          <Route path="/plots/:plotId" element={<PlotDetailView />} />
          <Route path="/harvest-brief" element={<HarvestBriefView />} />
          <Route path="/receive-plant-share/:plantId" element={<ReceivePlantShareView />} />
          <Route path="/shared-gardens" element={<SharedGardensListView />} />
          <Route path="/shared-garden/:gardenId" element={<SharedGardenView />} />
          <Route path="/shared-garden/:gardenId/plants/:plantId" element={<SharedPlantDetailView />} />
          <Route path="/join-shared-garden/:gardenId" element={<JoinSharedGardenView />} />
        </Routes>
      </Router>
      <UpdatePrompt />
      <InstallPrompt />
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
      {sharedContacts && (
        <ImportContactModal
          contacts={sharedContacts}
          onConfirm={handleConfirmSharedContact}
          onClose={() => setSharedContacts(null)}
        />
      )}
      {showMergePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Changes from another device</h2>
            <p className="text-sm text-gray-600 mb-6">
              Your garden was updated on another device since your last sync. Would you like to merge those changes with your local ones?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowMergePrompt(false);
                  mergeResolveRef.current?.(false);
                  mergeResolveRef.current = null;
                }}
                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Keep local only
              </button>
              <button
                onClick={() => {
                  setShowMergePrompt(false);
                  mergeResolveRef.current?.(true);
                  mergeResolveRef.current = null;
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Merge changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
