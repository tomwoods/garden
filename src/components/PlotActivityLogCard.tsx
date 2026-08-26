import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Droplets, Sun, Flower2, Scissors, BookOpen, ImageIcon } from 'lucide-react';
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

const activityConfig: Record<string, { icon: React.FC<React.SVGProps<SVGSVGElement>>; color: string; bg: string }> = {
  tending: { icon: Heart, color: 'text-rose-500', bg: 'bg-rose-50' },
  watering: { icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-50' },
  sunlight: { icon: Sun, color: 'text-amber-500', bg: 'bg-amber-50' },
  fruit: { icon: Flower2, color: 'text-green-500', bg: 'bg-green-50' },
  pruning: { icon: Scissors, color: 'text-orange-500', bg: 'bg-orange-50' },
  notching: { icon: BookOpen, color: 'text-teal-500', bg: 'bg-teal-50' },
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

export const PlotActivityLogCard: React.FC<PlotActivityLogCardProps> = ({
  activities,
  gardenId,
  plotId,
  onActivityUpdated,
}) => {
  const { t } = useTranslation('garden_shared');
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
            const Icon = config.icon;
            return (
              <button
                key={activity.id}
                onClick={() => setEditingActivity(activity)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  {/* Activity type icon */}
                  <div className={`w-7 h-7 ${config.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                  </div>

                  {/* Activity label */}
                  <span className="text-sm font-medium text-gray-900 flex-shrink-0">
                    {t(`plotActivities.${activity.activity_type}`) || activity.activity_type}
                  </span>

                  {/* Summary - truncated, fills available space */}
                  {activity.summary && (
                    <span className="text-sm text-gray-500 truncate flex-1 min-w-0">
                      {activity.summary}
                    </span>
                  )}

                  {/* Spacer when no summary */}
                  {!activity.summary && <span className="flex-1" />}

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
