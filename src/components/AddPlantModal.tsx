import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User, Phone, FileText, Plus } from 'lucide-react';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { LocationPicker } from './LocationPicker';
import { PlantImageCapture } from './PlantImageCapture';
import { AgePicker } from './AgePicker';
import { ImportContactModal } from './ImportContactModal';
import { parseVCardFile } from '../lib/vCardParser';
import type { ParsedContact } from '../lib/vCardParser';
import type { AgeInfo } from '../lib/harvestService';

interface AddPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (plantData: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    additional_info?: string;
  }, images?: string[]) => Promise<void>;
}

export const AddPlantModal: React.FC<AddPlantModalProps> = ({
  isOpen,
  onClose,
  onAdd
}) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    description: '',
    care_frequency_multiplier: 2,
    care_frequency_unit: 'weeks' as 'days' | 'weeks'
  });
  const [additionalInfo, setAdditionalInfo] = useState<any>({});
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showAgePicker, setShowAgePicker] = useState(false);
  const [ageInfo, setAgeInfo] = useState<AgeInfo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showImageCapture, setShowImageCapture] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [importContacts, setImportContacts] = useState<ParsedContact[] | null>(null);
  const vcfInputRef = useRef<HTMLInputElement>(null);

  const { t } = useTranslation('modals');
  const hasContactPicker = typeof (navigator as any).contacts !== 'undefined';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const info = { ...additionalInfo };
      if (ageInfo) {
        info.age_info = ageInfo;
      }
      const additionalInfoJson = Object.keys(info).length > 0
        ? JSON.stringify(info)
        : undefined;

      await onAdd({
        name: formData.name.trim(),
        phone: formData.phone.trim() || undefined,
        description: formData.description.trim() || undefined,
        care_frequency_multiplier: formData.care_frequency_multiplier,
        care_frequency_unit: formData.care_frequency_unit,
        additional_info: additionalInfoJson
      }, capturedImages.length > 0 ? capturedImages : undefined);
      setFormData({
        name: '',
        phone: '',
        description: '',
        care_frequency_multiplier: 2,
        care_frequency_unit: 'weeks'
      });
      setAdditionalInfo({});
      setAgeInfo(null);
      setCapturedImages([]);
      onClose();
    } catch (error) {
      console.error('Failed to add plant:', error);
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

  const handleAgeChange = (info: AgeInfo | null) => {
    setAgeInfo(info);
  };

  const handleVcfFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const contacts = parseVCardFile(text);
      if (contacts.length === 0) return;
      setImportContacts(contacts);
    } catch {
      // silently ignore parse errors
    } finally {
      if (vcfInputRef.current) vcfInputRef.current.value = '';
    }
  };

  const handleImportFromFile = () => {
    vcfInputRef.current?.click();
  };

  const handleImportFromPicker = async () => {
    try {
      const cm = (navigator as any).contacts;
      const results = await cm.select(['name', 'tel', 'email', 'note'], { multiple: false });
      if (!results || results.length === 0) return;
      const raw = results[0];
      const name = Array.isArray(raw.name) ? raw.name[0] : (raw.name ?? '');
      if (!name) return;
      const phone = Array.isArray(raw.tel) ? raw.tel[0] : (raw.tel ?? undefined);
      const email = Array.isArray(raw.email) ? raw.email[0] : (raw.email ?? undefined);
      const note = Array.isArray(raw.note) ? raw.note[0] : (raw.note ?? undefined);
      setImportContacts([{ name, phone, email, note }]);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Could not open contacts', err);
      }
    }
  };

  const handleConfirmContactImport = async (contact: ParsedContact & {
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    photoDataUrl?: string;
  }) => {
    await onAdd({
      name: contact.name,
      phone: contact.phone,
      description: contact.note,
      care_frequency_multiplier: contact.care_frequency_multiplier,
      care_frequency_unit: contact.care_frequency_unit,
    }, contact.photoDataUrl ? [contact.photoDataUrl] : undefined);
    setImportContacts(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🌱</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('addPlant.title')}</h2>
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
            {showMenu && (
              <AdditionalInfoMenu
                mode="all"
                onAddLocation={() => setShowLocationPicker(true)}
                onSetAge={() => setShowAgePicker(true)}
                onAddImage={() => {
                  setShowMenu(false);
                  setShowImageCapture(true);
                }}
                onImportContact={handleImportFromFile}
                onImportFromPicker={hasContactPicker ? handleImportFromPicker : undefined}
                hasLocation={!!additionalInfo.location}
                hasAge={!!ageInfo}
                hasImages={capturedImages.length > 0}
                onClose={() => setShowMenu(false)}
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
                  min="1"
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
          {additionalInfo.location && (
            <div className="p-3 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-2 text-blue-700">
                <span className="text-sm font-medium">📍 {t('addPlant.locationAdded')}</span>
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {additionalInfo.location.lat.toFixed(6)}, {additionalInfo.location.lng.toFixed(6)}
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
          {capturedImages.length > 0 && (
            <div
              onClick={() => setShowImageCapture(true)}
              className="cursor-pointer group"
            >
              <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-green-200 group-hover:border-green-400 transition-colors duration-200">
                <img
                  src={capturedImages[0]}
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
              {t('addPlant.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={!formData.name.trim() || isSubmitting}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? t('addPlant.submittingBtn') : t('addPlant.submitBtn')}
            </button>
          </div>
        </form>
      </div>
      </div>

      {/* Hidden file input for vCard import */}
      <input
        ref={vcfInputRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        onChange={handleVcfFileChange}
        className="hidden"
      />

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          location={additionalInfo.location}
          onLocationChange={handleLocationChange}
          onClose={() => setShowLocationPicker(false)}
        />
      )}

      {/* Age Picker Modal */}
      {showAgePicker && (
        <AgePicker
          ageInfo={ageInfo ?? undefined}
          onAgeChange={handleAgeChange}
          onClose={() => setShowAgePicker(false)}
        />
      )}

      {/* Image Capture Modal */}
      {showImageCapture && (
        <PlantImageCapture
          plantId={null}
          plantName={formData.name || 'New Plant'}
          image={capturedImages[0] ?? null}
          onImageChange={(img) => setCapturedImages(img ? [img] : [])}
          onClose={() => setShowImageCapture(false)}
        />
      )}

      {/* Import Contact Modal */}
      {importContacts && (
        <ImportContactModal
          contacts={importContacts}
          onConfirm={handleConfirmContactImport}
          onClose={() => setImportContacts(null)}
        />
      )}
    </>
  );
};
