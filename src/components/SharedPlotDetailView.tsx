import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, Trash2, CreditCard as Edit, Plus } from 'lucide-react';
import { SharedGardenDatabase, getSharedGardenRef } from '../lib/sharedGardenDatabase';
import { syncSharedGarden } from '../lib/sharedGardenSyncService';
import { AddEditPlotModal } from './AddEditPlotModal';
import { PhoneLink } from './PhoneLink';
import { ManageMembersModal } from './ManageMembersModal';
import { BulkActivityModal } from './BulkActivityModal';
import { BulkNotchingModal } from './BulkNotchingModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ToastContainer } from './ToastContainer';
import { useToast } from '../hooks/useToast';
import type { Plot, Plant, Tending, Watering, Sunlight, Fruit, Notching, PlotActivity } from '../lib/database';
import { parseAgeInfoFromPlant, resolveEffectiveAge } from '../lib/harvestService';
import { PlotActivityLogCard } from './PlotActivityLogCard';
import { uploadPlotActivityImage } from '../lib/plotActivityImageSync';

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const SharedPlotDetailView: React.FC = () => {
  const { gardenId, plotId } = useParams<{ gardenId: string; plotId: string }>();
  const navigate = useNavigate();
  const { toasts, success, error, removeToast } = useToast();

  const [plot, setPlot] = useState<Plot | null>(null);
  const [members, setMembers] = useState<Plant[]>([]);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkActivityModal, setBulkActivityModal] = useState<{
    isOpen: boolean;
    type: 'tending' | 'watering' | 'sunlight' | 'fruit';
  }>({ isOpen: false, type: 'tending' });
  const [showNotchingModal, setShowNotchingModal] = useState(false);
  const [lastNotching, setLastNotching] = useState<{ book: string; end_unit: number; end_section: number } | undefined>(undefined);
  const [plotActivities, setPlotActivities] = useState<PlotActivity[]>([]);

  const { t } = useTranslation('garden_shared');
  const { t: tModals } = useTranslation('modals');
  const ref_ = gardenId ? getSharedGardenRef(gardenId) : null;
  const user = getUser();
  const isDisconnected = ref_?.disconnected_at != null;

  useEffect(() => {
    if (gardenId && plotId) loadData();
  }, [gardenId, plotId]);

  const loadData = () => {
    if (!gardenId || !plotId) return;
    setIsLoading(true);
    try {
      const plotData = SharedGardenDatabase.getPlot(gardenId, plotId);
      if (!plotData) {
        navigate(`/shared-garden/${gardenId}/plots`);
        return;
      }
      setPlot(plotData);
      setMembers(SharedGardenDatabase.getPlotMembers(gardenId, plotId));
      setAllPlants(SharedGardenDatabase.getAllPlants(gardenId));
      setPlotActivities(SharedGardenDatabase.getPlotActivities(gardenId, plotId));
    } catch (err) {
      console.error('Failed to load plot:', err);
      navigate(`/shared-garden/${gardenId}/plots`);
    } finally {
      setIsLoading(false);
    }
  };

  const myDisplayName = () =>
    gardenId && user ? (SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? user.userId) : '';

  const handleEditPlot = async (plotData: { name: string; description?: string; additional_info?: string }) => {
    if (!gardenId || !plotId || !user) return;
    try {
      SharedGardenDatabase.updatePlot(gardenId, plotId, plotData, user.userId, myDisplayName());
      loadData();
      if (gardenId) syncSharedGarden(gardenId, user).catch(() => {});
      success('Plot updated', `${plotData.name} has been updated`);
    } catch (err) {
      console.error('Failed to update plot:', err);
      error('Failed to update', 'Please try again');
    }
  };

  const handleDeletePlot = async () => {
    if (!gardenId || !plotId || !plot || !user) return;
    try {
      SharedGardenDatabase.deletePlot(gardenId, plotId, user.userId, myDisplayName(), plot.name);
      syncSharedGarden(gardenId, user).catch(() => {});
      navigate(`/shared-garden/${gardenId}/plots`);
    } catch (err) {
      console.error('Failed to delete plot:', err);
      error('Failed to delete', 'Please try again');
    }
  };

  const handleUpdateMembers = async (selectedPlantIds: string[]) => {
    if (!gardenId || !plotId || !plot || !user) return;
    try {
      SharedGardenDatabase.updatePlotMemberships(gardenId, plotId, selectedPlantIds, user.userId, myDisplayName(), plot.name);
      loadData();
      syncSharedGarden(gardenId, user).catch(() => {});
      success('Members updated', 'Plot membership has been updated');
    } catch (err) {
      console.error('Failed to update members:', err);
      error('Failed to update members', 'Please try again');
    }
  };

  const handleCreatePlantForPlot = async (plantData: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    additional_info?: string;
  }): Promise<Plant> => {
    if (!gardenId || !user) throw new Error('No garden context');
    await SharedGardenDatabase.init(gardenId);
    const newPlant = SharedGardenDatabase.addPlant(gardenId, plantData, user.userId, myDisplayName());
    syncSharedGarden(gardenId, user).catch(() => {});
    return newPlant;
  };

  const handleBulkActivity = (type: 'tending' | 'watering' | 'sunlight' | 'fruit') => {
    if (members.length === 0) {
      error('No members', 'Add plants to this plot before logging activities');
      return;
    }
    setBulkActivityModal({ isOpen: true, type });
  };

  const handleBulkActivitySubmit = async (activityData: any, selectedPlantIds: string[], images: string[] = []) => {
    if (!gardenId || !plot || !user) return;
    try {
      const now = activityData.datetime || Date.now();
      const actor = user.userId;
      const name = myDisplayName();
      const type = bulkActivityModal.type;

      for (const plantId of selectedPlantIds) {
        if (type === 'tending') {
          SharedGardenDatabase.addTending(gardenId,
            { plant_id: plantId, datetime: now, type: (activityData as Tending).type ?? '', summary: (activityData as Tending).summary ?? '' },
            actor, name
          );
        } else if (type === 'watering') {
          SharedGardenDatabase.addWatering(gardenId,
            { plant_id: plantId, datetime: now, source: (activityData as Watering).source ?? '', progress_description: (activityData as Watering).progress_description ?? '' },
            actor, name
          );
        } else if (type === 'sunlight') {
          SharedGardenDatabase.addSunlight(gardenId,
            { plant_id: plantId, datetime: now, topic: (activityData as Sunlight).topic ?? '' },
            actor, name
          );
        } else if (type === 'fruit') {
          SharedGardenDatabase.addFruit(gardenId,
            { plant_id: plantId, datetime: now, description: (activityData as Fruit).description ?? '', basic_activity: (activityData as Fruit).basic_activity },
            actor, name
          );
        }
      }

      const summary = activityData.summary || activityData.topic || activityData.source || activityData.description || '';
      const progressDesc = activityData.progress_description || '';
      const additionalInfo = [progressDesc, activityData.additional_info].filter(Boolean).join('\n\n');
      const plotActivity = SharedGardenDatabase.addPlotActivity(gardenId,
        { plot_id: plot.id, activity_type: type, datetime: now, summary, additional_info: additionalInfo, image_ids: JSON.stringify(images.map((_, i) => i)) },
        actor, name
      );

      if (images.length > 0 && ref_) {
        for (let i = 0; i < images.length; i++) {
          uploadPlotActivityImage(ref_, plotActivity.id, i, images[i], { userId: user.userId, signingPrivateKey: user.signature_private_key }).catch(() => {});
        }
      }

      SharedGardenDatabase.logPlotBulkActivity(gardenId, actor, name, type, plot.id, plot.name);
      syncSharedGarden(gardenId, user).catch(() => {});
      setPlotActivities(SharedGardenDatabase.getPlotActivities(gardenId, plot.id));
      success('Activity logged', `${type} logged for ${selectedPlantIds.length} plants`);
    } catch (err) {
      console.error('Failed to log bulk activity:', err);
      error('Failed to log activity', 'Please try again');
    }
  };

  const handleOpenNotching = () => {
    if (!gardenId) return;
    if (members.length === 0) {
      error('No members', 'Add plants to this plot before logging activities');
      return;
    }
    const allNotchings = members.flatMap(m =>
      SharedGardenDatabase.getNotchingsForPlant(gardenId, m.id)
    ).sort((a, b) => b.datetime - a.datetime);
    const most = allNotchings[0];
    setLastNotching(most ? { book: most.book, end_unit: most.end_unit, end_section: most.end_section } : undefined);
    setShowNotchingModal(true);
  };

  const handleBulkNotchingSubmit = async (notchingData: any, selectedPlantIds: string[]) => {
    if (!gardenId || !plot || !user) return;
    try {
      const now = notchingData.datetime || Date.now();
      const actor = user.userId;
      const name = myDisplayName();
      for (const plantId of selectedPlantIds) {
        SharedGardenDatabase.addNotching(gardenId,
          { plant_id: plantId, ...notchingData, datetime: now } as Omit<Notching, 'id' | 'updated_at'>,
          actor, name
        );
      }

      const summary = notchingData.book ? tModals(`ruhiBooks.${notchingData.book}`) : '';
      const progressDesc = notchingData.progress_description || '';
      const additionalInfo = [progressDesc, notchingData.additional_info].filter(Boolean).join('\n\n');
      SharedGardenDatabase.addPlotActivity(gardenId,
        { plot_id: plot.id, activity_type: 'notching', datetime: now, summary, additional_info: additionalInfo, image_ids: '[]' },
        actor, name
      );

      SharedGardenDatabase.logPlotBulkActivity(gardenId, actor, name, 'notching', plot.id, plot.name);
      syncSharedGarden(gardenId, user).catch(() => {});
      setPlotActivities(SharedGardenDatabase.getPlotActivities(gardenId, plot.id));
      success('Study session recorded', `Logged for ${selectedPlantIds.length} plants`);
    } catch (err) {
      console.error('Failed to log notching:', err);
      error('Failed to log study session', 'Please try again');
    }
  };

  if (!gardenId || !ref_) {
    navigate('/shared-gardens');
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plot) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/shared-garden/${gardenId}/plots`)}
              className="text-gray-500 hover:text-gray-700 transition-colors p-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{plot.name}</h1>
              <p className="text-xs text-gray-500">
                {t('membersCount', { count: members.length })} · {ref_.gardenName}
              </p>
            </div>
          </div>
          {!isDisconnected && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Description */}
        {plot.description && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm text-gray-700 leading-relaxed">{plot.description}</p>
          </div>
        )}

        {/* Members */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">{t('membersCount', { count: members.length })}</h2>
            {!isDisconnected && (
              <button
                onClick={() => setShowMembersModal(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                {t('manageMembers')}
              </button>
            )}
          </div>

          {members.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-3">{t('noMembers')}</p>
              {!isDisconnected && (
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 px-4 py-2 rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('addPlants')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map(member => (
                <button
                  key={member.id}
                  onClick={() => navigate(`/shared-garden/${gardenId}/plants/${member.id}`)}
                  className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-green-50 rounded-xl transition-colors text-left"
                >
                  <span className="text-base">🌱</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                      {(() => {
                        const ageInfo = parseAgeInfoFromPlant(member);
                        if (!ageInfo || ageInfo.is_over_21) return null;
                        const age = resolveEffectiveAge(ageInfo);
                        if (age >= 21) return null;
                        return (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                            {t('ageYears', { age })}
                          </span>
                        );
                      })()}
                    </div>
                    {member.phone && (
                      <PhoneLink
                        phone={member.phone}
                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                        iconClassName="w-3 h-3"
                        stopPropagation
                      />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bulk activities */}
        {members.length > 0 && !isDisconnected && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">{t('plotActivity')}</h2>
            <p className="text-xs text-gray-500 mb-4">{t('plotActivityDesc')}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <button
                onClick={() => handleBulkActivity('sunlight')}
                className="flex items-center gap-3 p-4 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-xl transition-colors"
              >
                <span className="text-xl">☀️</span>
                <div className="text-left">
                  <p className="text-sm font-medium">{t('plotActivities.sunlight')}</p>
                  <p className="text-xs opacity-70">{t('plotActivities.sunlightDesc')}</p>
                </div>
              </button>


              <button
                onClick={handleOpenNotching}
                className="flex items-center gap-3 p-4 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition-colors"
              >
                <span className="text-xl">🌿</span>
                <div className="text-left">
                  <p className="text-sm font-medium">{t('plotActivities.notching')}</p>
                  <p className="text-xs opacity-70">{t('plotActivities.notchingDesc')}</p>
                </div>
              </button>
              
              <button
                onClick={() => handleBulkActivity('tending')}
                className="flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors"
              >
                <span className="text-xl">🪴</span>
                <div className="text-left">
                  <p className="text-sm font-medium">{t('plotActivities.tend')}</p>
                  <p className="text-xs opacity-70">{t('plotActivities.tendDesc')}</p>
                </div>
              </button>

              <button
                onClick={() => handleBulkActivity('watering')}
                className="flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors"
              >
                <span className="text-xl">🚿</span>
                <div className="text-left">
                  <p className="text-sm font-medium">{t('plotActivities.water')}</p>
                  <p className="text-xs opacity-70">{t('plotActivities.waterDesc')}</p>
                </div>
              </button>

              
              <button
                onClick={() => handleBulkActivity('fruit')}
                className="flex items-center gap-3 p-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition-colors"
              >
                <span className="text-xl">🍎</span>
                <div className="text-left">
                  <p className="text-sm font-medium">{t('plotActivities.fruit')}</p>
                  <p className="text-xs opacity-70">{t('plotActivities.fruitDesc')}</p>
                </div>
              </button>

            </div>
          </div>
        )}

        {/* Plot Activity Log */}
        {members.length > 0 && (
          <PlotActivityLogCard
            activities={plotActivities}
            gardenId={gardenId}
            plotId={plot.id}
            onActivityUpdated={() => {
              if (gardenId) setPlotActivities(SharedGardenDatabase.getPlotActivities(gardenId, plot.id));
            }}
          />
        )}
      </div>

      {/* Modals */}
      <AddEditPlotModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        plot={plot}
        onSave={handleEditPlot}
      />

      <ManageMembersModal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        plotName={plot.name}
        allPlants={allPlants}
        currentMemberIds={members.map(m => m.id)}
        onSave={handleUpdateMembers}
        onCreatePlant={handleCreatePlantForPlot}
      />

      <BulkActivityModal
        isOpen={bulkActivityModal.isOpen}
        onClose={() => setBulkActivityModal(prev => ({ ...prev, isOpen: false }))}
        plotName={plot.name}
        plants={members}
        activityType={bulkActivityModal.type}
        onSubmit={handleBulkActivitySubmit}
      />

      <BulkNotchingModal
        isOpen={showNotchingModal}
        onClose={() => setShowNotchingModal(false)}
        plotName={plot.name}
        plants={members}
        lastNotching={lastNotching}
        onSubmit={handleBulkNotchingSubmit}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeletePlot}
        title={t('deletePlotTitle')}
        message={t('deletePlotMessage', { name: plot.name })}
        confirmText={t('deletePlot')}
        cancelText={t('keepPlot')}
        type="danger"
      />

      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  );
};
