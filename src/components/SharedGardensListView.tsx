import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Users, Leaf, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getSharedGardenRefs, type SharedGardenRef, SharedGardenDatabase } from '../lib/sharedGardenDatabase';
import { CreateSharedGardenModal } from './CreateSharedGardenModal';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

interface GardenCardStats {
  plantCount: number;
  memberCount: number;
}

export const SharedGardensListView: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('garden_shared');
  const [refs, setRefs] = useState<SharedGardenRef[]>([]);
  const [stats, setStats] = useState<Record<string, GardenCardStats>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const user = getUser();

  const loadRefs = async () => {
    const all = getSharedGardenRefs();
    setRefs(all);

    // Load stats for each garden
    const newStats: Record<string, GardenCardStats> = {};
    for (const ref of all) {
      try {
        await SharedGardenDatabase.init(ref.gardenId);
        newStats[ref.gardenId] = SharedGardenDatabase.getGardenStats(ref.gardenId);
      } catch {
        newStats[ref.gardenId] = { plantCount: 0, memberCount: 0 };
      }
    }
    setStats(newStats);
  };

  useEffect(() => {
    loadRefs();
  }, []);

  const handleGardenCreated = (gardenId: string) => {
    setShowCreateModal(false);
    loadRefs();
    navigate(`/shared-garden/${gardenId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-gray-500 hover:text-gray-700 transition-colors p-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{t('sharedGardens')}</h1>
              <p className="text-xs text-gray-500">{t('gardenersTogether')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('newGarden')}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {refs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('noGardensYet')}</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed mb-6">
              {t('noGardensDesc')}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('createSharedGarden')}
            </button>
          </div>
        ) : (
          refs.map(ref => {
            const gardenStats = stats[ref.gardenId];
            return (
              <button
                key={ref.gardenId}
                onClick={() => navigate(`/shared-garden/${ref.gardenId}`)}
                className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:shadow-md transition-all duration-200 hover:border-green-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Leaf className="w-5 h-5 text-green-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{ref.gardenName}</h3>
                        {ref.disconnected && (
                          <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            {t('disconnected')}
                          </span>
                        )}
                        {ref.restored && (
                          <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            <RotateCcw className="w-3 h-3" />
                            {t('restored')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{t('youAs', { name: ref.myDisplayName })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <RefreshCw className="w-3 h-3" />
                    {ref.lastSyncTs > 0 ? dayjs(ref.lastSyncTs).fromNow() : t('neverSynced', { ns: 'common' })}
                  </div>
                </div>

                {gardenStats && (
                  <div className="flex gap-4 mt-4 pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Leaf className="w-4 h-4 text-green-500" />
                      <span>{t('membersCount', { count: gardenStats.plantCount })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Users className="w-4 h-4 text-green-500" />
                      <span>{gardenStats.memberCount} {gardenStats.memberCount === 1 ? t('gardener_one', { ns: 'common' }) : t('gardener_other', { ns: 'common' })}</span>
                    </div>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {showCreateModal && user && (
        <CreateSharedGardenModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          user={user}
          onCreated={handleGardenCreated}
        />
      )}
    </div>
  );
};
