import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User, Phone, FileText, Plus } from 'lucide-react';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { LocationPicker } from './LocationPicker';
import { PlantImageCapture } from './PlantImageCapture';
import { AgePicker } from './AgePicker';
import { DatabaseService } from '../lib/database';
import type { Plant } from '../lib/database';
import type { AgeInfo } from '../lib/harvestService';
import { getSharedImageLocally, type SharedImageUser } from '../lib/sharedImageSync';
import type { SharedGardenRef } from '../lib/sharedGardenDatabase';

interface EditPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant | null;
  onUpdate: (plantId: string, updates: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    additional_info?: string;
  }) => Promise<void>;
  sharedGardenRef?: SharedGardenRef | null;
  sharedUser?: SharedImageUser | null;
}

export const EditPlantModal: React.FC<EditPlantModalProps> = ({
  isOpen,
  onClose,
  plant,
  onUpdate,
  sharedGardenRef,
  sharedUser,
}) => {
  const isShared = !!(sharedGardenRef && sharedUser);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    description: '',
    care_frequency_multiplier: 2,
    care_frequency_unit: 'weeks' as 'days' | 'weeks'
  });
  const { t } = useTranslation('modals');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdditionalInfoMenu, setShowAdditionalInfoMenu] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showAgePicker, setShowAgePicker] = useState(false);
  const [ageInfo, setAgeInfo] = useState<AgeInfo | null>(null);
  const [showImageCapture, setShowImageCapture] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  // Populate form when plant changes
  useEffect(() => {
    if (plant && isOpen) {
      setFormData({
        name: plant.name || '',
        phone: plant.phone || '',
        description: plant.description || '',
        care_frequency_multiplier: plant.care_frequency_multiplier || 2,
        care_frequency_unit: plant.care_frequency_unit || 'weeks'
      });

      if (plant.additional_info) {
        try {
          const additionalInfo = JSON.parse(plant.additional_info);
          setLocation(additionalInfo.location || null);
          setAgeInfo(additionalInfo.age_info || null);
        } catch {
          setLocation(null);
          setAgeInfo(null);
        }
      } else {
        setLocation(null);
        setAgeInfo(null);
      }

      // Load existing images
      if (isShared && sharedGardenRef) {
        const cached = getSharedImageLocally(sharedGardenRef.gardenId, plant.id);
        setImages(cached ? [cached] : []);
      } else {
        const existingImages = DatabaseService.getImagesForPlant(plant.id);
        setImages(existingImages);
      }
    }
  }, [plant, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !plant) return;

    setIsSubmitting(true);
    try {
      const hoursInUnit = formData.care_frequency_unit === 'weeks' ? 168 : 24;
      const nextCareTimestamp = plant.last_cared_for + (formData.care_frequency_multiplier * hoursInUnit * 60 * 60 * 1000);

      let additionalInfo: Record<string, unknown> = {};
      if (plant.additional_info) {
        try {
          additionalInfo = JSON.parse(plant.additional_info);
        } catch {}
      }
      if (location) {
        additionalInfo.location = location;
      } else {
        delete additionalInfo.location;
      }
      if (ageInfo) {
        additionalInfo.age_info = ageInfo;
      } else {
        delete additionalInfo.age_info;
      }

      await onUpdate(plant.id, {
        name: formData.name.trim(),
        phone: formData.phone.trim() || undefined,
        description: formData.description.trim() || undefined,
        care_frequency_multiplier: formData.care_frequency_multiplier,
        care_frequency_unit: formData.care_frequency_unit,
        additional_info: Object.keys(additionalInfo).length > 0 ? JSON.stringify(additionalInfo) : undefined,
        next_scheduled_care: nextCareTimestamp
      });
      onClose();
    } catch (err) {
      console.error('Failed to update plant:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen || !plant) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🌱</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('editPlant.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAdditionalInfoMenu(!showAdditionalInfoMenu)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <Plus className="w-5 h-5" />
              </button>
              {showAdditionalInfoMenu && (
                <AdditionalInfoMenu
                  mode="all"
                  onAddLocation={() => {
                    setShowAdditionalInfoMenu(false);
                    setShowLocationPicker(true);
                  }}
                  onSetAge={() => {
                    setShowAdditionalInfoMenu(false);
                    setShowAgePicker(true);
                  }}
                  onAddImage={() => {
                    setShowAdditionalInfoMenu(false);
                    setShowImageCapture(true);
                  }}
                  onClose={() => setShowAdditionalInfoMenu(false)}
                  hasLocation={location !== null}
                  hasAge={ageInfo !== null}
                  hasImages={images.length > 0}
                />
              )}
            </div>
            <button
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
              <User className="w-4 h-4 inline mr-1" />
              {t('addPlant.nameLabel')}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
              placeholder={t('addPlant.namePlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="w-4 h-4 inline mr-1" />
                {t('addPlant.phone')}
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                placeholder={t('addPlant.phonePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('addPlant.careFrequency')}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  max="52"
                  value={formData.care_frequency_multiplier}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    care_frequency_multiplier: parseInt(e.target.value) || 1
                  }))}
                  className="w-16 px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-center"
                />
                <select
                  value={formData.care_frequency_unit}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    care_frequency_unit: e.target.value as 'days' | 'weeks'
                  }))}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                >
                  <option value="days">{t('addPlant.days')}</option>
                  <option value="weeks">{t('addPlant.weeks')}</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              {t('addPlant.description')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
              placeholder={t('addPlant.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          {/* Location Display */}
          {location && (
            <div className="p-3 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-2 text-blue-700">
                <span className="text-sm font-medium">📍 {t('addPlant.locationAdded')}</span>
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </div>
            </div>
          )}

          {/* Age Display */}
          {ageInfo && (
            <div className="p-3 bg-green-50 rounded-xl">
              <div className="flex items-center gap-2 text-green-700">
                <span className="text-sm font-medium">
                  {ageInfo.is_over_21 ? t('addPlant.ageOlder') : t('addPlant.age', { age: ageInfo.age })}
                </span>
              </div>
            </div>
          )}

          {/* Images Display */}
          {images.length > 0 && (
            <div
              onClick={() => setShowImageCapture(true)}
              className="cursor-pointer group"
            >
              <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-green-200 group-hover:border-green-400 transition-colors duration-200">
                <img
                  src={images[0]}
                  alt="Plant image"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
                  <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {t('addPlant.editImage')}
                  </span>
                </div>
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
              {t('editPlant.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={!formData.name.trim() || isSubmitting}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? t('editPlant.submittingBtn') : t('editPlant.submitBtn')}
            </button>
          </div>
        </form>

        {/* Location Picker */}
        {showLocationPicker && (
          <LocationPicker
            location={location || undefined}
            onLocationChange={(loc) => {
              setLocation(loc);
              setShowLocationPicker(false);
            }}
            onClose={() => setShowLocationPicker(false)}
          />
        )}

        {/* Age Picker */}
        {showAgePicker && (
          <AgePicker
            ageInfo={ageInfo ?? undefined}
            onAgeChange={(info) => setAgeInfo(info)}
            onClose={() => setShowAgePicker(false)}
          />
        )}

        {/* Image Capture Modal */}
        {showImageCapture && plant && (
          <PlantImageCapture
            plantId={plant.id}
            plantName={plant.name}
            image={images[0] ?? null}
            onImageChange={(img) => setImages(img ? [img] : [])}
            onClose={() => setShowImageCapture(false)}
            sharedGardenRef={sharedGardenRef}
            sharedUser={sharedUser}
          />
        )}
      </div>
    </div>
  );
};
