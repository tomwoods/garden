import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User, Phone, Mail, FileText, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { CropModal } from './CropModal';
import { uploadService } from '../lib/uploadService';
import type { ParsedContact } from '../lib/vCardParser';

interface ImportContactModalProps {
  contacts: ParsedContact[];
  onConfirm: (contact: ParsedContact & {
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    photoDataUrl?: string;
  }) => Promise<void>;
  onClose: () => void;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) resolve(reader.result as string);
      else reject(new Error('FileReader produced empty result'));
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

export const ImportContactModal: React.FC<ImportContactModalProps> = ({
  contacts,
  onConfirm,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showList, setShowList] = useState(contacts.length > 1);
  const [formData, setFormData] = useState(() => {
    const c = contacts[0] ?? { name: '', phone: '', email: '', note: '' };
    return {
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      description: c.note ?? '',
      care_frequency_multiplier: 2,
      care_frequency_unit: 'weeks' as 'days' | 'weeks',
    };
  });

  // Photo state
  const [pendingPhotoSrc, setPendingPhotoSrc] = useState<string | null>(
    () => contacts[0]?.photoDataUrl ?? null
  );
  const [croppedPhoto, setCroppedPhoto] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState<boolean>(() => !!contacts[0]?.photoDataUrl);

  const { t } = useTranslation('modals');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quotaInfo = uploadService.getQuotaInfo();

  const selectContact = (index: number) => {
    const c = contacts[index];
    setSelectedIndex(index);
    setFormData(prev => ({
      ...prev,
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      description: c.note ?? '',
    }));

    const photo = c.photoDataUrl ?? null;
    setPendingPhotoSrc(photo);
    setCroppedPhoto(null);
    setShowCrop(!!photo);
    setShowList(false);
  };

  const handleCropConfirm = async (blob: Blob) => {
    const dataUrl = await blobToDataUrl(blob);
    setCroppedPhoto(dataUrl);
    setShowCrop(false);
  };

  const handleCropCancel = () => {
    setPendingPhotoSrc(null);
    setCroppedPhoto(null);
    setShowCrop(false);
  };

  const handleRemovePhoto = () => {
    setPendingPhotoSrc(null);
    setCroppedPhoto(null);
    setShowCrop(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setIsSubmitting(true);
    try {
      await onConfirm({
        name: formData.name.trim(),
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        note: formData.description.trim() || undefined,
        care_frequency_multiplier: formData.care_frequency_multiplier,
        care_frequency_unit: formData.care_frequency_unit,
        photoDataUrl: croppedPhoto ?? undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectivePhoto = croppedPhoto;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{t('importContact.title')}</h2>
                {contacts.length > 1 && (
                  <p className="text-xs text-gray-500">{t('importContact.contactsFound', { count: contacts.length })}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Contact selector when multiple contacts */}
          {contacts.length > 1 && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowList(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 hover:bg-green-100 transition-colors"
              >
                <span className="font-medium">{contacts[selectedIndex].name}</span>
                {showList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showList && (
                <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-md">
                  {contacts.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectContact(i)}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-green-50 ${
                        i === selectedIndex ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-700'
                      } ${i > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <div className="font-medium">{c.name}</div>
                      {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Photo thumbnail (shown after cropping) */}
            {effectivePhoto && (
              <div className="flex items-center gap-3">
                <div className="relative group w-24 h-24 flex-shrink-0">
                  <img
                    src={effectivePhoto}
                    alt="Contact photo"
                    className="w-24 h-24 object-cover rounded-xl border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {t('importContact.photoFromContact')}{' '}
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="text-red-500 hover:text-red-700 underline"
                  >
                    {t('importContact.removePhoto')}
                  </button>
                </p>
              </div>
            )}

            {/* Quota warning if photo present but quota full */}
            {pendingPhotoSrc && !effectivePhoto && !showCrop && quotaInfo.hasReachedLimit && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                {t('importContact.imageQuotaFull')}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                {t('importContact.nameLabel')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                placeholder={t('importContact.namePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="w-4 h-4 inline mr-1" />
                {t('importContact.phoneLabel')}
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                placeholder={t('importContact.phonePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-1" />
                {t('importContact.emailLabel')}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                placeholder={t('importContact.emailPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                {t('importContact.notesLabel')}
              </label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
                placeholder={t('importContact.notesPlaceholder')}
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('importContact.careFrequency')}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  max="52"
                  value={formData.care_frequency_multiplier}
                  onChange={e => setFormData(p => ({
                    ...p,
                    care_frequency_multiplier: parseInt(e.target.value) || 1,
                  }))}
                  className="w-16 px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-center"
                />
                <select
                  value={formData.care_frequency_unit}
                  onChange={e => setFormData(p => ({
                    ...p,
                    care_frequency_unit: e.target.value as 'days' | 'weeks',
                  }))}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                >
                  <option value="days">{t('addPlant.days')}</option>
                  <option value="weeks">{t('addPlant.weeks')}</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
              >
                {t('importContact.discardBtn')}
              </button>
              <button
                type="submit"
                disabled={!formData.name.trim() || isSubmitting}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
              >
                {isSubmitting ? t('importContact.submittingBtn') : t('importContact.submitBtn')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Crop modal — layered above the import modal */}
      {showCrop && pendingPhotoSrc && (
        <CropModal
          imageSrc={pendingPhotoSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
};
