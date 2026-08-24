import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Calendar, Heart, Plus, MoreHorizontal,
  CreditCard as Edit, Trash2, CalendarPlus, Mail
} from 'lucide-react';
import { PhoneLink } from './PhoneLink';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isTomorrow from 'dayjs/plugin/isTomorrow';
import isYesterday from 'dayjs/plugin/isYesterday';
import {
  SharedGardenDatabase, getSharedGardenRef, type SharedGardenRef
} from '../lib/sharedGardenDatabase';
import { deepSyncSharedGarden } from '../lib/sharedGardenSyncService';
import type {
  Plant, Tending, Watering, Sunlight, Fruit, Pruning, Companion,
  Bud, Notching, Capability, ScheduledEvent
} from '../lib/database';
import { parseAgeInfoFromPlant, resolveEffectiveAge } from '../lib/harvestService';
import { ActivityModal } from './ActivityModal';
import { BranchesModal, type BranchesSubType } from './BranchesModal';
import { ConfirmationModal } from './ConfirmationModal';
import { EditPlantModal } from './EditPlantModal';
import { ScheduleCareModal } from './ScheduleCareModal';
import { ToastContainer } from './ToastContainer';
import { useToast } from '../hooks/useToast';
import { SharedPlantImageViewer } from './SharedPlantImageViewer';
import {
  getSharedImageLocally,
  downloadAndCacheSharedThumbnail,
  deleteSharedGardenImage,
  type SharedImageUser,
} from '../lib/sharedImageSync';

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isTomorrow);
dayjs.extend(isYesterday);

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

type ActivityType = 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion';

export const SharedPlantDetailView: React.FC = () => {
  const { gardenId, plantId } = useParams<{ gardenId: string; plantId: string }>();
  const navigate = useNavigate();
  const user = getUser();
  const { t } = useTranslation('garden');
  const { toasts, success, error, removeToast } = useToast();

  const getActivityConfig = (type: ActivityType) => ({
    tending: { title: t('activityTending'), color: 'text-green-600', bgColor: 'bg-green-50', emptyMessage: t('emptyTending') },
    watering: { title: t('activityWatering'), color: 'text-blue-600', bgColor: 'bg-blue-50', emptyMessage: t('emptyWatering') },
    sunlight: { title: t('activitySunlight'), color: 'text-yellow-600', bgColor: 'bg-yellow-50', emptyMessage: t('emptySunlight') },
    fruit: { title: t('activityFruit'), color: 'text-red-600', bgColor: 'bg-red-50', emptyMessage: t('emptyFruit') },
    pruning: { title: t('activityPruning'), color: 'text-orange-600', bgColor: 'bg-orange-50', emptyMessage: t('emptyPruning') },
    companion: { title: t('activityCompanion'), color: 'text-teal-600', bgColor: 'bg-teal-50', emptyMessage: t('emptyCompanion') },
  })[type];

  const [ref_, setRef_] = useState<SharedGardenRef | null>(null);
  const [plant, setPlant] = useState<Plant | null>(null);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>([]);
  const [activities, setActivities] = useState<Record<ActivityType, any[]>>({
    tending: [], watering: [], sunlight: [], fruit: [], pruning: [], companion: []
  });
  const [branchesData, setBranchesData] = useState<{
    buds: Bud[]; notchings: Notching[]; capabilities: Capability[];
  }>({ buds: [], notchings: [], capabilities: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [plantState, setPlantState] = useState<{
    growthStage: string; hasFruit: boolean;
    tendingUrgency: 'healthy' | 'mild' | 'severe';
    wateringUrgency: 'healthy' | 'mild' | 'severe';
    sunlightUrgency: 'healthy' | 'mild' | 'severe';
  } | null>(null);

  const [activityModal, setActivityModal] = useState<{
    isOpen: boolean; type: ActivityType; editingItem?: any;
  }>({ isOpen: false, type: 'tending' });
  const [branchesModal, setBranchesModal] = useState<{
    isOpen: boolean; subType: BranchesSubType; editingItem?: any;
  }>({ isOpen: false, subType: 'bud' });
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean; onConfirm: () => void; title: string; message: string;
  }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });
  const [editPlantModal, setEditPlantModal] = useState<{
    isOpen: boolean; plant: Plant | null;
  }>({ isOpen: false, plant: null });
  const [scheduleCareModal, setScheduleCareModal] = useState<{
    isOpen: boolean; plantName: string;
  }>({ isOpen: false, plantName: '' });
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [plantImage, setPlantImage] = useState<string | null>(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [imageRefreshKey, setImageRefreshKey] = useState(0);

  const getActorInfo = useCallback(() => {
    if (!gardenId || !user) return { uuid: '', displayName: 'Unknown' };
    const member = SharedGardenDatabase.getMember(gardenId, user.userId);
    return { uuid: user.userId, displayName: member?.display_name ?? 'Unknown' };
  }, [gardenId, user]);

  const loadData = useCallback(async () => {
    if (!gardenId || !plantId) return;
    setIsLoading(true);
    try {
      await SharedGardenDatabase.init(gardenId);
      const p = SharedGardenDatabase.getPlant(gardenId, plantId);
      if (!p) { navigate(`/shared-garden/${gardenId}`); return; }
      setPlant(p);
      setAllPlants(SharedGardenDatabase.getAllPlants(gardenId));
      setScheduledEvents(SharedGardenDatabase.getScheduledEventsForPlant(gardenId, plantId));
      setActivities({
        tending: SharedGardenDatabase.getTendingsForPlant(gardenId, plantId),
        watering: SharedGardenDatabase.getWateringsForPlant(gardenId, plantId),
        sunlight: SharedGardenDatabase.getSunlightForPlant(gardenId, plantId),
        fruit: SharedGardenDatabase.getFruitsForPlant(gardenId, plantId),
        pruning: SharedGardenDatabase.getPruningsForPlant(gardenId, plantId),
        companion: SharedGardenDatabase.getCompanionsForPlant(gardenId, plantId),
      });
      setBranchesData({
        buds: SharedGardenDatabase.getBudsForPlant(gardenId, plantId),
        notchings: SharedGardenDatabase.getNotchingsForPlant(gardenId, plantId),
        capabilities: SharedGardenDatabase.getCapabilitiesForPlant(gardenId, plantId),
      });
    } finally {
      setIsLoading(false);
    }
  }, [gardenId, plantId, navigate]);

  useEffect(() => {
    const r = gardenId ? getSharedGardenRef(gardenId) : null;
    setRef_(r);
    loadData();
  }, [gardenId, plantId, loadData]);

  useEffect(() => {
    if (!gardenId || !plantId || !ref_ || !user) return;
    const cached = getSharedImageLocally(gardenId, plantId);
    if (cached) {
      setPlantImage(cached);
    } else {
      setPlantImage(null);
      const sharedUser: SharedImageUser = { userId: user.userId, signingPrivateKey: user.signingPrivateKey };
      downloadAndCacheSharedThumbnail(ref_, plantId, sharedUser).then((dataUrl) => {
        if (dataUrl) setPlantImage(dataUrl);
      });
    }
  }, [gardenId, plantId, ref_, user, imageRefreshKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.gardenId === gardenId && detail?.plantId === plantId) {
        const cached = getSharedImageLocally(gardenId!, plantId!);
        setPlantImage(cached);
      }
    };
    window.addEventListener('shared-plant-image-synced', handler);
    return () => window.removeEventListener('shared-plant-image-synced', handler);
  }, [gardenId, plantId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  useEffect(() => {
    if (!plant || !gardenId) return;
    const now = Date.now();
    const careMs = plant.care_frequency_multiplier *
      (plant.care_frequency_unit === 'weeks' ? 7 : 1) * 24 * 3600000;
    const calc = (last: number | null): 'healthy' | 'mild' | 'severe' => {
      if (!last) return 'severe';
      const ratio = (now - last) / careMs;
      return ratio <= 1 ? 'healthy' : ratio <= 3 ? 'mild' : 'severe';
    };
    const daysSince = Math.floor((now - plant.created_at) / 86400000);
    const growthStage = daysSince >= 90 ? 'bush' : daysSince >= 7 ? 'shoot' : 'seed';
    const fruits = SharedGardenDatabase.getFruitsForPlant(gardenId, plant.id);
    const hasFruit = fruits.some(f => now - f.datetime < 30 * 86400000);
    const latestTending = activities.tending[0]?.datetime ?? null;
    const latestWatering = activities.watering[0]?.datetime ?? null;
    const latestSunlight = activities.sunlight[0]?.datetime ?? null;
    setPlantState({
      growthStage, hasFruit,
      tendingUrgency: calc(latestTending),
      wateringUrgency: calc(latestWatering),
      sunlightUrgency: calc(latestSunlight),
    });
  }, [plant, activities, gardenId]);

  const isDisconnected = ref_?.disconnected;

  const triggerSync = () => {
    if (!ref_ || !user) return;
    deepSyncSharedGarden(ref_, user).catch(() => {});
  };

  const formatRelativeTime = (ts: number) => {
    const d = dayjs(ts);
    if (d.isToday()) return t('today', { ns: 'common' });
    if (d.isYesterday()) return t('yesterday', { ns: 'common' });
    return d.fromNow();
  };

  const formatScheduledTime = (ts: number) => {
    const d = dayjs(ts);
    const now = dayjs();
    if (d.isToday()) return t('today', { ns: 'common' });
    if (d.isTomorrow()) return t('tomorrow', { ns: 'common' });
    if (d.isBefore(now, 'day')) {
      const diff = now.diff(d, 'day');
      return t('daysOverdue', { ns: 'common', count: diff });
    }
    const diff = d.diff(now, 'day');
    return t('inDays', { ns: 'common', count: diff });
  };

  const getPlantDisplay = () => {
    if (!plantState || !plant) return { svgPath: '/up_to_2_days.svg', overlayClass: '' };
    const now = Date.now();
    const daysSince = Math.floor((now - plant.created_at) / 86400000);
    let svgPath = '/up_to_2_days.svg';
    if (daysSince <= 2) svgPath = '/up_to_2_days.svg';
    else if (daysSince <= 7) svgPath = '/up_to_7_days.svg';
    else if (daysSince <= 21) svgPath = '/up_to_21_days.svg';
    else if (daysSince <= 600) svgPath = plantState.hasFruit ? '/up_to_600_days_with_fruit.svg' : '/up_to_600_days.svg';
    else svgPath = plantState.hasFruit ? '/over_600_days_with_fruit.svg' : '/over_600_days.svg';
    let overlayClass = '';
    if (plantState.tendingUrgency === 'severe') overlayClass = 'dirt-severe';
    else if (plantState.tendingUrgency === 'mild') overlayClass = 'dirt-mild';
    else if (plantState.wateringUrgency === 'severe') overlayClass = 'brown-severe';
    else if (plantState.wateringUrgency === 'mild') overlayClass = 'brown-mild';
    else if (plantState.sunlightUrgency === 'severe') overlayClass = 'yellow-severe';
    else if (plantState.sunlightUrgency === 'mild') overlayClass = 'yellow-mild';
    return { svgPath, overlayClass };
  };

  const getUpcomingCareDescription = () => {
    if (!plant) return null;
    const relevant = scheduledEvents.filter(e => e.scheduled_date > plant.last_cared_for);
    if (!relevant.length) return null;
    return relevant.sort((a, b) => b.scheduled_date - a.scheduled_date)[0].description;
  };

  // ─── Activity handlers ─────────────────────────────────────────────────────

  const handleActivitySubmit = async (data: any) => {
    if (!gardenId || !plantId) return;
    const { uuid, displayName } = getActorInfo();
    try {
      if (activityModal.editingItem) {
        const id = activityModal.editingItem.id;
        switch (activityModal.type) {
          case 'tending':
            SharedGardenDatabase.updateTending(gardenId, id, { type: data.type, summary: data.summary || '' }, uuid, displayName);
            break;
          case 'watering':
            SharedGardenDatabase.updateWatering(gardenId, id, { source: data.source, progress_description: data.progress_description || '' }, uuid, displayName);
            break;
          case 'sunlight':
            SharedGardenDatabase.updateSunlight(gardenId, id, { topic: data.topic }, uuid, displayName);
            break;
          case 'fruit':
            SharedGardenDatabase.updateFruit(gardenId, id, { description: data.description, basic_activity: data.basic_activity || undefined }, uuid, displayName);
            break;
          case 'pruning':
            SharedGardenDatabase.updatePruning(gardenId, id, { difficulty: data.difficulty, description: data.description || '' }, uuid, displayName);
            break;
          case 'companion':
            SharedGardenDatabase.updateTending(gardenId, id, {}, uuid, displayName); // companion has no update method; treat as no-op
            break;
        }
        success('Updated', `${getActivityConfig(activityModal.type).title} has been updated`);
      } else {
        const ts = data.datetime || Date.now();
        switch (activityModal.type) {
          case 'tending':
            SharedGardenDatabase.addTending(gardenId, { plant_id: plantId, datetime: ts, type: data.type, summary: data.summary || '' }, uuid, displayName);
            break;
          case 'watering':
            SharedGardenDatabase.addWatering(gardenId, { plant_id: plantId, datetime: ts, source: data.source, progress_description: data.progress_description || '' }, uuid, displayName);
            break;
          case 'sunlight':
            SharedGardenDatabase.addSunlight(gardenId, { plant_id: plantId, datetime: ts, topic: data.topic }, uuid, displayName);
            break;
          case 'fruit':
            SharedGardenDatabase.addFruit(gardenId, { plant_id: plantId, datetime: ts, description: data.description, basic_activity: data.basic_activity || undefined }, uuid, displayName);
            break;
          case 'pruning':
            SharedGardenDatabase.addPruning(gardenId, { plant_id: plantId, datetime: ts, difficulty: data.difficulty, description: data.description || '' }, uuid, displayName);
            break;
          case 'companion':
            SharedGardenDatabase.addCompanion(gardenId, { plant_a_id: plantId, relationship_descriptor: data.relationship_descriptor, plant_b_id: data.plant_b_id }, uuid, displayName);
            break;
        }
        success('Recorded', `${getActivityConfig(activityModal.type).title} has been recorded`);
      }
      await loadData();
      triggerSync();
    } catch (err) {
      console.error('Failed to save activity:', err);
      error('Failed to save', 'Please try again');
    }
  };

  const handleDeleteActivity = (type: ActivityType, item: any) => {
    setConfirmationModal({
      isOpen: true,
      title: `Delete ${getActivityConfig(type).title}`,
      message: `Are you sure you want to delete this ${type} activity? This action cannot be undone.`,
      onConfirm: async () => {
        if (!gardenId) return;
        const { uuid, displayName } = getActorInfo();
        switch (type) {
          case 'tending': SharedGardenDatabase.deleteTending(gardenId, item.id, uuid, displayName); break;
          case 'watering': SharedGardenDatabase.deleteWatering(gardenId, item.id, uuid, displayName); break;
          case 'sunlight': SharedGardenDatabase.deleteSunlight(gardenId, item.id, uuid, displayName); break;
          case 'fruit': SharedGardenDatabase.deleteFruit(gardenId, item.id, uuid, displayName); break;
          case 'pruning': SharedGardenDatabase.deletePruning(gardenId, item.id, uuid, displayName); break;
          case 'companion': SharedGardenDatabase.deleteCompanion(gardenId, item.id, uuid, displayName); break;
        }
        success('Deleted', `${getActivityConfig(type).title} removed`);
        await loadData();
        triggerSync();
      }
    });
  };

  // ─── Branches handlers ────────────────────────────────────────────────────

  const handleBranchesSubmit = async (subType: BranchesSubType, data: any) => {
    if (!gardenId || !plantId) return;
    const { uuid, displayName } = getActorInfo();
    if (branchesModal.editingItem) {
      const id = branchesModal.editingItem.id;
      if (subType === 'bud') SharedGardenDatabase.updateBud(gardenId, id, { text: data.text }, uuid, displayName);
      else if (subType === 'notching') SharedGardenDatabase.updateNotching(gardenId, id, data, uuid, displayName);
      else if (subType === 'capability') SharedGardenDatabase.updateCapability(gardenId, id, { text: data.text }, uuid, displayName);
    } else {
      const now = Date.now();
      if (subType === 'bud') SharedGardenDatabase.addBud(gardenId, { plant_id: plantId, text: data.text, created_at: now }, uuid, displayName);
      else if (subType === 'notching') SharedGardenDatabase.addNotching(gardenId, { plant_id: plantId, ...data }, uuid, displayName);
      else if (subType === 'capability') SharedGardenDatabase.addCapability(gardenId, { plant_id: plantId, text: data.text, created_at: now }, uuid, displayName);
    }
    await loadData();
    triggerSync();
  };

  const handleDeleteBranchItem = (subType: BranchesSubType, item: any) => {
    const labels: Record<BranchesSubType, string> = { bud: 'Bud', notching: 'Notching', capability: 'Capacity' };
    setConfirmationModal({
      isOpen: true,
      title: `Delete ${labels[subType]}`,
      message: `Are you sure you want to delete this ${labels[subType].toLowerCase()}? This cannot be undone.`,
      onConfirm: async () => {
        if (!gardenId) return;
        const { uuid, displayName } = getActorInfo();
        if (subType === 'bud') SharedGardenDatabase.deleteBud(gardenId, item.id, uuid, displayName);
        else if (subType === 'notching') SharedGardenDatabase.deleteNotching(gardenId, item.id, uuid, displayName);
        else if (subType === 'capability') SharedGardenDatabase.deleteCapability(gardenId, item.id, uuid, displayName);
        await loadData();
        triggerSync();
      }
    });
  };

  // ─── Plant management ─────────────────────────────────────────────────────

  const handleUpdatePlant = async (_pid: string, updates: {
    name: string; phone?: string; description?: string;
    care_frequency_multiplier: number; care_frequency_unit: 'days' | 'weeks'; additional_info?: string;
  }) => {
    if (!gardenId || !plantId) return;
    const { uuid, displayName } = getActorInfo();
    SharedGardenDatabase.updatePlant(gardenId, plantId, updates, uuid, displayName);
    await loadData();
    setImageRefreshKey(k => k + 1);
    triggerSync();
    success('Updated', 'Plant details saved');
  };

  const handleRemovePlant = () => {
    if (!plant) return;
    setShowMenu(false);
    setConfirmationModal({
      isOpen: true,
      title: 'Remove plant',
      message: `Are you sure you want to remove ${plant.name}? This cannot be undone.`,
      onConfirm: async () => {
        if (!gardenId) return;
        const { uuid, displayName } = getActorInfo();
        SharedGardenDatabase.removePlant(gardenId, plant.id, uuid, displayName);
        triggerSync();
        navigate(`/shared-garden/${gardenId}`);
      }
    });
  };

  const handleScheduleSubmit = async (data: { scheduledDate: number; description?: string }) => {
    if (!plant || !gardenId) return;
    SharedGardenDatabase.addScheduledEvent(gardenId, {
      plant_id: plant.id, event_type: 'tending',
      scheduled_date: data.scheduledDate, description: data.description
    });
    await loadData();
    triggerSync();
    success('Scheduled', `Reminder set for ${plant.name}`);
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderActivitySection = (type: ActivityType) => {
    const config = getActivityConfig(type);
    const items = activities[type];
    const hasItems = items.length > 0;
    const displayItems = type === 'companion' ? items.slice(0, 10) : items.slice(0, 1);
    const showSeeMore = type === 'companion' ? items.length > 10 : items.length > 1;

    return (
      <div key={type} className={`bg-white rounded-xl border border-gray-100 p-6${type === 'sunlight' ? ' md:col-span-2' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-base font-semibold ${config.color}`}>{config.title}</h3>
          {!isDisconnected && (
            <button
              onClick={() => setActivityModal({ isOpen: true, type, editingItem: undefined })}
              className={`p-2 ${config.bgColor} hover:opacity-80 rounded-lg transition-colors`}
            >
              <Plus className={`w-4 h-4 ${config.color}`} />
            </button>
          )}
        </div>

        {!hasItems ? (
          <p className="text-sm text-gray-500 italic leading-relaxed">{config.emptyMessage}</p>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item: any) => (
              <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {type !== 'companion' && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{formatRelativeTime(item.datetime)}</span>
                        {item.authored_by_display_name && (
                          <span className="text-xs text-gray-400">{t('authoredBy', { name: item.authored_by_display_name })}</span>
                        )}
                      </div>
                    )}
                    <div className="text-sm text-gray-600">
                      {type === 'tending' && <span>{item.type}: {item.summary || t('noSummary')}</span>}
                      {type === 'watering' && <span>{item.source}: {item.progress_description || t('noDescription')}</span>}
                      {type === 'sunlight' && <span>{item.topic}</span>}
                      {type === 'fruit' && (
                        <>
                          {item.basic_activity && <span className="block font-medium text-amber-700 capitalize mb-0.5">{item.basic_activity}</span>}
                          <span>{item.description}</span>
                        </>
                      )}
                      {type === 'pruning' && <span>{item.description || t('noDescription')}</span>}
                      {type === 'companion' && (
                        <span>
                          {t('companionWith', { descriptor: item.relationship_descriptor, name: allPlants.find(p => p.id === (item.plant_b_id === plantId ? item.plant_a_id : item.plant_b_id))?.name || t('unknownPlant') })}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isDisconnected && (
                    <div className="flex items-center gap-1 ml-2">
                      {type !== 'companion' && (
                        <button
                          onClick={() => setActivityModal({ isOpen: true, type, editingItem: item })}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteActivity(type, item)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {showSeeMore && (
              <p className={`text-xs ${config.color} text-center pt-1`}>
                {t('moreCount', { count: items.length - displayItems.length })}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderBranchesCard = () => {
    const { buds, notchings, capabilities } = branchesData;
    const hasAny = buds.length > 0 || notchings.length > 0 || capabilities.length > 0;

    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
            <span className="text-xl">🌿</span>
          </div>
          <h3 className="text-lg font-semibold text-amber-700">{t('branchesTitle')}</h3>
        </div>

        {!hasAny && (
          <p className="text-sm text-gray-500 italic leading-relaxed mb-4">
            {t('branchesEmpty')}
          </p>
        )}

        {/* Buds */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">{t('budsSectionLabel')}</span>
            {!isDisconnected && (
              <button onClick={() => setBranchesModal({ isOpen: true, subType: 'bud' })} className="p-1 bg-amber-50 rounded-lg">
                <Plus className="w-3.5 h-3.5 text-amber-600" />
              </button>
            )}
          </div>
          {buds.length === 0 && <p className="text-xs text-gray-400 italic">{t('budsEmpty')}</p>}
          {buds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {buds.map(bud => (
                <div key={bud.id} className="group flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                  <span>{bud.text}</span>
                  {!isDisconnected && (
                    <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                      <button onClick={() => setBranchesModal({ isOpen: true, subType: 'bud', editingItem: bud })} className="text-amber-600 hover:text-amber-800">
                        <Edit className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDeleteBranchItem('bud', bud)} className="text-amber-600 hover:text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notchings */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{t('notchingSectionLabel')}</span>
            {!isDisconnected && (
              <button onClick={() => setBranchesModal({ isOpen: true, subType: 'notching' })} className="p-1 bg-amber-50 rounded-lg">
                <Plus className="w-3.5 h-3.5 text-amber-700" />
              </button>
            )}
          </div>
          {notchings.length === 0 && <p className="text-xs text-gray-400 italic">{t('notchingEmpty')}</p>}
          {notchings.slice(0, 1).map(n => (
            <div key={n.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-0.5">
                  {formatRelativeTime(n.datetime)}
                  {(n as any).authored_by_display_name && <span className="ml-1">{t('authoredBy', { name: (n as any).authored_by_display_name })}</span>}
                </div>
                <div className="text-sm font-medium text-gray-800">
                  {n.book.replace('ruhi_', 'Ruhi Book ').replace(/_/g, ' ')} &mdash; U{n.start_unit}S{n.start_section} to U{n.end_unit}S{n.end_section}
                </div>
                <div className="text-xs text-amber-600 mt-0.5">{t('aboutSections', { count: n.sections_studied })}</div>
                {n.progress_description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{n.progress_description}</div>}
              </div>
              {!isDisconnected && (
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => setBranchesModal({ isOpen: true, subType: 'notching', editingItem: n })} className="p-1 text-gray-400 hover:text-gray-600">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteBranchItem('notching', n)} className="p-1 text-gray-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {notchings.length > 1 && (
            <p className="text-xs text-amber-700 text-center pt-2">{t('moreCount', { count: notchings.length - 1 })}</p>
          )}
        </div>

        {/* Capabilities */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">{t('flowersSectionLabel')}</span>
            {!isDisconnected && (
              <button onClick={() => setBranchesModal({ isOpen: true, subType: 'capability' })} className="p-1 bg-emerald-50 rounded-lg">
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            )}
          </div>
          {capabilities.length === 0 && <p className="text-xs text-gray-400 italic">{t('flowersEmpty')}</p>}
          {capabilities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {capabilities.map(cap => (
                <div key={cap.id} className="group flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">
                  <span>{cap.text}</span>
                  {!isDisconnected && (
                    <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                      <button onClick={() => setBranchesModal({ isOpen: true, subType: 'capability', editingItem: cap })} className="text-emerald-600 hover:text-emerald-800">
                        <Edit className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDeleteBranchItem('capability', cap)} className="text-emerald-600 hover:text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!plant) return null;

  const { svgPath, overlayClass } = getPlantDisplay();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate(`/shared-garden/${gardenId}`)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mt-1 flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="relative flex-shrink-0 mt-1">
                {plantState && (
                  <>
                    <img src={svgPath} alt="Plant growth stage" className="w-12 h-12 transition-all duration-300" />
                    {overlayClass && (
                      <div className={`absolute inset-0 w-12 h-12 pointer-events-none transition-opacity duration-300 ${overlayClass}`} />
                    )}
                  </>
                )}
              </div>
              {plantImage && (
                <div
                  className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:border-green-400 cursor-pointer transition-colors duration-200 flex-shrink-0 mt-1"
                  onClick={(e) => { e.stopPropagation(); setShowImageViewer(true); }}
                >
                  <img src={plantImage} alt={plant.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{plant.name}</h1>
                  {(() => {
                    const ageInfo = parseAgeInfoFromPlant(plant);
                    if (!ageInfo || ageInfo.is_over_21) return null;
                    const age = resolveEffectiveAge(ageInfo);
                    if (age >= 21) return null;
                    return (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                        {t('ageYears', { age })}
                      </span>
                    );
                  })()}
                  {ref_ && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{ref_.gardenName}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-0.5">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-600">{t('nextCare', { time: formatScheduledTime(plant.next_scheduled_care) })}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Heart className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-600">{t('lastCared', { time: formatRelativeTime(plant.last_cared_for) })}</span>
                  </div>
                </div>
                {getUpcomingCareDescription() && (
                  <span className="text-sm text-gray-800">{getUpcomingCareDescription()}</span>
                )}
                {(plant.email || plant.phone) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
                    {plant.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{plant.email}</span>
                      </div>
                    )}
                    {plant.phone && (
                      <PhoneLink phone={plant.phone} />
                    )}
                  </div>
                )}
                {plant.description && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-700 leading-relaxed">{plant.description}</p>
                  </div>
                )}
              </div>
            </div>

            {!isDisconnected && (
              <div className="relative flex-shrink-0" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[160px] z-10">
                    <button
                      onClick={() => { setShowMenu(false); setScheduleCareModal({ isOpen: true, plantName: plant.name }); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      {t('scheduleCarBtn')}
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setEditPlantModal({ isOpen: true, plant }); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      {t('changeBtn')}
                    </button>
                    <button
                      onClick={handleRemovePlant}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('removePlantBtn')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid gap-6 md:grid-cols-2">
          {renderActivitySection('sunlight')}
          {(['tending', 'watering'] as const).map(t => renderActivitySection(t))}
          {renderBranchesCard()}
          {(['fruit', 'pruning', 'companion'] as const).map(t => renderActivitySection(t))}
        </div>
      </main>

      {/* Modals */}
      <ActivityModal
        isOpen={activityModal.isOpen}
        onClose={() => setActivityModal(prev => ({ ...prev, isOpen: false }))}
        plantName={plant.name}
        plantId={plant.id}
        activityType={activityModal.type}
        editingItem={activityModal.editingItem}
        allPlants={allPlants}
        onSubmit={handleActivitySubmit}
      />

      <BranchesModal
        isOpen={branchesModal.isOpen}
        onClose={() => setBranchesModal(prev => ({ ...prev, isOpen: false }))}
        subType={branchesModal.subType}
        plantName={plant.name}
        plantId={plant.id}
        editingItem={branchesModal.editingItem}
        lastNotching={branchesData.notchings[0]}
        onSubmit={handleBranchesSubmit}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={t('deleteBtn')}
        cancelText={t('cancelBtn')}
        type="danger"
      />

      <EditPlantModal
        isOpen={editPlantModal.isOpen}
        onClose={() => setEditPlantModal({ isOpen: false, plant: null })}
        plant={editPlantModal.plant}
        onUpdate={handleUpdatePlant}
        sharedGardenRef={ref_}
        sharedUser={user ? { userId: user.userId, signingPrivateKey: user.signingPrivateKey } : null}
      />

      <ScheduleCareModal
        isOpen={scheduleCareModal.isOpen}
        onClose={() => setScheduleCareModal(prev => ({ ...prev, isOpen: false }))}
        plantName={scheduleCareModal.plantName}
        onSchedule={handleScheduleSubmit}
      />

      {showImageViewer && plantImage && ref_ && user && (() => {
        const sharedUser: SharedImageUser = { userId: user.userId, signingPrivateKey: user.signingPrivateKey };
        return (
          <SharedPlantImageViewer
            thumbnailUrl={plantImage}
            ref_={ref_}
            plantId={plant.id}
            user={sharedUser}
            onClose={() => setShowImageViewer(false)}
            onDelete={!isDisconnected ? async () => {
              await deleteSharedGardenImage(ref_, plant.id, sharedUser);
              setPlantImage(null);
              setShowImageViewer(false);
              setImageRefreshKey(k => k + 1);
            } : undefined}
          />
        );
      })()}

      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  );
};
