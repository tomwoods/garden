import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from 'lucide-react';
import { RUHI_BOOKS } from '../lib/ruhiBooks';
import type { PlotActivity } from '../lib/database';
import { PlotActivityEditModal } from './PlotActivityEditModal';
import { getAllPlotActivityImagesLocally, downloadPlotActivityThumbnails } from '../lib/plotActivityImageSync';
import { getSharedGardenRef } from '../lib/sharedGardenDatabase';

interface PlotActivityLogCardProps {
  activities: PlotActivity[];
  gardenId: string | null;
  plotId: string;
  onActivityUpdated: () => void;
}

const activityConfig: Record<string, { emoji: string; color: string; bg: string }> = {
  tending: { emoji: '🪴', color: 'text-green-700', bg: 'bg-green-50' },
  watering: { emoji: '🚿', color: 'text-blue-700', bg: 'bg-blue-50' },
  sunlight: { emoji: '☀️', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  fruit: { emoji: '🍎', color: 'text-red-700', bg: 'bg-red-50' },
  pruning: { emoji: '✂️', color: 'text-orange-700', bg: 'bg-orange-50' },
  notching: { emoji: '🌿', color: 'text-amber-700', bg: 'bg-amber-50' },
};

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function formatRelativeTime(timestamp: number, t: (key: string, options?: any) => string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('plotActivityLog.justNow');
  if (minutes < 60) return t('plotActivityLog.minutesAgo', { count: minutes });
  if (hours < 24) return t('plotActivityLog.hoursAgo', { count: hours });
  if (days < 7) return t('plotActivityLog.daysAgo', { count: days });
  return new Date(timestamp).toLocaleDateString();
}

const ruhiBookValues = new Set(RUHI_BOOKS.map(b => b.value));

function resolveNotchingSummary(activity: PlotActivity, tModals: (key: string) => string): string {
  if (activity.activity_type !== 'notching') return activity.summary;
  if (!activity.summary) return '';
  if (ruhiBookValues.has(activity.summary)) {
    return tModals(`ruhiBooks.${activity.summary}`);
  }
  return activity.summary;
}

export const PlotActivityLogCard: React.FC<PlotActivityLogCardProps> = ({
  activities,
  gardenId,
  plotId,
  onActivityUpdated,
}) => {
  const { t } = useTranslation('garden_shared');
  const { t: tModals } = useTranslation('modals');
  const [editingActivity, setEditingActivity] = useState<PlotActivity | null>(null);
  const [imageCache, setImageCache] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const loadImages = async () => {
      const cache: Record<string, string[]> = {};
      for (const activity of activities) {
        const imageIds: number[] = (() => {
          try { return JSON.parse(activity.image_ids || '[]'); } catch { return []; }
        })();
        if (imageIds.length === 0) continue;

        if (gardenId) {
          const ref = getSharedGardenRef(gardenId);
          const user = getUser();
          if (ref && user) {
            const local = getAllPlotActivityImagesLocally(gardenId, activity.id);
            if (local.length > 0) {
              cache[activity.id] = local;
            } else {
              const downloaded = await downloadPlotActivityThumbnails(ref, activity.id, { userId: user.userId, signingPrivateKey: user.signature_private_key });
              cache[activity.id] = downloaded;
            }
          }
        } else {
          const local: string[] = [];
          for (let i = 0; i < imageIds.length; i++) {
            const key = `plot_activity_image_${plotId}_${activity.id}_${i}`;
            const raw = localStorage.getItem(key);
            if (raw) {
              try { local.push(JSON.parse(raw).dataUrl); } catch { /* skip */ }
            }
          }
          cache[activity.id] = local;
        }
      }
      setImageCache(cache);
    };

    loadImages();
  }, [activities, gardenId, plotId]);

  if (activities.length === 0) return null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-3">{t('plotActivityLog.title')}</h3>
        <div className="space-y-1.5">
          {activities.map((activity) => {
            const images = imageCache[activity.id] || [];
            const config = activityConfig[activity.activity_type] || activityConfig.tending;
            return (
              <button
                key={activity.id}
                onClick={() => setEditingActivity(activity)}
                className={`w-full text-left px-3 py-2 ${config.bg} hover:brightness-95 rounded-lg transition-all group`}
              >
                <div className="flex items-center gap-2.5">
                  {/* Activity emoji */}
                  <span className="text-base flex-shrink-0 leading-none">{config.emoji}</span>

                  {/* Activity label */}
                  <span className={`text-sm font-medium ${config.color} flex-shrink-0`}>
                    {t(`plotActivities.${activity.activity_type}`) || activity.activity_type}
                  </span>

                  {/* Summary - truncated, fills available space */}
                  {(() => {
                    const displaySummary = resolveNotchingSummary(activity, tModals);
                    return displaySummary ? (
                      <span className="text-sm text-gray-500 truncate flex-1 min-w-0">
                        {displaySummary}
                      </span>
                    ) : null;
                  })()}

                  {/* Spacer when no summary */}
                  {(() => {
                    const displaySummary = resolveNotchingSummary(activity, tModals);
                    return !displaySummary ? <span className="flex-1" /> : null;
                  })()}

                  {/* Author */}
                  {activity.authored_by_display_name && (
                    <span className="text-xs text-gray-400 hidden sm:inline flex-shrink-0">
                      {activity.authored_by_display_name}
                    </span>
                  )}

                  {/* Image count badge */}
                  {images.length > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-400">{images.length}</span>
                    </div>
                  )}

                  {/* Relative time */}
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatRelativeTime(activity.datetime, t)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {editingActivity && (
        <PlotActivityEditModal
          activity={editingActivity}
          gardenId={gardenId}
          plotId={plotId}
          images={imageCache[editingActivity.id] || []}
          onClose={() => setEditingActivity(null)}
          onUpdated={() => {
            onActivityUpdated();
            setEditingActivity(null);
          }}
          onDeleted={() => {
            onActivityUpdated();
            setEditingActivity(null);
          }}
        />
      )}
    </>
  );
};
