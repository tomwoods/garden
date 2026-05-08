import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, FileText, Plus } from 'lucide-react';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { LocationPicker } from './LocationPicker';
import type { Plot } from '../lib/database';

interface AddEditPlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  plot?: Plot | null;
  onSave: (plotData: { name: string; description?: string; additional_info?: string }) => Promise<void>;
}

export const AddEditPlotModal: React.FC<AddEditPlotModalProps> = ({
  isOpen,
  onClose,
  plot,
  onSave
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const { t } = useTranslation('modals');
  const [additionalInfo, setAdditionalInfo] = useState<any>({});
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showAdditionalInfoMenu, setShowAdditionalInfoMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when plot changes
  useEffect(() => {
    if (isOpen) {
      setShowAdditionalInfoMenu(false);
      if (plot) {
        setFormData({
          name: plot.name || '',
          description: plot.description || ''
        });
        
        // Parse additional_info if it exists
        if (plot.additional_info) {
          try {
            setAdditionalInfo(JSON.parse(plot.additional_info));
          } catch (error) {
            console.error('Failed to parse additional_info:', error);
            setAdditionalInfo({});
          }
        } else {
          setAdditionalInfo({});
        }
      } else {
        setFormData({
          name: '',
          description: ''
        });
        setAdditionalInfo({});
      }
    }
  }, [plot, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const additionalInfoJson = Object.keys(additionalInfo).length > 0 
        ? JSON.stringify(additionalInfo) 
        : undefined;

      await onSave({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        additional_info: additionalInfoJson
      });
      onClose();
    } catch (error) {
      console.error('Failed to save plot:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLocationChange = (location: { lat: number; lng: number } | null) => {
    if (location) {
      setAdditionalInfo((prev: any) => ({ ...prev, location }));
    } else {
      const { location: _, ...rest } = additionalInfo;
      setAdditionalInfo(rest);
    }
  };

  if (!isOpen) return null;

  const isEditing = !!plot;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <img src="/plots_icon.svg" alt="Plot" className="w-5 h-5" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {isEditing ? t('addEditPlot.editTitle') : t('addEditPlot.createTitle')}
            </h2>
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              type="button"
              onClick={() => setShowAdditionalInfoMenu(!showAdditionalInfoMenu)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
            {showAdditionalInfoMenu && (
              <AdditionalInfoMenu
                mode="location"
                onAddLocation={() => {
                  setShowLocationPicker(true);
                  setShowAdditionalInfoMenu(false);
                }}
                hasLocation={!!additionalInfo.location}
                onClose={() => setShowAdditionalInfoMenu(false)}
              />
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <img src="/plots_icon.svg" alt="Plot" className="w-4 h-4 inline mr-1" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
              {t('addEditPlot.plotNameLabel')}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
              placeholder={t('addEditPlot.plotNamePlaceholder')}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              {t('addEditPlot.descriptionLabel')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
              placeholder={t('addEditPlot.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          {/* Location Display */}
          {additionalInfo.location && (
            <div className="p-3 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-2 text-blue-700">
                <span className="text-sm font-medium">📍 {t('addEditPlot.locationAdded')}</span>
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {additionalInfo.location.lat.toFixed(6)}, {additionalInfo.location.lng.toFixed(6)}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            >
              {t('addEditPlot.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={!formData.name.trim() || isSubmitting}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting
                ? (isEditing ? t('addEditPlot.updatingBtn') : t('addEditPlot.creatingBtn'))
                : (isEditing ? t('addEditPlot.updateBtn') : t('addEditPlot.createBtn'))}
            </button>
          </div>
        </form>
      </div>
      </div>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          location={additionalInfo.location}
          onLocationChange={handleLocationChange}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </>
  );
};