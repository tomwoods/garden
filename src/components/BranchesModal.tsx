import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus } from 'lucide-react';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { AutocompleteInput, readAutocompleteCache, writeAutocompleteCache } from './AutocompleteInput';
import { SupabaseService } from '../lib/supabaseService';

export type BranchesSubType = 'bud' | 'notching' | 'capability';

const CAPABILITY_CACHE_PREFIX = 'proven_capacities_cache';

const RUHI_BOOKS = [
  { value: 'ruhi_1', label: 'Ruhi Book 1: Reflections on the Life of the Spirit', sectionsPerUnit: 12 },
  { value: 'ruhi_2', label: 'Ruhi Book 2: Arising to Serve', sectionsPerUnit: 12 },
  { value: 'ruhi_3', label: 'Ruhi Book 3: Teaching Children\'s Classes, Grade 1', sectionsPerUnit: 12 },
  { value: 'ruhi_4', label: 'Ruhi Book 4: The Twin Manifestations', sectionsPerUnit: 12 },
  { value: 'ruhi_5', label: 'Ruhi Book 5: Releasing the Powers of Junior Youth', sectionsPerUnit: 12 },
  { value: 'ruhi_6', label: 'Ruhi Book 6: Teaching the Cause', sectionsPerUnit: 12 },
  { value: 'ruhi_7', label: 'Ruhi Book 7: Walking Together on a Path of Service', sectionsPerUnit: 12 },
  { value: 'ruhi_8', label: 'Ruhi Book 8: The Covenant of Bahá\'u\'lláh', sectionsPerUnit: 18 },
  { value: 'ruhi_9', label: 'Ruhi Book 9: Gaining an Historical Perspective', sectionsPerUnit: 18 },
  { value: 'ruhi_10', label: 'Ruhi Book 10: Building Vibrant Communities', sectionsPerUnit: 18 },
];

const UNITS_PER_BOOK = 3;

function getSectionsPerUnit(bookValue: string): number {
  const book = RUHI_BOOKS.find(b => b.value === bookValue);
  return book?.sectionsPerUnit ?? 12;
}

function getBookIndex(bookValue: string): number {
  return RUHI_BOOKS.findIndex(b => b.value === bookValue);
}

// Convert book+unit+section to a global section number for comparison/subtraction.
// Each unit has sectionsPerUnit sections; each book has UNITS_PER_BOOK units.
// We treat all books as having a single sectionsPerUnit (from the start book) for simplicity
// but handle cross-book ranges conservatively.
function computeSectionsStudied(
  book: string,
  startUnit: number,
  startSection: number,
  endUnit: number,
  endSection: number
): number {
  const spu = getSectionsPerUnit(book);
  const startGlobal = (startUnit - 1) * spu + startSection;
  const endGlobal = (endUnit - 1) * spu + endSection;
  const diff = endGlobal - startGlobal;
  return diff <= 0 ? 1 : diff + 1;
}

interface NotchingFormData {
  book: string;
  startUnit: number;
  startSection: number;
  endUnit: number;
  endSection: number;
  progress_description: string;
}

interface LastNotching {
  book: string;
  end_unit: number;
  end_section: number;
}

interface BranchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  subType: BranchesSubType;
  plantName: string;
  plantId: string;
  editingItem?: any;
  lastNotching?: LastNotching;
  onSubmit: (subType: BranchesSubType, data: any) => Promise<void>;
}

export const BranchesModal: React.FC<BranchesModalProps> = ({
  isOpen,
  onClose,
  subType,
  plantName,
  editingItem,
  lastNotching,
  onSubmit
}) => {
  const { t, i18n } = useTranslation('modals');
  const [budText, setBudText] = useState('');
  const [capabilityText, setCapabilityText] = useState('');
  const [notchingData, setNotchingData] = useState<NotchingFormData>({
    book: 'ruhi_1',
    startUnit: 1,
    startSection: 1,
    endUnit: 1,
    endSection: 1,
    progress_description: ''
  });
  const [showDateTimeField, setShowDateTimeField] = useState(false);
  const [customDateTime, setCustomDateTime] = useState<number>(Date.now());
  const [showDateTimeMenu, setShowDateTimeMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [provenCapacities, setProvenCapacities] = useState<Array<{ id: string; text: string; count: number }>>([]);

  useEffect(() => {
    if (!isOpen) return;

    if (subType === 'capability') {
      const lang = i18n.language;
      const cacheKey = `${CAPABILITY_CACHE_PREFIX}_${lang}`;
      const cached = readAutocompleteCache(cacheKey);
      if (cached.length > 0) setProvenCapacities(cached);
      SupabaseService.fetchTop200ProvenCapacities(lang).then((fresh) => {
        if (fresh.length > 0) {
          setProvenCapacities(fresh);
          writeAutocompleteCache(cacheKey, fresh);
        }
      });
    }

    if (editingItem) {
      if (subType === 'bud') setBudText(editingItem.text || '');
      if (subType === 'capability') setCapabilityText(editingItem.text || '');
      if (subType === 'notching') {
        setNotchingData({
          book: editingItem.book || 'ruhi_1',
          startUnit: editingItem.start_unit || 1,
          startSection: editingItem.start_section || 1,
          endUnit: editingItem.end_unit || 1,
          endSection: editingItem.end_section || 1,
          progress_description: editingItem.progress_description || ''
        });
        if (editingItem.datetime) {
          setShowDateTimeField(true);
          setCustomDateTime(editingItem.datetime);
        }
      }
    } else {
      setBudText('');
      setCapabilityText('');

      if (subType === 'notching' && lastNotching) {
        const spu = getSectionsPerUnit(lastNotching.book);
        let nextSection = lastNotching.end_section + 1;
        let nextUnit = lastNotching.end_unit;
        if (nextSection > spu) {
          nextSection = 1;
          nextUnit = Math.min(lastNotching.end_unit + 1, UNITS_PER_BOOK);
        }
        setNotchingData({
          book: lastNotching.book,
          startUnit: nextUnit,
          startSection: nextSection,
          endUnit: nextUnit,
          endSection: nextSection,
          progress_description: ''
        });
      } else {
        setNotchingData({
          book: 'ruhi_1',
          startUnit: 1,
          startSection: 1,
          endUnit: 1,
          endSection: 1,
          progress_description: ''
        });
      }

      setShowDateTimeField(false);
      setCustomDateTime(Date.now());
      setShowDateTimeMenu(false);
    }
  }, [isOpen, subType, editingItem, lastNotching, i18n.language]);

  const sectionsStudied = computeSectionsStudied(
    notchingData.book,
    notchingData.startUnit,
    notchingData.startSection,
    notchingData.endUnit,
    notchingData.endSection
  );

  const isNotchingComplete =
    notchingData.book &&
    notchingData.startUnit > 0 &&
    notchingData.startSection > 0 &&
    notchingData.endUnit > 0 &&
    notchingData.endSection > 0;

  const handleStartChange = (field: 'unit' | 'section', value: number) => {
    setNotchingData(prev => {
      const updated = { ...prev };
      if (field === 'unit') {
        updated.startUnit = value;
        if (updated.endUnit < value) {
          updated.endUnit = value;
          updated.endSection = prev.startSection;
        }
      } else {
        updated.startSection = value;
        if (updated.endUnit === updated.startUnit && updated.endSection < value) {
          updated.endSection = value;
        }
      }
      return updated;
    });
  };

  const handleBookChange = (bookValue: string) => {
    setNotchingData(prev => ({
      ...prev,
      book: bookValue,
      startUnit: 1,
      startSection: 1,
      endUnit: 1,
      endSection: 1
    }));
  };

  const isFormValid = () => {
    if (subType === 'bud') return budText.trim().length > 0;
    if (subType === 'capability') return capabilityText.trim().length > 0;
    if (subType === 'notching') return isNotchingComplete;
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;
    setIsSubmitting(true);

    try {
      if (subType === 'bud') {
        await onSubmit('bud', { text: budText.trim() });
      } else if (subType === 'capability') {
        const userId = localStorage.getItem('user_id') || '';
        SupabaseService.upsertProvenCapacity(capabilityText.trim(), userId, i18n.language);
        await onSubmit('capability', { text: capabilityText.trim() });
      } else if (subType === 'notching') {
        const datetime = showDateTimeField ? customDateTime : Date.now();
        await onSubmit('notching', {
          datetime,
          book: notchingData.book,
          start_unit: notchingData.startUnit,
          start_section: notchingData.startSection,
          end_unit: notchingData.endUnit,
          end_section: notchingData.endSection,
          sections_studied: sectionsStudied,
          progress_description: notchingData.progress_description || ''
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to save branches entry:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const timestampToDateTimeLocal = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const getConfig = () => {
    if (subType === 'bud') return { title: t('branches.addBud'), emoji: '🌿', description: t('branches.addBudDesc', { name: plantName }) };
    if (subType === 'notching') return { title: t('branches.recordNotching'), emoji: '📖', description: t('branches.notchingDesc', { name: plantName }) };
    return { title: t('branches.recordCapability'), emoji: '✨', description: t('branches.capabilityDesc', { name: plantName }) };
  };

  if (!isOpen) return null;

  const config = getConfig();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100">
              <span className="text-xl">{config.emoji}</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {editingItem
                  ? (subType === 'bud' ? t('branches.editBud') : subType === 'notching' ? t('branches.editNotching') : t('branches.editCapability'))
                  : config.title}
              </h2>
              <p className="text-sm text-gray-600">{config.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative">
            {subType === 'notching' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDateTimeMenu(!showDateTimeMenu)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {showDateTimeMenu && (
                  <AdditionalInfoMenu
                    mode="datetime"
                    onSetDateTime={() => { setShowDateTimeField(true); setShowDateTimeMenu(false); }}
                    onClose={() => setShowDateTimeMenu(false)}
                  />
                )}
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* BUD FORM */}
          {subType === 'bud' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('branches.budLabel')}
              </label>
              <input
                type="text"
                value={budText}
                onChange={e => setBudText(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors"
                placeholder={t('branches.budPlaceholder')}
                required
                autoFocus
              />
            </div>
          )}

          {/* CAPABILITY FORM */}
          {subType === 'capability' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('branches.capabilityLabel')}
              </label>
              <AutocompleteInput
                value={capabilityText}
                onChange={setCapabilityText}
                values={provenCapacities}
                placeholder={t('branches.capabilityPlaceholder')}
                accentColor="emerald"
                required
              />
            </div>
          )}

          {/* NOTCHING FORM */}
          {subType === 'notching' && (
            <>
              {showDateTimeField && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('branches.dateTime')}</label>
                  <input
                    type="datetime-local"
                    value={timestampToDateTimeLocal(customDateTime)}
                    onChange={e => setCustomDateTime(new Date(e.target.value).getTime())}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors"
                  />
                </div>
              )}

              {/* Session Start */}
              <div className="bg-amber-50 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-amber-800">{t('branches.sessionStart')}</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('branches.bookLabel')}</label>
                  <select
                    value={notchingData.book}
                    onChange={e => handleBookChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm"
                  >
                    {RUHI_BOOKS.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('branches.unitLabel')}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      max={UNITS_PER_BOOK}
                      value={notchingData.startUnit}
                      onChange={e => handleStartChange('unit', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('branches.sectionLabel')}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      max={getSectionsPerUnit(notchingData.book)}
                      value={notchingData.startSection}
                      onChange={e => handleStartChange('section', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Session End */}
              <div className="bg-amber-50 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-amber-800">{t('branches.sessionEnd')}</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('branches.bookLabelEnd')}</label>
                  <select
                    value={notchingData.book}
                    disabled
                    className="w-full px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                  >
                    {RUHI_BOOKS.map(b => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{t('branches.sameBook')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('branches.unitLabel')}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      max={UNITS_PER_BOOK}
                      value={notchingData.endUnit}
                      onChange={e => setNotchingData(prev => ({ ...prev, endUnit: parseInt(e.target.value) || prev.startUnit }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('branches.sectionLabel')}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      max={getSectionsPerUnit(notchingData.book)}
                      value={notchingData.endSection}
                      onChange={e => setNotchingData(prev => ({ ...prev, endSection: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Summary */}
              {isNotchingComplete && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <span className="text-amber-700 text-sm font-medium">{t('branches.totalSections')}</span>
                  <span className="text-amber-900 font-semibold text-sm">{t('branches.aboutSections', { count: sectionsStudied, unit: sectionsStudied === 1 ? t('branches.section') : t('branches.sections') })}</span>
                </div>
              )}

              {/* Progress description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('branches.progressLabel')}</label>
                <textarea
                  value={notchingData.progress_description}
                  onChange={e => setNotchingData(prev => ({ ...prev, progress_description: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors resize-none"
                  rows={3}
                  placeholder={t('branches.progressPlaceholder')}
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            >
              {t('branches.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? t('branches.savingBtn') : (editingItem ? t('branches.updateBtn') : t('branches.saveBtn'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
