import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, Shield, Palette, Database, Info, Smartphone, Globe, Moon, Tractor, Image as ImageIcon, RefreshCw, Sprout, BookUser, FileUp } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ConfirmationModal } from './ConfirmationModal';
import { ToastContainer } from './ToastContainer';
import { useToast } from '../hooks/useToast';
import { DatabaseService } from '../lib/database';
import { encryptData, decryptData, importCryptoKey } from '../lib/cryptoService';
import { SupabaseService } from '../lib/supabaseService';
import { NotificationService } from '../lib/notificationService';
import { InstallButton } from './InstallPrompt';
import { IOSInstallInstructions } from './IOSInstallInstructions';
import { uploadService } from '../lib/uploadService';
import { syncMissingImages } from '../lib/imageSync';
import { syncOnAppLoad, pushLocalBackup, getLastSyncVersion } from '../lib/syncService';
import { getPendingChanges } from '../lib/database';
import { generatePersonalHarvest, generateHarvestPreview, downloadHarvestReport, HarvestPreview } from '../lib/harvestService';
import type { Plant } from '../lib/database';
import { HarvestPreviewModal } from './HarvestPreviewModal';
import dayjs from 'dayjs';

declare const __APP_VERSION__: string;

export const SettingsView: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('settings');
  const { toasts, success, error, removeToast } = useToast();
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showIOSInstructions, setShowIOSInstructions] = React.useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(NotificationService.hasPermission());
  const [imageQuota, setImageQuota] = React.useState(uploadService.getQuotaInfo());
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = React.useState(false);
  const [lastSyncTime, setLastSyncTime] = React.useState<string | null>(getLastSyncVersion());
  const [hasPendingChanges, setHasPendingChanges] = React.useState(getPendingChanges());

  React.useEffect(() => {
    setLastSyncTime(getLastSyncVersion());
    setHasPendingChanges(getPendingChanges());
  }, []);
  const [offlineModeEnabled, setOfflineModeEnabled] = React.useState(() => {
    const stored = localStorage.getItem('offline_mode_enabled');
    return stored === null ? true : stored === 'true';
  });
  const [backgroundSyncEnabled, setBackgroundSyncEnabled] = React.useState(() => {
    const stored = localStorage.getItem('background_sync_enabled');
    return stored === null ? true : stored === 'true';
  });
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [isGeneratingHarvest, setIsGeneratingHarvest] = React.useState(false);
  const [harvestDateFrom, setHarvestDateFrom] = React.useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [harvestDateTo, setHarvestDateTo] = React.useState(() => new Date().toISOString().split('T')[0]);
  const [harvestDateError, setHarvestDateError] = React.useState('');
  const [harvestPreview, setHarvestPreview] = React.useState<HarvestPreview | null>(null);
  const [showHarvestPreview, setShowHarvestPreview] = React.useState(false);
  const [harvestAllPlants, setHarvestAllPlants] = React.useState<Plant[]>([]);
  const [confirmationModal, setConfirmationModal] = React.useState<{
    isOpen: boolean;
    onConfirm: () => void;
    title: string;
    message: string;
  }>({
    isOpen: false,
    onConfirm: () => {},
    title: '',
    message: ''
  });

  const handleBack = () => {
    navigate('/');
  };

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) {
      const granted = await NotificationService.requestPermission();
      if (granted) {
        setNotificationsEnabled(true);
        success(t('toasts.notificationsEnabled'), t('toasts.notificationsEnabledDesc'));

        // Schedule notifications for all plants
        const plants = await DatabaseService.getAllPlants();
        for (const plant of plants) {
          if (plant.next_scheduled_care > Date.now()) {
            await NotificationService.scheduleNotification(
              plant.id,
              plant.name,
              plant.next_scheduled_care
            );
          }
        }
      } else {
        error(t('toasts.permissionDenied'), t('toasts.permissionDeniedDesc'));
      }
    } else {
      setNotificationsEnabled(false);
      success(t('toasts.notificationsDisabled'), t('toasts.notificationsDisabledDesc'));
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // Get user data from localStorage
      const storedUser = localStorage.getItem('garden-key');
      if (!storedUser) {
        error(t('toasts.noGardenKey'), t('toasts.noGardenKeyDesc'));
        return;
      }

      const userData = JSON.parse(storedUser);

      // Try to sync with Supabase first to get latest data
      try {
        console.log('Syncing with Supabase before export...');
        const downloadResult = await SupabaseService.downloadBackup(userData.userId, userData.signingPrivateKey);
        
        if (downloadResult.success && downloadResult.encryptedBackup) {
          // Import private key for decryption
          const privateKey = await importCryptoKey(userData.privateKey, 'pkcs8', ['decrypt']);
          
          // Decrypt and restore the latest backup
          const encryptedData = JSON.parse(downloadResult.encryptedBackup);
          const decryptedJson = await decryptData(encryptedData, privateKey);
          const backupData = JSON.parse(decryptedJson);
          
          // Restore to local database
          await DatabaseService.restoreBackupFromObject(backupData);
          console.log('Restored latest data from Supabase');
        }
      } catch (syncError) {
        console.warn('Could not sync with Supabase before export:', syncError);
        // Continue with local export
      }
      
      // Import public key for encryption
      const publicKey = await importCryptoKey(userData.publicKey, 'spki', ['encrypt']);
      
      // Get full database backup
      const backupData = await DatabaseService.getFullBackupAsObject();
      const backupJson = JSON.stringify(backupData);
      
      // Encrypt the backup data
      const encryptedData = await encryptData(backupJson, publicKey);
      
      // Create final export structure with metadata visible without decryption
      const exportStructure = {
        export_timestamp: Date.now(),
        user_uuid: userData.userId,
        encrypted_data: encryptedData
      };
      
      // Create filename with timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
      const filename = `garden-data-${timestamp}.garden`;
      
      // Download encrypted file
      const blob = new Blob([JSON.stringify(exportStructure, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      success(t('toasts.dataExported'), t('toasts.dataExportedDesc'));
    } catch (err) {
      console.error('Failed to export data:', err);
      error(t('toasts.exportFailed'), t('toasts.exportFailedDesc'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      // Get user data from localStorage
      const storedUser = localStorage.getItem('garden-key');
      if (!storedUser) {
        error(t('toasts.noGardenKey'), t('toasts.noGardenKeyDesc'));
        return;
      }
      
      const userData = JSON.parse(storedUser);
      
      // Import private key for decryption
      const privateKey = await importCryptoKey(userData.privateKey, 'pkcs8', ['decrypt']);
      
      // Read file content
      const encryptedData = await file.text();
      
      // Parse the outer JSON structure to extract encrypted_data
      const fileStructure = JSON.parse(encryptedData);
      
      // Decrypt the data using the encrypted_data object
      const decryptedJson = await decryptData(fileStructure.encrypted_data, privateKey);
      const backupData = JSON.parse(decryptedJson);
      
      // Restore database from backup
      await DatabaseService.restoreBackupFromObject(backupData);
      
      success(t('toasts.dataImported'), t('toasts.dataImportedDesc'));

      // Redirect to garden view after successful import
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      console.error('Failed to import data:', err);
      error(t('toasts.importFailed'), t('toasts.importFailedDesc'));
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClearAllData = () => {
    setConfirmationModal({
      isOpen: true,
      title: 'Clear All Data',
      message: 'This will permanently delete your entire garden, including all plants, activities, and settings. This action cannot be undone. Are you sure you want to proceed?',
      onConfirm: async () => {
        try {
          // Clear all database tables
          await DatabaseService.clearAllData();

          // Clear all localStorage data including garden key
          localStorage.clear();

          // Clear all sessionStorage data
          sessionStorage.clear();

          success(t('toasts.gardenCleared'), t('toasts.gardenClearedDesc'));

          // Navigate back to welcome screen after a short delay
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } catch (err) {
          console.error('Failed to clear data:', err);
          error(t('toasts.clearFailed'), t('toasts.clearFailedDesc'));
        }
      }
    });
  };

  const handleCloudSync = async () => {
    if (isCloudSyncing) return;
    setIsCloudSyncing(true);
    try {
      const storedUser = localStorage.getItem('garden-key');
      if (!storedUser) {
        error('No garden key found', 'Please create a new garden first');
        return;
      }

      const userData = JSON.parse(storedUser);
      const hasPending = getPendingChanges();

      if (hasPending) {
        const ok = await pushLocalBackup(userData);
        if (ok) {
          success(t('toasts.gardenSaved'), t('toasts.gardenSavedDesc'));
        } else {
          error(t('toasts.syncFailed'), t('toasts.syncFailedDesc'));
        }
      } else {
        await syncOnAppLoad(userData, () => Promise.resolve(true));
        success(t('toasts.gardenSynced'), t('toasts.gardenSyncedDesc'));
      }
    } catch (err) {
      error(t('toasts.syncFailedConnection'), t('toasts.syncFailedConnectionDesc'));
    } finally {
      setIsCloudSyncing(false);
      setLastSyncTime(getLastSyncVersion());
      setHasPendingChanges(getPendingChanges());
    }
  };

  const handleToggleOfflineMode = async (enabled: boolean) => {
    setOfflineModeEnabled(enabled);
    localStorage.setItem('offline_mode_enabled', String(enabled));

    if ('serviceWorker' in navigator) {
      const sw = await navigator.serviceWorker.ready;
      sw.active?.postMessage({ type: 'SET_OFFLINE_MODE', payload: { enabled } });
    }

    if (enabled) {
      success(t('toasts.offlineModeEnabled'), t('toasts.offlineModeEnabledDesc'));
    } else {
      success(t('toasts.offlineModeDisabled'), t('toasts.offlineModeDisabledDesc'));
    }
  };

  const handleToggleBackgroundSync = async (enabled: boolean) => {
    setBackgroundSyncEnabled(enabled);
    localStorage.setItem('background_sync_enabled', String(enabled));

    if ('serviceWorker' in navigator) {
      const sw = await navigator.serviceWorker.ready;
      sw.active?.postMessage({ type: 'SET_BACKGROUND_SYNC', payload: { enabled } });
    }

    if (enabled) {
      success(t('toasts.bgSyncEnabled'), t('toasts.bgSyncEnabledDesc'));
    } else {
      success(t('toasts.bgSyncDisabled'), t('toasts.bgSyncDisabledDesc'));
    }
  };

  const handleCheckForUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.update().then(() => {
          if (registration.waiting) {
            setUpdateAvailable(true);
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            success(t('toasts.updateReady'), t('toasts.updateReadyDesc'));
          } else {
            success(t('toasts.upToDate'), t('toasts.upToDateDesc'));
          }
        });
      });
    } else {
      success(t('toasts.upToDate'), t('toasts.upToDateDesc'));
    }
  };

  const handleSyncImages = async () => {
    setIsSyncing(true);
    try {
      const storedUser = localStorage.getItem('garden-key');
      if (!storedUser) {
        error('No garden key found', 'Please create a new garden first');
        return;
      }

      const userData = JSON.parse(storedUser);
      const plants = await DatabaseService.getAllPlants();
      await syncMissingImages(plants, {
        userId: userData.userId,
        privateKey: userData.privateKey,
        signingPrivateKey: userData.signingPrivateKey,
      });
      setImageQuota(uploadService.getQuotaInfo());
      success(t('toasts.imagesSynced'), t('toasts.imagesSyncedDesc'));
    } catch (err) {
      console.error('Failed to sync images:', err);
      error(t('toasts.syncFailed'), t('toasts.tryAgain', { ns: 'common' }));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetryUploads = async () => {
    try {
      await uploadService.retryFailedUploads();
      success(t('toasts.retryingUploads'), t('toasts.retryingUploadsDesc'));
    } catch (err) {
      console.error('Failed to retry uploads:', err);
      error(t('toasts.retryFailed'), t('toasts.retryFailedDesc'));
    }
  };

  const handleGenerateHarvest = async () => {
    setHarvestDateError('');
    if (!harvestDateFrom || !harvestDateTo) {
      setHarvestDateError(t('harvest.bothDatesRequired'));
      return;
    }
    const [fy, fm, fd] = harvestDateFrom.split('-').map(Number);
    const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const [ty, tm, td] = harvestDateTo.split('-').map(Number);
    const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
    if (from > to) {
      setHarvestDateError(t('harvest.startBeforeEnd'));
      return;
    }
    const allPlants = await DatabaseService.getAllPlants();
    setHarvestAllPlants(allPlants);
    const preview = generateHarvestPreview(from, to);
    setHarvestPreview(preview);
    setShowHarvestPreview(true);
  };

  const handleConfirmHarvest = async (selectedPlantIds?: string[]) => {
    if (!harvestPreview) return;
    setIsGeneratingHarvest(true);
    try {
      const report = await generatePersonalHarvest(harvestPreview.dateFrom, harvestPreview.dateTo, selectedPlantIds);
      downloadHarvestReport(report);
      setShowHarvestPreview(false);
      setHarvestPreview(null);
      success(t('toasts.harvestReady'), t('toasts.harvestReadyDesc'));
    } catch (err) {
      error(t('toasts.harvestFailed'), t('toasts.harvestFailedDesc'));
    } finally {
      setIsGeneratingHarvest(false);
    }
  };

  const settingsSections = [
    {
      title: t('sections.notifications'),
      icon: Bell,
      items: [
        { label: t('notifications.push'), description: t('notifications.pushDesc'), type: 'notification-toggle', enabled: notificationsEnabled, onToggle: handleToggleNotifications },
        { label: t('notifications.sound'), description: t('notifications.soundDesc'), type: 'toggle' },
        { label: t('notifications.quietHours'), description: t('notifications.quietHoursDesc'), type: 'action' }
      ]
    },
    {
      title: t('sections.appearance'),
      icon: Palette,
      items: [
        { label: t('appearance.theme'), description: t('appearance.themeDesc'), type: 'select' },
        { label: t('appearance.plantDisplay'), description: t('appearance.plantDisplayDesc'), type: 'action' },
        { label: t('appearance.cardLayout'), description: t('appearance.cardLayoutDesc'), type: 'action' }
      ]
    },
    {
      title: t('sections.dataPrivacy'),
      icon: Shield,
      items: [
        { label: t('dataPrivacy.syncCloud'), description: t('dataPrivacy.syncCloudDesc'), type: 'sync', onClick: handleCloudSync, loading: isCloudSyncing },
        { label: t('dataPrivacy.localBackup'), description: t('dataPrivacy.localBackupDesc'), type: 'action', onClick: handleExportData, loading: isExporting },
        { label: t('dataPrivacy.importData'), description: t('dataPrivacy.importDataDesc'), type: 'action', onClick: handleImportData, loading: isImporting },
        { label: t('dataPrivacy.downloadKey'), description: t('dataPrivacy.downloadKeyDesc'), type: 'action', onClick: () => {
          const storedUser = localStorage.getItem('garden-key');
          if (!storedUser) {
            error('No garden key found', 'Please create a new garden first');
            return;
          }

          const userData = JSON.parse(storedUser);
          const gardenKeyData = {
            ...userData,
            created: new Date().toISOString()
          };

          const blob = new Blob([JSON.stringify(gardenKeyData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `garden-key-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          success(t('toasts.keyDownloaded'), t('toasts.keyDownloadedDesc'));
        } },
        { label: t('dataPrivacy.clearAll'), description: t('dataPrivacy.clearAllDesc'), type: 'danger', onClick: handleClearAllData }
      ]
    },
    {
      title: t('sections.sharingHarvest'),
      icon: Sprout,
      items: [
        { label: 'harvest-form', type: 'harvest-form' },
        { label: t('harvest.generateBriefLink'), description: t('harvest.generateBriefLinkDesc'), type: 'harvest-brief-link' }
      ]
    },
    {
      title: t('sections.imageManagement'),
      icon: ImageIcon,
      items: [
        {
          label: t('images.quota'),
          description: t('images.quotaDesc', { used: imageQuota.imagesUsed, max: imageQuota.maxImages }),
          type: 'info'
        },
        {
          label: t('images.storage'),
          description: t('images.storageDesc', { used: (imageQuota.storageUsed / 1024 / 1024).toFixed(2), max: (imageQuota.maxStorage / 1024 / 1024).toFixed(2) }),
          type: 'info'
        },
        {
          label: t('images.sync'),
          description: t('images.syncDesc'),
          type: 'action',
          onClick: handleSyncImages,
          loading: isSyncing
        },
        {
          label: t('images.retry'),
          description: t('images.retryDesc'),
          type: 'action',
          onClick: handleRetryUploads
        }
      ]
    },
    {
      title: t('sections.gardenManagement'),
      icon: Database,
      items: [
        { label: t('gardenMgmt.defaultFreq'), description: t('gardenMgmt.defaultFreqDesc'), type: 'action' },
        { label: t('gardenMgmt.autoSchedule'), description: t('gardenMgmt.autoScheduleDesc'), type: 'toggle' },
        { label: t('gardenMgmt.bulkOps'), description: t('gardenMgmt.bulkOpsDesc'), type: 'action' }
      ]
    },
    {
      title: t('sections.appFeatures'),
      icon: Smartphone,
      items: [
        { label: t('appFeatures.install'), description: t('appFeatures.installDesc'), type: 'install' },
        { label: t('appFeatures.offlineMode'), description: t('appFeatures.offlineModeDesc'), type: 'functional-toggle', enabled: offlineModeEnabled, onToggle: () => handleToggleOfflineMode(!offlineModeEnabled) },
        { label: t('appFeatures.backgroundSync'), description: t('appFeatures.backgroundSyncDesc'), type: 'functional-toggle', enabled: backgroundSyncEnabled, onToggle: () => handleToggleBackgroundSync(!backgroundSyncEnabled) },
        { label: t('appFeatures.appVersion'), description: t('appFeatures.appVersionDesc', { version: __APP_VERSION__ }), type: 'version', onAction: handleCheckForUpdate, updateAvailable }
      ]
    },
    {
      title: t('sections.about'),
      icon: Info,
      items: [
        { label: t('about.privacyPolicy'), description: t('about.privacyPolicyDesc'), type: 'link' },
        { label: t('about.terms'), description: t('about.termsDesc'), type: 'link' },
        { label: t('about.help'), description: t('about.helpDesc'), type: 'link' }
      ]
    }
  ];

  const renderSettingItem = (item: any) => {
    switch (item.type) {
      case 'install':
        return (
          <InstallButton onShowInstructions={() => setShowIOSInstructions(true)} />
        );

      case 'notification-toggle':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <button
              onClick={item.onToggle}
              className="relative"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={item.enabled}
                readOnly
              />
              <div className={`w-11 h-6 rounded-full shadow-inner transition-colors ${item.enabled ? 'bg-green-500' : 'bg-gray-200'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${item.enabled ? 'translate-x-5 translate-y-0.5' : 'translate-x-0.5 translate-y-0.5'}`}></div>
              </div>
            </button>
          </div>
        );

      case 'functional-toggle':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <button onClick={item.onToggle} className="relative">
              <input type="checkbox" className="sr-only" checked={item.enabled} readOnly />
              <div className={`w-11 h-6 rounded-full shadow-inner transition-colors ${item.enabled ? 'bg-green-500' : 'bg-gray-200'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${item.enabled ? 'translate-x-5 translate-y-0.5' : 'translate-x-0.5 translate-y-0.5'}`}></div>
              </div>
            </button>
          </div>
        );

      case 'toggle':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                disabled
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full shadow-inner cursor-not-allowed opacity-50">
                <div className="w-5 h-5 bg-white rounded-full shadow transform translate-x-0.5 translate-y-0.5 transition-transform"></div>
              </div>
            </div>
          </div>
        );

      case 'version':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <button
              onClick={item.onAction}
              className="flex items-center gap-1.5 px-3 py-1 text-sm text-green-700 bg-green-50 hover:bg-green-100 rounded-lg font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {item.updateAvailable ? t('appFeatures.updateAvailable') : t('appFeatures.checkUpdate')}
            </button>
          </div>
        );
      
      case 'select':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <select 
              className="px-3 py-1 border border-gray-200 rounded-lg text-sm cursor-not-allowed opacity-50"
              disabled
            >
              <option>System</option>
            </select>
          </div>
        );
      
      case 'danger':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-red-600">{item.label}</div>
              <div className="text-sm text-red-500">{item.description}</div>
            </div>
            <button 
              className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
              onClick={item.onClick}
            >
              {t('dataPrivacy.clearAll')}
            </button>
          </div>
        );
      
      case 'info':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
          </div>
        );
      
      case 'link':
        return (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <div className="text-gray-400">
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </div>
          </div>
        );
      
      case 'sync': {
        const formattedSync = lastSyncTime
          ? dayjs(lastSyncTime).format(t('dateTimeFormat', { ns: 'common' }))
          : null;
        return (
          <div className="flex items-center justify-between pointer-events-none">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{item.label}</span>
                {hasPendingChanges && (
                  <span className="text-xs font-medium text-amber-600">(Changes pending)</span>
                )}
              </div>
              <div className="text-sm text-gray-600">{item.description}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {formattedSync ? t('dataPrivacy.lastSynced', { time: formattedSync }) : t('neverSynced', { ns: 'common' })}
              </div>
            </div>
            {item.loading ? (
              <RefreshCw className="w-4 h-4 text-green-600 animate-spin" />
            ) : (
              <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
            )}
          </div>
        );
      }

      case 'harvest-brief-link':
        return (
          <div className="flex items-center justify-between pointer-events-none">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
          </div>
        );

      case 'harvest-form':
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              {t('harvest.description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('harvest.from')}</label>
                <input
                  type="date"
                  value={harvestDateFrom}
                  onChange={e => { setHarvestDateFrom(e.target.value); setHarvestDateError(''); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('harvest.to')}</label>
                <input
                  type="date"
                  value={harvestDateTo}
                  onChange={e => { setHarvestDateTo(e.target.value); setHarvestDateError(''); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                />
              </div>
            </div>
            {harvestDateError && (
              <p className="text-xs text-red-500">{harvestDateError}</p>
            )}
            <button
              onClick={handleGenerateHarvest}
              disabled={isGeneratingHarvest}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isGeneratingHarvest ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sprout className="w-4 h-4" />
              )}
              {isGeneratingHarvest ? t('loading', { ns: 'common' }) : t('harvest.generateBtn')}
            </button>
          </div>
        );

      case 'action':
        if (item.onClick) {
          return (
            <div className="flex items-center justify-between pointer-events-none">
              <div>
                <div className="font-medium text-gray-900">{item.label}</div>
                <div className="text-sm text-gray-600">{item.description}</div>
              </div>
              {item.loading ? (
                <RefreshCw className="w-4 h-4 text-green-600 animate-spin" />
              ) : (
                <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
              )}
            </div>
          );
        }
        // Fall through to default for other action items
      default:
        return (
          <div className="flex items-center justify-between pointer-events-none">
            <div>
              <div className="font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.description}</div>
            </div>
            <div className="text-gray-400">
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Tractor className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
                <p className="text-sm text-gray-600">{t('subtitle')}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Coming Soon Banner */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
            <Moon className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('comingSoon')}</h2>
        </div>

        {/* Language Section */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Globe className="w-4 h-4 text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{t('language')}</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{t('language')}</div>
                <div className="text-sm text-gray-600">{t('languageDesc')}</div>
              </div>
              <LanguageSwitcher variant="full" className="w-48" />
            </div>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingsSections.map((section) => {
            const IconComponent = section.icon;
            return (
              <div key={section.title} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* Section Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <IconComponent className="w-4 h-4 text-gray-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                  </div>
                </div>

                {/* Section Items */}
                <div className="divide-y divide-gray-100">
                  {section.items.map((item, index) => (
                    <div
                      key={index}
                      className={`p-6 ${item.type === 'danger' ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors ${item.type === 'danger' || item.type === 'install' || item.type === 'functional-toggle' || item.type === 'notification-toggle' || item.type === 'version' || item.type === 'sync' || item.type === 'harvest-form' || item.type === 'harvest-brief-link' || (item.type === 'action' && item.onClick) ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      onClick={item.type === 'functional-toggle' || item.type === 'notification-toggle' || item.type === 'version' ? undefined : item.type === 'harvest-brief-link' ? () => navigate('/harvest-brief') : (item.onClick || undefined)}
                    >
                      {renderSettingItem(item)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">{t('comingSoonFooter')}</p>
        </div>
      </main>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".garden"
        onChange={handleFileImport}
        className="hidden"
      />

      {/* Modals */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={t('dataPrivacy.clearAll')}
        cancelText={t('dataPrivacy.keepGarden')}
        type="danger"
      />

      <ToastContainer
        toasts={toasts}
        onRemoveToast={removeToast}
      />

      <IOSInstallInstructions
        isOpen={showIOSInstructions}
        onClose={() => setShowIOSInstructions(false)}
      />

      <HarvestPreviewModal
        isOpen={showHarvestPreview}
        preview={harvestPreview}
        isGenerating={isGeneratingHarvest}
        allPlants={harvestAllPlants}
        onConfirm={handleConfirmHarvest}
        onClose={() => { setShowHarvestPreview(false); setHarvestPreview(null); }}
      />

    </div>
  );
};