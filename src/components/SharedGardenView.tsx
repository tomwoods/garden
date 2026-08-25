import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Settings, Plus, Search, X, Users, Download,
  Trash2, UserMinus, AlertTriangle, Sun, RotateCcw, FileDown, FileUp
} from 'lucide-react';
import { SharedGardenDatabase, getSharedGardenRef, markGardenRestored, markGardenDisconnected, clearGardenRestored, type SharedGardenRef } from '../lib/sharedGardenDatabase';
import { deepSyncSharedGarden, removeMemberFromGarden, downloadGardenKeyFile, leaveSharedGarden, createSharedGardenFromSnapshot } from '../lib/sharedGardenSyncService';
import { exportEncryptedSnapshot, decryptSnapshotFile, downloadSnapshotBlob } from '../lib/sharedGardenBackupService';
import { syncMissingSharedImages, type SharedImageUser } from '../lib/sharedImageSync';
import type { Plant, Tending, Watering, Sunlight, Fruit, Pruning, Companion } from '../lib/database';
import { parseAgeInfoFromPlant, resolveAgeGroup, type AgeGroup } from '../lib/harvestService';
import { PlantCard } from './PlantCard';
import { ActivityModal } from './ActivityModal';
import { AddPlantModal } from './AddPlantModal';
import { EditPlantModal } from './EditPlantModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ScheduleCareModal } from './ScheduleCareModal';
import { MapOverlay } from './MapOverlay';
import { GardenChangeLogCard } from './GardenChangeLogCard';
import { SharedGardenOverviewCard } from './SharedGardenOverviewCard';
import { ActivityReportModal } from './ActivityReportModal';
import { InviteToSharedGardenModal } from './InviteToSharedGardenModal';
import { ToastContainer } from './ToastContainer';
import { SharedGardenSlidingMenu } from './SharedGardenSlidingMenu';
import { useToast } from '../hooks/useToast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ─── Plant state calculation (mirrors GardenView logic) ───────────────────────

async function getPlantState(plant: Plant, gardenId: string) {
  const now = Date.now();
  const carePeriodMs = plant.care_frequency_multiplier *
    (plant.care_frequency_unit === 'weeks' ? 7 : 1) * 24 * 3600000;

  const tendingRatio = (now - plant.last_cared_for) / carePeriodMs;
  const tendingUrgency = tendingRatio > 3 ? 'severe' : tendingRatio > 1 ? 'mild' : 'healthy';

  const waterings = SharedGardenDatabase.getWateringsForPlant(gardenId, plant.id);
  const lastWatering = waterings[0]?.datetime ?? 0;
  const wateringRatio = lastWatering ? (now - lastWatering) / carePeriodMs : 2;
  const wateringUrgency = wateringRatio > 3 ? 'severe' : wateringRatio > 1 ? 'mild' : 'healthy';

  const sunlights = SharedGardenDatabase.getSunlightForPlant(gardenId, plant.id);
  const lastSunlight = sunlights[0]?.datetime ?? 0;
  const sunlightRatio = lastSunlight ? (now - lastSunlight) / carePeriodMs : 2;
  const sunlightUrgency = sunlightRatio > 3 ? 'severe' : sunlightRatio > 1 ? 'mild' : 'healthy';

  const fruits = SharedGardenDatabase.getFruitsForPlant(gardenId, plant.id);
  const hasFruit = fruits.some(f => (now - f.datetime) < 30 * 24 * 3600000);

  return { tendingUrgency, wateringUrgency, sunlightUrgency, hasFruit };
}

function getUrgencyColor(plant: Plant): string {
  const now = Date.now();
  const carePeriodMs = plant.care_frequency_multiplier *
    (plant.care_frequency_unit === 'weeks' ? 7 : 1) * 24 * 3600000;
  const ratio = (now - plant.last_cared_for) / carePeriodMs;
  if (ratio > 3) return 'text-red-600';
  if (ratio > 1) return 'text-amber-600';
  return 'text-green-600';
}

function getUrgency(plant: Plant): number {
  const now = Date.now();
  const carePeriodMs = plant.care_frequency_multiplier *
    (plant.care_frequency_unit === 'weeks' ? 7 : 1) * 24 * 3600000;
  return (now - plant.last_cared_for) / carePeriodMs;
}

// ─── Members panel ────────────────────────────────────────────────────────────

interface MembersPanelProps {
  gardenId: string;
  ref_: SharedGardenRef;
  user: ReturnType<typeof getUser>;
  onClose: () => void;
  onInvite: () => void;
  onMemberRemoved: () => void;
  onLeft: () => void;
  onRestored: () => void;
}

const MembersPanel: React.FC<MembersPanelProps> = ({ gardenId, ref_, user, onClose, onInvite, onMemberRemoved, onLeft, onRestored }) => {
  const { t } = useTranslation('garden_shared');
  const members = SharedGardenDatabase.getMembers(gardenId);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [showRestoreWarning, setShowRestoreWarning] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateSnapshot = async () => {
    setShowBackupMenu(false);
    try {
      const privKey = localStorage.getItem(`shared_garden_key_${gardenId}`);
      if (!privKey) return;
      const blob = await exportEncryptedSnapshot(gardenId, ref_.gardenName, ref_.gardenPublicKeyBase64);
      downloadSnapshotBlob(blob, ref_.gardenName);
    } catch {
      // silently fail — could add toast
    }
  };

  const handleRestoreClick = () => {
    setShowBackupMenu(false);
    setShowRestoreWarning(true);
  };

  const handleRestoreConfirm = () => {
    setShowRestoreWarning(false);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const privKey = localStorage.getItem(`shared_garden_key_${gardenId}`);
      if (!privKey) throw new Error('No garden key');
      const { snapshot } = await decryptSnapshotFile(file, privKey);
      SharedGardenDatabase.clearGarden(gardenId);
      SharedGardenDatabase.applySnapshot(gardenId, snapshot);
      markGardenRestored(gardenId);
      onRestored();
    } catch {
      setRestoreError(t('restoreError'));
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async (targetUuid: string, targetName: string) => {
    if (!user) return;
    if (!window.confirm(`Remove ${targetName} from the garden?`)) return;
    setRemoving(targetUuid);
    const myDisplayName = SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? 'Unknown';
    await removeMemberFromGarden(gardenId, targetUuid, user.userId, myDisplayName, user);
    setRemoving(null);
    onMemberRemoved();
  };

  const handleLeave = async () => {
    if (!user) return;
    setLeaving(true);
    setLeaveError(null);
    const result = await leaveSharedGarden(gardenId, user);
    if (result.ok) {
      onLeft();
    } else {
      setLeaving(false);
      setLeaveError(result.error === 'offline' ? t('leaveGardenErrorOffline') : t('leaveGardenErrorServer'));
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{t('gardeners')}</h2>
            <button
              onClick={() => setShowBackupMenu(s => !s)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title={t('backup.title')}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {showBackupMenu && (
          <div className="px-4 pt-3 pb-2 border-b border-gray-100 space-y-1">
            <button
              onClick={handleCreateSnapshot}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileDown className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{t('backup.createSnapshot')}</div>
                <div className="text-xs text-gray-500">{t('backup.createSnapshotDesc')}</div>
              </div>
            </button>
            <button
              onClick={handleRestoreClick}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <FileUp className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{t('backup.restoreSnapshot')}</div>
                <div className="text-xs text-gray-500">{t('backup.restoreSnapshotDesc')}</div>
              </div>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">{member.display_name}</p>
                <p className="text-xs text-gray-500">{t('joinedTime', { time: dayjs(member.joined_at).fromNow() })}</p>
              </div>
              {member.user_uuid === user?.userId ? (
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  disabled={leaving}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  title={t('leaveGarden')}
                >
                  {leaving
                    ? <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    : <UserMinus className="w-4 h-4" />
                  }
                </button>
              ) : (
                <button
                  onClick={() => handleRemove(member.user_uuid, member.display_name)}
                  disabled={removing === member.user_uuid}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove gardener"
                >
                  {removing === member.user_uuid
                    ? <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    : <UserMinus className="w-4 h-4" />
                  }
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 space-y-2">
          <button
            onClick={() => downloadGardenKeyFile(gardenId)}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            {t('downloadGardenKey')}
          </button>
          <button
            onClick={onInvite}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('inviteGardener')}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".gardenbackup"
        className="hidden"
        onChange={handleFileSelected}
      />

      {showRestoreWarning && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-60 z-[60]" />
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">{t('backup.restoreWarningTitle')}</h3>
                  <p className="text-sm text-gray-600">{t('backup.restoreWarningBody')}</p>
                </div>
              </div>
              {restoreError && (
                <p className="text-sm text-red-600 mb-3">{restoreError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowRestoreWarning(false)}
                  disabled={restoring}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  {t('backup.restoreCancel')}
                </button>
                <button
                  onClick={handleRestoreConfirm}
                  disabled={restoring}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-60"
                >
                  {restoring ? t('backup.restoring') : t('backup.restoreConfirm')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showLeaveConfirm && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-60 z-[60]" />
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">{t('leaveGardenConfirmTitle')}</h3>
                  <p className="text-sm text-gray-600">{t('leaveGardenConfirmBody')}</p>
                </div>
              </div>
              {leaveError && (
                <p className="text-sm text-red-600 mb-3">{leaveError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowLeaveConfirm(false); setLeaveError(null); }}
                  disabled={leaving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  {t('leaveGardenCancel')}
                </button>
                <button
                  onClick={handleLeave}
                  disabled={leaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-60"
                >
                  {leaving ? t('leaveGardenLeaving') : t('leaveGardenConfirm')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// ─── Bulk sunlight panel ──────────────────────────────────────────────────────

interface BulkSunlightPanelProps {
  gardenId: string;
  plants: Plant[];
  user: ReturnType<typeof getUser>;
  onClose: () => void;
  onDone: () => void;
}

const BulkSunlightPanel: React.FC<BulkSunlightPanelProps> = ({ gardenId, plants, user, onClose, onDone }) => {
  const { t } = useTranslation('garden_shared');
  const [topic, setTopic] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = plants.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!topic.trim() || selectedIds.size === 0 || !user) return;
    setSaving(true);
    const myDisplayName = SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? 'Unknown';
    const now = Date.now();
    for (const plantId of selectedIds) {
      SharedGardenDatabase.addSunlight(gardenId, { plant_id: plantId, datetime: now, topic: topic.trim() }, user.userId, myDisplayName);
    }
    setSaving(false);
    onDone();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-yellow-500" />
            <h2 className="text-base font-semibold text-gray-900">Sunlight</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
            rows={3}
            placeholder={t('prayerTopicPlaceholder')}
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder={t('filterPlantsPlaceholder')}
            />
          </div>
          <div className="border border-gray-200 rounded-xl max-h-64 overflow-y-auto divide-y divide-gray-100">
            {filtered.map(plant => (
              <button
                key={plant.id}
                onClick={() => toggle(plant.id)}
                className={`w-full p-3 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors ${selectedIds.has(plant.id) ? 'bg-yellow-50' : ''}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selectedIds.has(plant.id) ? 'bg-yellow-500 border-yellow-500' : 'border-gray-300'}`}>
                  {selectedIds.has(plant.id) && <span className="text-white text-xs">✓</span>}
                </div>
                <span className="text-sm font-medium text-gray-900">{plant.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors text-sm">{t('cancel')}</button>
          <button
            onClick={handleSave}
            disabled={!topic.trim() || selectedIds.size === 0 || saving}
            className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors text-sm"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </>
  );
};

// ─── Main SharedGardenView ────────────────────────────────────────────────────

export const SharedGardenView: React.FC = () => {
  const { gardenId } = useParams<{ gardenId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('garden_shared');
  const user = getUser();
  const { toasts, success, error, removeToast } = useToast();

  const [ref_, setRef_] = useState<SharedGardenRef | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [filteredPlants, setFilteredPlants] = useState<Plant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ageFilter, setAgeFilter] = useState<AgeGroup | 'all'>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [showAllPlants, setShowAllPlants] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showBulkSunlight, setShowBulkSunlight] = useState(false);
  const [showSlidingMenu, setShowSlidingMenu] = useState(false);
  const [showActivityReport, setShowActivityReport] = useState(false);

  // Modals
  const [showAddPlant, setShowAddPlant] = useState(false);
  const [activityModal, setActivityModal] = useState<{ isOpen: boolean; plantId: string; plantName: string; type: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion' } | null>(null);
  const [editPlantModal, setEditPlantModal] = useState<{ isOpen: boolean; plant: Plant | null }>({ isOpen: false, plant: null });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; plantId: string; plantName: string } | null>(null);
  const [scheduleCareModal, setScheduleCareModal] = useState<{ isOpen: boolean; plantId: string; plantName: string } | null>(null);
  const [mapModal, setMapModal] = useState<{ isOpen: boolean; location: { lat: number; lng: number } } | null>(null);

  const loadPlants = useCallback(async () => {
    if (!gardenId) return;
    try {
      await SharedGardenDatabase.init(gardenId);
      const all = SharedGardenDatabase.getAllPlants(gardenId);
      setPlants(all);
      setFilteredPlants(all);
    } catch (err) {
      console.error('Failed to load shared garden plants:', err);
    }
  }, [gardenId]);

  const AUTO_SYNC_THRESHOLD_MS = 15 * 60 * 1000;

  useEffect(() => {
    if (!gardenId) return;
    const r = getSharedGardenRef(gardenId);
    setRef_(r);
    loadPlants().then(() => {
      const stale = !r || !r.lastSyncTs || (Date.now() - r.lastSyncTs > AUTO_SYNC_THRESHOLD_MS);
      if (stale && r && !r.disconnected && !r.restored && user) {
        runSync(r, false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gardenId, loadPlants]);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    setFilteredPlants(plants.filter(p => {
      const textMatch = !term ||
        p.name.toLowerCase().includes(term) ||
        (p.description ?? '').toLowerCase().includes(term);
      if (!textMatch) return false;
      if (ageFilter === 'all') return true;
      const ageInfo = parseAgeInfoFromPlant(p);
      const group = resolveAgeGroup(ageInfo);
      if (ageFilter === 'youth') return group === 'youth' || group === 'voting_youth';
      return group === ageFilter;
    }));
  }, [searchTerm, ageFilter, plants]);

  useEffect(() => {
    if (!gardenId || !ref_ || !user || ref_.disconnected || ref_.restored) return;
    const sharedUser: SharedImageUser = { userId: user.userId, signingPrivateKey: user.signingPrivateKey };
    syncMissingSharedImages(ref_, plants, sharedUser);
  }, [gardenId, ref_, user, plants, refreshKey]);

  const runSync = async (ref: SharedGardenRef, showSuccessToast: boolean) => {
    if (!user || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await deepSyncSharedGarden(ref, user);
      if (result.failedStep === 'fetch' && !result.ok) {
        error(t('garden_shared:toasts.syncErrorTitle', 'Sync failed'), t('garden_shared:removedFromGarden'));
        setRef_(prev => prev ? { ...prev, disconnected: true } : null);
      } else if (!result.ok) {
        if (showSuccessToast) {
          error(t('garden_shared:toasts.syncErrorTitle', 'Sync failed'), t('garden_shared:toasts.syncErrorStep', { step: result.failedStep ?? 'unknown' }));
        }
      } else {
        await loadPlants();
        setRefreshKey(k => k + 1);
        setRef_(getSharedGardenRef(gardenId ?? ''));
        if (showSuccessToast) {
          success(t('garden_shared:toasts.syncedTitle', 'Synced'), t('garden_shared:toasts.syncedDesc', 'Garden is up to date.'));
        }
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async () => {
    if (!ref_ || isSyncing) return;
    await runSync(ref_, true);
  };

  const handleAddPlant = async (plantData: Omit<Plant, 'id' | 'created_at' | 'updated_at'>) => {
    if (!gardenId || !user) return;
    await SharedGardenDatabase.init(gardenId);
    const myDisplayName = SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? 'Unknown';
    SharedGardenDatabase.addPlant(gardenId, plantData, user.userId, myDisplayName);
    await loadPlants();
    setRefreshKey(k => k + 1);
    setShowAddPlant(false);
    success('Planted', `${plantData.name} has been added to the garden.`);
    if (ref_ && !ref_.disconnected && !ref_.restored) runSync(ref_, false);
  };

  const handleTend = (plantId: string) => {
    const plant = plants.find(p => p.id === plantId);
    if (!plant) return;
    setActivityModal({ isOpen: true, plantId, plantName: plant.name, type: 'tending' });
  };

  const handleWater = (plantId: string) => {
    const plant = plants.find(p => p.id === plantId);
    if (!plant) return;
    setActivityModal({ isOpen: true, plantId, plantName: plant.name, type: 'watering' });
  };

  const handleActivitySave = async (activityData: Partial<Tending & Watering & Sunlight & Fruit & Pruning & Companion>) => {
    if (!activityModal || !gardenId || !user) return;
    await SharedGardenDatabase.init(gardenId);
    const myDisplayName = SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? 'Unknown';
    const now = (activityData as any).datetime || Date.now();
    const pid = activityModal.plantId;

    switch (activityModal.type) {
      case 'tending':
        SharedGardenDatabase.addTending(gardenId, { plant_id: pid, datetime: now, type: (activityData as Tending).type ?? '', summary: (activityData as Tending).summary ?? '' }, user.userId, myDisplayName);
        break;
      case 'watering':
        SharedGardenDatabase.addWatering(gardenId, { plant_id: pid, datetime: now, source: (activityData as Watering).source ?? '', progress_description: (activityData as Watering).progress_description ?? '' }, user.userId, myDisplayName);
        break;
      case 'sunlight':
        SharedGardenDatabase.addSunlight(gardenId, { plant_id: pid, datetime: now, topic: (activityData as Sunlight).topic ?? '' }, user.userId, myDisplayName);
        break;
      case 'fruit':
        SharedGardenDatabase.addFruit(gardenId, { plant_id: pid, datetime: now, description: (activityData as Fruit).description ?? '', basic_activity: (activityData as Fruit).basic_activity }, user.userId, myDisplayName);
        break;
      case 'pruning':
        SharedGardenDatabase.addPruning(gardenId, { plant_id: pid, datetime: now, difficulty: (activityData as Pruning).difficulty ?? '', description: (activityData as Pruning).description ?? '' }, user.userId, myDisplayName);
        break;
      case 'companion':
        SharedGardenDatabase.addCompanion(gardenId, { plant_a_id: pid, relationship_descriptor: (activityData as Companion).relationship_descriptor ?? '', plant_b_id: (activityData as Companion).plant_b_id ?? '' }, user.userId, myDisplayName);
        break;
    }

    await loadPlants();
    setRefreshKey(k => k + 1);
    setActivityModal(null);
    if (ref_ && !ref_.disconnected && !ref_.restored) runSync(ref_, false);
  };

  const handleEditSave = async (_plantId: string, updates: Partial<Plant>) => {
    if (!editPlantModal.plant || !gardenId || !user) return;
    await SharedGardenDatabase.init(gardenId);
    const myDisplayName = SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? 'Unknown';
    SharedGardenDatabase.updatePlant(gardenId, editPlantModal.plant.id, updates, user.userId, myDisplayName);
    await loadPlants();
    setRefreshKey(k => k + 1);
    setEditPlantModal({ isOpen: false, plant: null });
    success('Updated', 'Plant details saved.');
    if (ref_ && !ref_.disconnected && !ref_.restored) runSync(ref_, false);
  };

  const handleRemovePlant = async () => {
    if (!confirmModal || !gardenId || !user) return;
    await SharedGardenDatabase.init(gardenId);
    const myDisplayName = SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? 'Unknown';
    SharedGardenDatabase.removePlant(gardenId, confirmModal.plantId, user.userId, myDisplayName);
    await loadPlants();
    setRefreshKey(k => k + 1);
    setConfirmModal(null);
    if (ref_ && !ref_.disconnected && !ref_.restored) runSync(ref_, false);
  };

  const handleBulkSunlightDone = async () => {
    setShowBulkSunlight(false);
    await loadPlants();
    setRefreshKey(k => k + 1);
    if (ref_ && !ref_.disconnected && !ref_.restored) runSync(ref_, false);
  };

  const isDisconnected = ref_?.disconnected;
  const isRestored = ref_?.restored;

  if (!gardenId || !ref_) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
        <p className="text-gray-500">{t('gardenNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/shared-gardens')}
              className="text-gray-500 hover:text-gray-700 transition-colors p-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{ref_.gardenName}</h1>
              <p className="text-xs text-gray-500">{ref_.myDisplayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isDisconnected && !isRestored && (
              <button
                onClick={() => {
                  setShowSearch(s => !s);
                  if (showSearch) { setSearchTerm(''); setAgeFilter('all'); }
                  else { setShowAllPlants(true); }
                }}
                className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setShowSlidingMenu(true)}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
        {showSearch && !isDisconnected && !isRestored && (
          <div className="max-w-2xl mx-auto px-4 pb-3 space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder-gray-400"
                placeholder={t('searchPlantsPlaceholder')}
                autoFocus
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
              {(['all', 'adult', 'youth', 'junior_youth', 'child'] as const).map(group => {
                const active = ageFilter === group;
                return (
                  <button
                    key={group}
                    onClick={() => setAgeFilter(group)}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      active
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t(`ageFilter.${group}`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Disconnected banner */}
      {isDisconnected && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">{t('removedFromGarden')}</p>
              <p className="text-xs text-amber-700 mt-0.5">{t('localCopyReadOnly')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Restored banner */}
      {isRestored && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">{t('restoredBannerTitle')}</p>
              <p className="text-xs text-blue-700 mt-0.5">{t('restoredBannerBody')}</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={async () => {
                    if (!ref_ || !user) return;
                    SharedGardenDatabase.clearGarden(gardenId);
                    const result = await deepSyncSharedGarden(ref_, user);
                    if (result.ok) {
                      clearGardenRestored(gardenId);
                      setRef_(getSharedGardenRef(gardenId));
                      await loadPlants();
                      setRefreshKey(k => k + 1);
                      success(t('restoredReturnSuccess'), '');
                    } else {
                      error(t('restoredReturnError'), '');
                    }
                  }}
                  className="text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {t('restoredReturnToCurrent')}
                </button>
                <button
                  onClick={async () => {
                    if (!ref_ || !user) return;
                    const snapshot = SharedGardenDatabase.getFullSnapshot(gardenId);
                    const result = await createSharedGardenFromSnapshot(
                      `${ref_.gardenName} (restored)`,
                      ref_.myDisplayName,
                      snapshot,
                      user
                    );
                    if (result) {
                      markGardenDisconnected(gardenId);
                      clearGardenRestored(gardenId);
                      navigate(`/shared-garden/${result.gardenId}`);
                    } else {
                      error(t('restoredNewGardenError'), '');
                    }
                  }}
                  className="text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {t('restoredNewGarden')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync button */}
      {!isDisconnected && !isRestored && (
        <div className="max-w-2xl mx-auto px-4 pt-4 flex justify-end">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="text-xs text-gray-400 hover:text-green-600 transition-colors flex items-center gap-1"
          >
            <span className={isSyncing ? 'animate-spin' : ''}>↻</span>
            {isSyncing ? t('syncing') : ref_.lastSyncTs > 0 ? t('synced', { time: dayjs(ref_.lastSyncTs).fromNow() }) : t('syncNow')}
          </button>
        </div>
      )}

      {/* Plant grid */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {plants.length > 10 && !showAllPlants && !showSearch ? (
          <SharedGardenOverviewCard
            gardenId={gardenId}
            plants={plants}
            refreshKey={refreshKey}
            onShowAllPlants={() => setShowAllPlants(true)}
          />
        ) : filteredPlants.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              {searchTerm ? t('noPlantsFound') : t('gardenAwaits')}
            </h2>
            {!searchTerm && !isDisconnected && (
              <p className="text-sm text-gray-400 mb-6">{t('addFirstPlant')}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlants.map(plant => {
              const extra = plant as Plant & { authored_by_display_name?: string };
              return (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  urgency={getUrgency(plant)}
                  urgencyColor={getUrgencyColor(plant)}
                  getPlantState={(p) => getPlantState(p, gardenId)}
                  onTend={() => !isDisconnected && !isRestored && handleTend(plant.id)}
                  onWater={() => !isDisconnected && !isRestored && handleWater(plant.id)}
                  onViewDetails={() => navigate(`/shared-garden/${gardenId}/plants/${plant.id}`)}
                  onRemove={() => !isDisconnected && !isRestored && setConfirmModal({ isOpen: true, plantId: plant.id, plantName: plant.name })}
                  onShowConfirmation={(id, name) => !isDisconnected && !isRestored && setConfirmModal({ isOpen: true, plantId: id, plantName: name })}
                  onScheduleCare={(id, name) => !isDisconnected && !isRestored && setScheduleCareModal({ isOpen: true, plantId: id, plantName: name })}
                  onEditPlant={(id) => {
                    if (isDisconnected || isRestored) return;
                    const p = plants.find(pl => pl.id === id);
                    if (p) setEditPlantModal({ isOpen: true, plant: p });
                  }}
                  authorName={extra.authored_by_display_name}
                  sharedGardenRef={ref_}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Change log — full width */}
      <div className="px-4 pb-8">
        <GardenChangeLogCard
          gardenId={gardenId}
          refreshKey={refreshKey}
          onGenerateReport={() => setShowActivityReport(true)}
        />
      </div>

      {/* FAB */}
      {!isDisconnected && !isRestored && (
        <button
          onClick={() => setShowAddPlant(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 z-20"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}


      {/* Panels and modals */}
      {showSlidingMenu && (
        <SharedGardenSlidingMenu
          isOpen={showSlidingMenu}
          onClose={() => setShowSlidingMenu(false)}
          onBulkSunlight={() => setShowBulkSunlight(true)}
          onPlots={() => navigate(`/shared-garden/${gardenId}/plots`)}
          onGardeners={() => setShowMembersPanel(true)}
          isDisconnected={!!isDisconnected}
        />
      )}

      {showMembersPanel && ref_ && user && (
        <MembersPanel
          gardenId={gardenId}
          ref_={ref_}
          user={user}
          onClose={() => setShowMembersPanel(false)}
          onInvite={() => { setShowMembersPanel(false); setShowInviteModal(true); }}
          onMemberRemoved={() => { setRefreshKey(k => k + 1); success('Done', 'Gardener removed.'); }}
          onLeft={() => navigate('/shared-gardens')}
          onRestored={async () => {
            setShowMembersPanel(false);
            setRef_(getSharedGardenRef(gardenId ?? ''));
            await loadPlants();
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {showBulkSunlight && user && (
        <BulkSunlightPanel
          gardenId={gardenId}
          plants={plants}
          user={user}
          onClose={() => setShowBulkSunlight(false)}
          onDone={handleBulkSunlightDone}
        />
      )}

      {showInviteModal && ref_ && user && (
        <InviteToSharedGardenModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          gardenId={gardenId}
          gardenName={ref_.gardenName}
          user={user}
        />
      )}

      {showAddPlant && (
        <AddPlantModal
          isOpen={showAddPlant}
          onClose={() => setShowAddPlant(false)}
          onAdd={handleAddPlant}
        />
      )}

      {activityModal?.isOpen && (
        <ActivityModal
          isOpen={activityModal.isOpen}
          plantId={activityModal.plantId}
          plantName={activityModal.plantName}
          activityType={activityModal.type}
          onClose={() => setActivityModal(null)}
          onSubmit={handleActivitySave}
        />
      )}

      {editPlantModal.isOpen && editPlantModal.plant && (
        <EditPlantModal
          isOpen={editPlantModal.isOpen}
          plant={editPlantModal.plant}
          onClose={() => setEditPlantModal({ isOpen: false, plant: null })}
          onUpdate={handleEditSave}
          sharedGardenRef={ref_}
          sharedUser={user ? { userId: user.userId, signingPrivateKey: user.signingPrivateKey } : null}
        />
      )}

      {confirmModal?.isOpen && (
        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          plantId={confirmModal.plantId}
          plantName={confirmModal.plantName}
          onClose={() => setConfirmModal(null)}
          onConfirm={handleRemovePlant}
        />
      )}

      {scheduleCareModal?.isOpen && (
        <ScheduleCareModal
          isOpen={scheduleCareModal.isOpen}
          plantId={scheduleCareModal.plantId}
          plantName={scheduleCareModal.plantName}
          onClose={() => setScheduleCareModal(null)}
          onSave={async () => { setScheduleCareModal(null); await loadPlants(); }}
        />
      )}

      {mapModal?.isOpen && (
        <MapOverlay
          isOpen={mapModal.isOpen}
          location={mapModal.location}
          plantName=""
          onClose={() => setMapModal(null)}
        />
      )}

      {showActivityReport && gardenId && (
        <ActivityReportModal
          gardenId={gardenId}
          plants={plants}
          onClose={() => setShowActivityReport(false)}
        />
      )}

      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  );
};
