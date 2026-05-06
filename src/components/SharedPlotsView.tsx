import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { SharedGardenDatabase, getSharedGardenRef } from '../lib/sharedGardenDatabase';
import { AddEditPlotModal } from './AddEditPlotModal';
import { ToastContainer } from './ToastContainer';
import { useToast } from '../hooks/useToast';
import type { Plot } from '../lib/database';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

interface PlotWithCount extends Plot {
  memberCount: number;
  memberNames: string[];
}

export const SharedPlotsView: React.FC = () => {
  const { gardenId } = useParams<{ gardenId: string }>();
  const navigate = useNavigate();
  const [plots, setPlots] = useState<PlotWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const { toasts, success, error, removeToast } = useToast();

  const ref_ = gardenId ? getSharedGardenRef(gardenId) : null;
  const user = getUser();
  const isDisconnected = ref_?.disconnected_at != null;

  useEffect(() => {
    if (gardenId) loadPlots();
  }, [gardenId]);

  const loadPlots = () => {
    if (!gardenId) return;
    setIsLoading(true);
    try {
      const rawPlots = SharedGardenDatabase.getPlots(gardenId);
      const enriched: PlotWithCount[] = rawPlots.map(plot => {
        const members = SharedGardenDatabase.getPlotMembers(gardenId, plot.id);
        return {
          ...plot,
          memberCount: members.length,
          memberNames: members.slice(0, 3).map(m => m.name),
        };
      });
      setPlots(enriched);
    } catch (err) {
      console.error('Failed to load plots:', err);
      error('Failed to load plots', 'Please try again');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePlot = async (plotData: { name: string; description?: string; additional_info?: string }) => {
    if (!gardenId || !user) return;
    try {
      const myDisplayName = SharedGardenDatabase.getMember(gardenId, user.userId)?.display_name ?? user.userId;
      SharedGardenDatabase.createPlot(gardenId, plotData, user.userId, myDisplayName);
      loadPlots();
      success('Plot created', `${plotData.name} has been created`);
    } catch (err) {
      console.error('Failed to create plot:', err);
      error('Failed to create plot', 'Please try again');
    }
  };

  if (!gardenId || !ref_) {
    navigate('/shared-gardens');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/shared-garden/${gardenId}`)}
              className="text-gray-500 hover:text-gray-700 transition-colors p-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Plots</h1>
              <p className="text-xs text-gray-500">{ref_.gardenName}</p>
            </div>
          </div>
          {!isDisconnected && (
            <button
              onClick={() => setShowAddModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading plots...</p>
          </div>
        ) : plots.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <img
                src="/plots_icon.svg"
                alt="Plots"
                className="w-8 h-8"
                style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }}
              />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No plots yet</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              {isDisconnected
                ? 'This is a read-only copy. No plots were created before you left.'
                : 'Create a plot to group plants and log activities for several people at once.'}
            </p>
            {!isDisconnected && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-6 inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Create first plot
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {plots.map(plot => (
              <button
                key={plot.id}
                onClick={() => navigate(`/shared-garden/${gardenId}/plots/${plot.id}`)}
                className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-green-100 transition-all duration-150 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <img
                        src="/plots_icon.svg"
                        alt="Plot"
                        className="w-5 h-5"
                        style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{plot.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {plot.memberCount} {plot.memberCount === 1 ? 'plant' : 'plants'} · created {dayjs(plot.created_at).fromNow()}
                      </p>
                    </div>
                  </div>
                </div>

                {plot.description && (
                  <p className="mt-3 text-sm text-gray-600 leading-relaxed line-clamp-2">{plot.description}</p>
                )}

                {plot.memberNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {plot.memberNames.map(name => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full"
                      >
                        🌱 {name}
                      </span>
                    ))}
                    {plot.memberCount > 3 && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                        +{plot.memberCount - 3} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isDisconnected && plots.length > 0 && (
        <button
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      <AddEditPlotModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleCreatePlot}
      />

      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  );
};
