import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff } from 'lucide-react';
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
            const key = `plot_activity_image_${plotId}_${activity.datetime}_${i}`;
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
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('plotActivityLog.title')}</h3>
        <div className="space-y-3">
          {activities.map((activity) => {
            const images = imageCache[activity.id] || [];
            return (
              <button
                key={activity.id}
                onClick={() => setEditingActivity(activity)}
                className="w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {t(`plotActivities.${activity.activity_type}`) || activity.activity_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatRelativeTime(activity.datetime, t)}
                      </span>
                    </div>
                    {activity.summary && (
                      <p className="text-sm text-gray-600 line-clamp-2">{activity.summary}</p>
                    )}
                    {activity.authored_by_display_name && (
                      <p className="text-xs text-gray-400 mt-1">{activity.authored_by_display_name}</p>
                    )}
                  </div>
                  {images.length > 0 && (
                    <div className="flex gap-1 flex-shrink-0">
                      {images.slice(0, 4).map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          alt=""
                          className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                        />
                      ))}
                    </div>
                  )}
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
