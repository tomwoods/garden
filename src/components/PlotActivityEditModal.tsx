import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2 } from 'lucide-react';
import type { PlotActivity } from '../lib/database';
import { RUHI_BOOKS } from '../lib/ruhiBooks';
import { DatabaseService } from '../lib/database';
import { SharedGardenDatabase, getSharedGardenRef } from '../lib/sharedGardenDatabase';
import { deletePlotActivityImage } from '../lib/plotActivityImageSync';

interface PlotActivityEditModalProps {
  activity: PlotActivity;
  gardenId: string | null;
  plotId: string;
  images: string[];
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function myDisplayName(gardenId: string | null): string {
  if (!gardenId) return '';
  const user = getUser();
  if (!user) return '';
  const member = SharedGardenDatabase.getMember(gardenId, user.userId);
  return member?.display_name ?? user.userId;
}

export const PlotActivityEditModal: React.FC<PlotActivityEditModalProps> = ({
  activity,
  gardenId,
  plotId,
  images,
  onClose,
  onUpdated,
  onDeleted,
}) => {
  const { t } = useTranslation('garden_shared');
  const { t: tModals } = useTranslation('modals');
  const ruhiBookValues = new Set(RUHI_BOOKS.map(b => b.value));
  const initialSummary = activity.activity_type === 'notching' && activity.summary && ruhiBookValues.has(activity.summary)
    ? tModals(`ruhiBooks.${activity.summary}`)
    : activity.summary || '';
  const [summary, setSummary] = useState(initialSummary);
  const [additionalInfo, setAdditionalInfo] = useState(activity.additional_info || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (gardenId) {
        const user = getUser();
        if (!user) return;
        SharedGardenDatabase.updatePlotActivity(
          gardenId,
          activity.id,
          { summary, additional_info: additionalInfo },
          user.userId,
          myDisplayName(gardenId)
        );
      } else {
        await DatabaseService.updatePlotActivity(activity.id, { summary, additional_info: additionalInfo });
      }
      onUpdated();
    } catch (err) {
      console.error('Failed to update plot activity:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      if (gardenId) {
        const user = getUser();
        const ref = getSharedGardenRef(gardenId);
        if (!user || !ref) return;
        SharedGardenDatabase.deletePlotActivity(gardenId, activity.id, user.userId, myDisplayName(gardenId));
        const imageIds: number[] = (() => {
          try { return JSON.parse(activity.image_ids || '[]'); } catch { return []; }
        })();
        for (const idx of imageIds) {
          deletePlotActivityImage(ref, activity.id, idx, { userId: user.userId, signingPrivateKey: user.signature_private_key }).catch(() => {});
        }
      } else {
        await DatabaseService.deletePlotActivity(activity.id);
        const imageIds: number[] = (() => {
          try { return JSON.parse(activity.image_ids || '[]'); } catch { return []; }
        })();
        for (const idx of imageIds) {
          localStorage.removeItem(`plot_activity_image_${plotId}_${activity.id}_${idx}`);
        }
      }
      onDeleted();
    } catch (err) {
      console.error('Failed to delete plot activity:', err);
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {t(`plotActivities.${activity.activity_type}`) || activity.activity_type}
            </h2>
            <p className="text-sm text-gray-500">{formatDate(activity.datetime)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-gray-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Images */}
        {images.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-3">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Activity image ${idx + 1}`}
                  className="w-full h-32 object-cover rounded-lg border border-gray-200"
                />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('plotActivityLog.summary')}
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
            rows={3}
          />
        </div>

        {/* Additional Info */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('plotActivityLog.additionalInfo')}
          </label>
          <textarea
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
          >
            {t('plotActivityLog.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
          >
            {isSaving ? t('plotActivityLog.saving') : t('plotActivityLog.save')}
          </button>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
            <p className="text-sm text-red-700 mb-3">{t('plotActivityLog.deleteConfirm')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors border border-gray-200"
              >
                {t('plotActivityLog.cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                {t('plotActivityLog.delete')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
