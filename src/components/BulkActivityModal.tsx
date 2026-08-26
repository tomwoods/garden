import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Camera, Trash2 } from 'lucide-react';
import { PlantSelectorChecklist } from './PlantSelectorChecklist';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { CropModal } from './CropModal';
import { resizeImage } from '../lib/imageProcessing';
import type { Plant } from '../lib/database';

interface BulkActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  plotName: string;
  plants: Plant[];
  activityType: 'tending' | 'watering' | 'sunlight' | 'fruit';
  onSubmit: (data: any, selectedPlantIds: string[], images: string[]) => Promise<void>;
}

export const BulkActivityModal: React.FC<BulkActivityModalProps> = ({
  isOpen,
  onClose,
  plotName,
  plants,
  activityType,
  onSubmit
}) => {
  const [formData, setFormData] = useState<any>({});
  const [additionalInfo, setAdditionalInfo] = useState<any>({});
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set(plants.map(p => p.id)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showDateTimeField, setShowDateTimeField] = useState(false);
  const [customDateTime, setCustomDateTime] = useState<number>(Date.now());
  const { t } = useTranslation('modals');
  const [showDateTimeMenu, setShowDateTimeMenu] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      // Reset form data and select all plants by default
      const defaultData: any = {
        type: activityType === 'tending' ? 'conversation' : '',
        summary: '',
        source: '',
        progress_description: '',
        topic: '',
        description: ''
      };
      setFormData(defaultData);
      setAdditionalInfo({});
      setSelectedPlantIds(new Set(plants.map(p => p.id)));
      setShowCustomInput(false);
      setShowDateTimeField(false);
      setCustomDateTime(Date.now());
      setShowDateTimeMenu(false);
      setImages([]);
      setCropSrc(null);
    }
  }, [isOpen, activityType, plants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlantIds.size === 0) return;

    setIsSubmitting(true);
    try {
      const additionalInfoJson = Object.keys(additionalInfo).length > 0
        ? JSON.stringify(additionalInfo)
        : undefined;

      const submitData = {
        ...formData,
        additional_info: additionalInfoJson,
        datetime: showDateTimeField ? customDateTime : Date.now()
      };

      await onSubmit(submitData, Array.from(selectedPlantIds), images);
      onClose();
    } catch (error) {
      console.error('Failed to save bulk activity:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    if (field === 'type' && activityType === 'tending') {
      if (value === 'other') {
        setShowCustomInput(true);
        setFormData((prev: any) => ({ ...prev, [field]: '' }));
      } else {
        setShowCustomInput(false);
        setFormData((prev: any) => ({ ...prev, [field]: value }));
      }
    } else {
      setFormData((prev: any) => ({ ...prev, [field]: value }));
    }
  };

  // Convert timestamp to datetime-local format (YYYY-MM-DDTHH:mm)
  const timestampToDateTimeLocal = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Convert datetime-local format to timestamp
  const dateTimeLocalToTimestamp = (dateTimeLocal: string): number => {
    return new Date(dateTimeLocal).getTime();
  };

  const handleSetDateTime = () => {
    setShowDateTimeField(true);
  };

  const handleAddImage = () => {
    if (images.length >= 4) return;
    fileInputRef.current?.click();
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) resolve(e.target.result as string);
        else reject(new Error('Failed to read file'));
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const dataUrl = await readFileAsDataUrl(files[0]);
      setCropSrc(dataUrl);
    } catch {
      // silently ignore
    }
    e.target.value = '';
  };

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) resolve(reader.result as string);
        else reject(new Error('FileReader produced empty result'));
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });

  const handleCropConfirm = async (blob: Blob) => {
    try {
      const rawDataUrl = await blobToDataUrl(blob);
      const dataUrl = await resizeImage(rawDataUrl, 720);
      setImages(prev => [...prev, dataUrl].slice(0, 4));
    } catch {
      // silently ignore
    }
    setCropSrc(null);
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  const getActivityConfig = () => {
    const configs = {
      tending: { title: t('bulkActivity.groupTending'), emoji: '🪴', description: t('bulkActivity.groupTendingDesc') },
      watering: { title: t('bulkActivity.groupWatering'), emoji: '🚿', description: t('bulkActivity.groupWateringDesc') },
      sunlight: { title: t('bulkActivity.groupSunlight'), emoji: '☀️', description: t('bulkActivity.groupSunlightDesc') },
      fruit: { title: t('bulkActivity.groupFruit'), emoji: '🍎', description: t('bulkActivity.groupFruitDesc') }
    };
    return configs[activityType];
  };

  const config = getActivityConfig();

  const renderFormFields = () => {
    const dateTimeField = showDateTimeField && (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('bulkActivity.dateTime')}
        </label>
        <input
          type="datetime-local"
          value={timestampToDateTimeLocal(customDateTime)}
          onChange={(e) => setCustomDateTime(dateTimeLocalToTimestamp(e.target.value))}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
        />
      </div>
    );

    switch (activityType) {
      case 'tending':
        return (
          <>
            {dateTimeField}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('bulkActivity.interactionTypeRequired')}
              </label>
              {!showCustomInput ? (
                <select
                  value={formData.type || 'conversation'}
                  onChange={(e) => handleChange('type', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  required
                >
                  <option value="conversation">{t('bulkActivity.groupConversation')}</option>
                  <option value="coffee">{t('bulkActivity.groupCoffee')}</option>
                  <option value="meal">{t('bulkActivity.groupMeal')}</option>
                  <option value="call">{t('bulkActivity.groupCall')}</option>
                  <option value="activity">{t('bulkActivity.groupActivity')}</option>
                  <option value="other">{t('activity.interactionTypes.other')}</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.type || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, type: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  placeholder={t('bulkActivity.customPlaceholder')}
                  required
                />
              )}
              {showCustomInput && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomInput(false);
                    setFormData((prev: any) => ({ ...prev, type: 'conversation' }));
                  }}
                  className="mt-2 text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  {t('bulkActivity.backToOptions')}
                </button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('bulkActivity.summary')}
              </label>
              <textarea
                value={formData.summary || ''}
                onChange={(e) => handleChange('summary', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder={t('bulkActivity.summaryPlaceholder')}
              />
            </div>
          </>
        );

      case 'watering':
        return (
          <>
            {dateTimeField}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('bulkActivity.learningSourceRequired')}
              </label>
              <input
                type="text"
                value={formData.source || ''}
                onChange={(e) => handleChange('source', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder={t('bulkActivity.learningSourcePlaceholder')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('bulkActivity.progressDesc')}
              </label>
              <textarea
                value={formData.progress_description || ''}
                onChange={(e) => handleChange('progress_description', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder={t('bulkActivity.progressPlaceholder')}
              />
            </div>
          </>
        );

      case 'sunlight':
        return (
          <>
            {dateTimeField}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('bulkActivity.prayerTopicRequired')}
              </label>
            <textarea
              value={formData.topic || ''}
              onChange={(e) => handleChange('topic', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors resize-none"
              rows={3}
              placeholder={t('bulkActivity.prayerTopicPlaceholder')}
              required
            />
            </div>
          </>
        );

      case 'fruit':
        return (
          <>
            {dateTimeField}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('bulkActivity.serviceDescRequired')}
              </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors resize-none"
              rows={3}
              placeholder={t('bulkActivity.serviceDescPlaceholder')}
              required
            />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const isFormValid = () => {
    if (selectedPlantIds.size === 0) return false;
    
    switch (activityType) {
      case 'tending':
        return formData.type;
      case 'watering':
        return formData.source;
      case 'sunlight':
        return formData.topic;
      case 'fruit':
        return formData.description;
      default:
        return false;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100">
              <span className="text-xl">{config.emoji}</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {config.title}
              </h2>
              <p className="text-sm text-gray-600">
                {config.description} for {plotName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              type="button"
              onClick={() => setShowDateTimeMenu(!showDateTimeMenu)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
            {showDateTimeMenu && (
              <AdditionalInfoMenu
                mode="plotActivity"
                onSetDateTime={handleSetDateTime}
                onAddImage={handleAddImage}
                onClose={() => setShowDateTimeMenu(false)}
              />
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {renderFormFields()}

          {/* Plant Selection */}
          <PlantSelectorChecklist
            plants={plants}
            selectedPlantIds={selectedPlantIds}
            onSelectionChange={setSelectedPlantIds}
          />

          {/* Image Thumbnails */}
          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img}
                    alt={`Activity image ${idx + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            >
              {t('bulkActivity.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? t('bulkActivity.savingBtn') : t('bulkActivity.logForPlants', { count: selectedPlantIds.size })}
            </button>
          </div>
        </form>
      </div>
      </div>

      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  );
};