import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CreditCard as Edit, Users, Trash2, Plus } from 'lucide-react';
import { AddEditPlotModal } from './AddEditPlotModal';
import { PhoneLink } from './PhoneLink';
import { ManageMembersModal } from './ManageMembersModal';
import { BulkActivityModal } from './BulkActivityModal';
import { BulkNotchingModal } from './BulkNotchingModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ToastContainer } from './ToastContainer';
import { DatabaseService, type PlotWithMembers, type Plant, type PlotActivity } from '../lib/database';
import { parseAgeInfoFromPlant, resolveEffectiveAge } from '../lib/harvestService';
import { uploadService } from '../lib/uploadService';
import { useToast } from '../hooks/useToast';
import { PlotActivityLogCard } from './PlotActivityLogCard';

export const PlotDetailView: React.FC = () => {
  const { plotId } = useParams<{ plotId: string }>();
  const navigate = useNavigate();
  const [plot, setPlot] = useState<PlotWithMembers | null>(null);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [bulkActivityModal, setBulkActivityModal] = useState<{
    isOpen: boolean;
    type: 'tending' | 'watering' | 'sunlight' | 'fruit';
  }>({
    isOpen: false,
    type: 'tending'
  });
  const [bulkNotchingModal, setBulkNotchingModal] = useState(false);
  const [lastPlotNotching, setLastPlotNotching] = useState<{ book: string; end_unit: number; end_section: number } | undefined>(undefined);
  const [plotActivities, setPlotActivities] = useState<PlotActivity[]>([]);
  const [confirmationModal, setConfirmationModal] = useState<{
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

  const { t } = useTranslation('garden_shared');
  const { toasts, success, error, removeToast } = useToast();

  useEffect(() => {
    if (plotId) {
      loadPlotData();
    }
  }, [plotId]);

  const loadPlotData = async () => {
    if (!plotId) return;
    
    setIsLoading(true);
    try {
      const [plotData, allPlantsData] = await Promise.all([
        DatabaseService.getPlotWithMembers(plotId),
        DatabaseService.getAllPlants()
      ]);

      if (!plotData) {
        navigate('/plots');
        return;
      }

      setPlot(plotData);
      setAllPlants(allPlantsData);
      const activities = await DatabaseService.getPlotActivities(plotId);
      setPlotActivities(activities);
    } catch (err) {
      console.error('Failed to load plot data:', err);
      navigate('/plots');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/plots');
  };

  const handleEditPlot = async (plotData: { name: string; description?: string }) => {
    if (!plot) return;
    
    try {
      await DatabaseService.updatePlot(plot.id, plotData);
      await loadPlotData();
      success(t('toasts.plotUpdatedTitle'), t('toasts.plotUpdated', { name: plotData.name }));
    } catch (err) {
      console.error('Failed to update plot:', err);
      error(t('toasts.plotUpdateFailed'), t('tryAgain', { ns: 'common' }));
    }
  };

  const handleDeletePlot = () => {
    if (!plot) return;
    
    setConfirmationModal({
      isOpen: true,
      title: t('deletePlotTitle'),
      message: t('deletePlotMessage', { name: plot.name }),
      onConfirm: async () => {
        try {
          await DatabaseService.deletePlot(plot.id);
          success(t('toasts.plotDeletedTitle'), t('toasts.plotDeleted', { name: plot.name }));
          navigate('/plots');
        } catch (err) {
          console.error('Failed to delete plot:', err);
          error(t('toasts.plotDeleteFailed'), t('tryAgain', { ns: 'common' }));
        }
      }
    });
  };

  const handleUpdateMembers = async (selectedPlantIds: string[]) => {
    if (!plot) return;
    
    try {
      await DatabaseService.updatePlotMemberships(plot.id, selectedPlantIds);
      await loadPlotData();
      success(t('toasts.membersUpdatedTitle'), t('toasts.membersUpdated'));
    } catch (err) {
      console.error('Failed to update members:', err);
      error(t('toasts.membersFailed'), t('tryAgain', { ns: 'common' }));
    }
  };

  const handleCreatePlantForPlot = async (plantData: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    additional_info?: string;
  }, images?: string[]): Promise<Plant> => {
    const newPlant = await DatabaseService.addPlant(plantData);
    if (images && images.length > 0) {
      await uploadService.queueUpload(newPlant.id, plantData.name, images[0]);
    }
    return newPlant;
  };

  const handleBulkActivity = (type: 'tending' | 'watering' | 'sunlight' | 'fruit') => {
    if (!plot || plot.members.length === 0) {
      error(t('toasts.noMembers'), t('toasts.noMembersDesc'));
      return;
    }
    
    setBulkActivityModal({
      isOpen: true,
      type
    });
  };

  const handleBulkActivitySubmit = async (activityData: any, selectedPlantIds: string[], images: string[] = []) => {
    if (!plot) return;

    try {
      const timestamp = activityData.datetime || Date.now();
      await DatabaseService.logBulkActivity(bulkActivityModal.type, activityData, selectedPlantIds, timestamp);

      const summary = activityData.summary || activityData.topic || activityData.source || activityData.description || '';
      const progressDesc = activityData.progress_description || '';
      const additionalInfo = [progressDesc, activityData.additional_info].filter(Boolean).join('\n\n');
      const plotActivity = await DatabaseService.addPlotActivity({
        plot_id: plot.id,
        activity_type: bulkActivityModal.type,
        datetime: timestamp,
        summary,
        additional_info: additionalInfo,
        image_ids: JSON.stringify(images.map((_, i) => i)),
      });

      let imageSaveFailed = false;
      console.log('[PlotActivity] Saving images:', { count: images.length, plotId: plot.id, activityId: plotActivity.id });
      for (let i = 0; i < images.length; i++) {
        const key = `plot_activity_image_${plot.id}_${plotActivity.id}_${i}`;
        try {
          localStorage.setItem(key, JSON.stringify({ dataUrl: images[i], timestamp: Date.now() }));
          console.log('[PlotActivity] Saved image key:', key);
        } catch (storageErr) {
          console.error('[PlotActivity] Failed to save image to localStorage:', key, storageErr);
          imageSaveFailed = true;
        }
      }

      const activities = await DatabaseService.getPlotActivities(plot.id);
      setPlotActivities(activities);

      if (imageSaveFailed && images.length > 0) {
        error(t('toasts.activityLoggedTitle'), t('toasts.imageSaveFailed', { defaultValue: 'Activity logged but images could not be saved. Storage may be full.' }));
      }
      success(t('toasts.activityLoggedTitle'), t('toasts.activityLogged', { type: bulkActivityModal.type, count: selectedPlantIds.length }));
    } catch (err) {
      console.error('Failed to log bulk activity:', err);
      error(t('toasts.activityFailed'), t('tryAgain', { ns: 'common' }));
    }
  };

  const handleBulkNotchingSubmit = async (notchingData: any, selectedPlantIds: string[]) => {
    if (!plot) return;
    try {
      const timestamp = notchingData.datetime || Date.now();
      for (const plantId of selectedPlantIds) {
        await DatabaseService.addNotching({ plant_id: plantId, ...notchingData, datetime: timestamp });
      }

      const summary = notchingData.progress_description || notchingData.book || '';
      await DatabaseService.addPlotActivity({
        plot_id: plot.id,
        activity_type: 'notching',
        datetime: timestamp,
        summary,
        additional_info: notchingData.additional_info || '',
        image_ids: '[]',
      });

      const activities = await DatabaseService.getPlotActivities(plot.id);
      setPlotActivities(activities);

      success(t('toasts.notchingLoggedTitle'), t('toasts.notchingLogged', { count: selectedPlantIds.length }));
    } catch (err) {
      console.error('Failed to log bulk notching:', err);
      error(t('toasts.notchingFailed'), t('tryAgain', { ns: 'common' }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 animate-spin">
            <img src="/plots_icon.svg" alt="Loading plot" className="w-16 h-16" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
          </div>
          <p className="text-gray-600">Loading plot details...</p>
        </div>
      </div>
    );
  }

  if (!plot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Plot not found</p>
          <button
            onClick={handleBack}
            className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Return to Plots
          </button>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <img src="/plots_icon.svg" alt="Plot" className="w-6 h-6" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{plot.name}</h1>
                <p className="text-sm text-gray-600">
                  {t('membersCount', { count: plot.members.length })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Edit className="w-5 h-5" />
              </button>
              <button
                onClick={handleDeletePlot}
                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Plot Description */}
          {plot.description && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
              <p className="text-gray-700 leading-relaxed">{plot.description}</p>
            </div>
          )}

          {/* Members Section */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('membersCount', { count: plot.members.length })}</h3>
              <button
                onClick={() => setShowMembersModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg font-medium transition-colors"
              >
                <img src="/plots_icon.svg" alt="Manage Members" className="w-4 h-4" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
                {t('manageMembers')}
              </button>
            </div>

            {plot.members.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <img src="/plots_icon.svg" alt="No members" className="w-8 h-8" style={{ filter: 'invert(60%) sepia(10%) saturate(200%) hue-rotate(180deg) brightness(95%) contrast(85%)' }} />
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">{t('noMembers')}</h4>
                <p className="text-gray-600 mb-4">{t('noMembersDesc')}</p>
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('addPlants')}
                </button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {plot.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => navigate(`/plants/${member.id}`)}
                  >
                    <span className="text-lg">🌱</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <div className="font-medium text-gray-900">{member.name}</div>
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
                          className="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                          stopPropagation
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group Activities Section */}
          {plot.members.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('plotActivity')}</h3>
              <p className="text-gray-600 mb-6">
                {t('plotActivityDesc')}
              </p>
              
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <button
                  onClick={() => handleBulkActivity('sunlight')}
                  className="flex items-center gap-3 p-4 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-xl transition-colors"
                >
                  <span className="text-2xl">☀️</span>
                  <div className="text-left">
                    <div className="font-medium">{t('plotActivities.sunlight')}</div>
                    <div className="text-sm opacity-80">{t('plotActivities.sunlightDesc')}</div>
                  </div>
                </button>
                                
                <button
                  onClick={async () => {
                    if (!plot || plot.members.length === 0) {
                      error(t('toasts.noMembers'), t('toasts.noMembersDesc'));
                      return;
                    }
                    const allNotchings = (await Promise.all(
                      plot.members.map(m => DatabaseService.getNotchingsForPlant(m.id))
                    )).flat();
                    const mostRecent = allNotchings.sort((a, b) => b.datetime - a.datetime)[0];
                    setLastPlotNotching(mostRecent ? { book: mostRecent.book, end_unit: mostRecent.end_unit, end_section: mostRecent.end_section } : undefined);
                    setBulkNotchingModal(true);
                  }}
                  className="flex items-center gap-3 p-4 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition-colors"
                >
                  <span className="text-2xl">📖</span>
                  <div className="text-left">
                    <div className="font-medium">{t('plotActivities.notching')}</div>
                    <div className="text-sm opacity-80">{t('plotActivities.notchingDesc')}</div>
                  </div>
                </button>
                
                <button
                  onClick={() => handleBulkActivity('tending')}
                  className="flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors"
                >
                  <span className="text-2xl">🪴</span>
                  <div className="text-left">
                    <div className="font-medium">{t('plotActivities.tend')}</div>
                    <div className="text-sm opacity-80">{t('plotActivities.tendDesc')}</div>
                  </div>
                </button>
                
                <button
                  onClick={() => handleBulkActivity('watering')}
                  className="flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors"
                >
                  <span className="text-2xl">🚿</span>
                  <div className="text-left">
                    <div className="font-medium">{t('plotActivities.water')}</div>
                    <div className="text-sm opacity-80">{t('plotActivities.waterDesc')}</div>
                  </div>
                </button>
                
                <button
                  onClick={() => handleBulkActivity('fruit')}
                  className="flex items-center gap-3 p-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition-colors"
                >
                  <span className="text-2xl">🍎</span>
                  <div className="text-left">
                    <div className="font-medium">{t('plotActivities.fruit')}</div>
                    <div className="text-sm opacity-80">{t('plotActivities.fruitDesc')}</div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* Plot Activity Log */}
          {plot.members.length > 0 && (
            <PlotActivityLogCard
              activities={plotActivities}
              gardenId={null}
              plotId={plot.id}
              onActivityUpdated={async () => {
                const activities = await DatabaseService.getPlotActivities(plot.id);
                setPlotActivities(activities);
              }}
            />
          )}
        </div>
      </main>

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
        currentMemberIds={plot.members.map(m => m.id)}
        onSave={handleUpdateMembers}
        onCreatePlant={handleCreatePlantForPlot}
      />

      <BulkActivityModal
        isOpen={bulkActivityModal.isOpen}
        onClose={() => setBulkActivityModal(prev => ({ ...prev, isOpen: false }))}
        plotName={plot.name}
        plants={plot.members}
        activityType={bulkActivityModal.type}
        onSubmit={handleBulkActivitySubmit}
      />

      <BulkNotchingModal
        isOpen={bulkNotchingModal}
        onClose={() => setBulkNotchingModal(false)}
        plotName={plot.name}
        plants={plot.members}
        lastNotching={lastPlotNotching}
        onSubmit={handleBulkNotchingSubmit}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={t('deletePlot')}
        cancelText={t('keepPlot')}
        type="danger"
      />

      <ToastContainer
        toasts={toasts}
        onRemoveToast={removeToast}
      />
    </div>
  );
};