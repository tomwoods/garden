import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus } from 'lucide-react';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { PlantSelectorChecklist } from './PlantSelectorChecklist';
import type { Plant } from '../lib/database';
import { RUHI_BOOKS, getSectionsPerUnit } from '../lib/ruhiBooks';

const UNITS_PER_BOOK = 3;

function computeSectionsStudied(book: string, su: number, ss: number, eu: number, es: number): number {
  const spu = getSectionsPerUnit(book);
  const start = (su - 1) * spu + ss;
  const end = (eu - 1) * spu + es;
  const diff = end - start;
  return diff <= 0 ? 1 : diff + 1;
}

interface LastNotching {
  book: string;
  end_unit: number;
  end_section: number;
}

interface BulkNotchingModalProps {
  isOpen: boolean;
  onClose: () => void;
  plotName: string;
  plants: Plant[];
  lastNotching?: LastNotching;
  onSubmit: (data: any, selectedPlantIds: string[]) => Promise<void>;
}

export const BulkNotchingModal: React.FC<BulkNotchingModalProps> = ({
  isOpen,
  onClose,
  plotName,
  plants,
  lastNotching,
  onSubmit
}) => {
  const [book, setBook] = useState('ruhi_1');
  const [startUnit, setStartUnit] = useState(1);
  const [startSection, setStartSection] = useState(1);
  const [endUnit, setEndUnit] = useState(1);
  const [endSection, setEndSection] = useState(1);
  const [progressDescription, setProgressDescription] = useState('');
  const [showDateTimeField, setShowDateTimeField] = useState(false);
  const [customDateTime, setCustomDateTime] = useState<number>(Date.now());
  const [showDateTimeMenu, setShowDateTimeMenu] = useState(false);
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set(plants.map(p => p.id)));
  const { t } = useTranslation('modals');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      if (lastNotching) {
        const spu = getSectionsPerUnit(lastNotching.book);
        let nextSection = lastNotching.end_section + 1;
        let nextUnit = lastNotching.end_unit;
        if (nextSection > spu) {
          nextSection = 1;
          nextUnit = Math.min(lastNotching.end_unit + 1, UNITS_PER_BOOK);
        }
        setBook(lastNotching.book);
        setStartUnit(nextUnit); setStartSection(nextSection);
        setEndUnit(nextUnit); setEndSection(nextSection);
      } else {
        setBook('ruhi_1');
        setStartUnit(1); setStartSection(1);
        setEndUnit(1); setEndSection(1);
      }
      setProgressDescription('');
      setShowDateTimeField(false);
      setCustomDateTime(Date.now());
      setShowDateTimeMenu(false);
      setSelectedPlantIds(new Set(plants.map(p => p.id)));
    }
  }, [isOpen, plants, lastNotching]);

  const sectionsStudied = computeSectionsStudied(book, startUnit, startSection, endUnit, endSection);
  const isComplete = book && startUnit > 0 && startSection > 0 && endUnit > 0 && endSection > 0 && selectedPlantIds.size > 0;

  const handleStartChange = (field: 'unit' | 'section', value: number) => {
    if (field === 'unit') {
      setStartUnit(value);
      if (endUnit < value) { setEndUnit(value); setEndSection(startSection); }
    } else {
      setStartSection(value);
      if (endUnit === startUnit && endSection < value) setEndSection(value);
    }
  };

  const handleBookChange = (v: string) => {
    setBook(v);
    setStartUnit(1); setStartSection(1);
    setEndUnit(1); setEndSection(1);
  };

  const timestampToDateTimeLocal = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        datetime: showDateTimeField ? customDateTime : Date.now(),
        book,
        start_unit: startUnit,
        start_section: startSection,
        end_unit: endUnit,
        end_section: endSection,
        sections_studied: sectionsStudied,
        progress_description: progressDescription
      }, Array.from(selectedPlantIds));
      onClose();
    } catch (err) {
      console.error('Failed to save bulk notching:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100">
              <span className="text-xl">🌿</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('bulkNotching.title')}</h2>
              <p className="text-sm text-gray-600">{t('bulkNotching.subtitle', { plotName })}</p>
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
                mode="datetime"
                onSetDateTime={() => { setShowDateTimeField(true); setShowDateTimeMenu(false); }}
                onClose={() => setShowDateTimeMenu(false)}
              />
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {showDateTimeField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('bulkNotching.dateTime')}</label>
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
            <h3 className="text-sm font-semibold text-amber-800">{t('bulkNotching.sessionStart')}</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('bulkNotching.bookLabel')}</label>
              <select
                value={book}
                onChange={e => handleBookChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm"
              >
                {RUHI_BOOKS.map(b => (
                  <option key={b.value} value={b.value}>{t(`ruhiBooks.${b.value}`)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('bulkNotching.unitLabel')}</label>
                <input type="number" inputMode="numeric" max={UNITS_PER_BOOK} value={startUnit}
                  onChange={e => handleStartChange('unit', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('bulkNotching.sectionLabel')}</label>
                <input type="number" inputMode="numeric" max={getSectionsPerUnit(book)} value={startSection}
                  onChange={e => handleStartChange('section', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm" />
              </div>
            </div>
          </div>

          {/* Session End */}
          <div className="bg-amber-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-amber-800">{t('bulkNotching.sessionEnd')}</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('bulkNotching.bookLabelEnd')}</label>
              <select value={book} disabled
                className="w-full px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-500 cursor-not-allowed">
                {RUHI_BOOKS.map(b => <option key={b.value} value={b.value}>{t(`ruhiBooks.${b.value}`)}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">{t('bulkNotching.sameBook')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('bulkNotching.unitLabel')}</label>
                <input type="number" inputMode="numeric" max={UNITS_PER_BOOK} value={endUnit}
                  onChange={e => setEndUnit(parseInt(e.target.value) || startUnit)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('bulkNotching.sectionLabel')}</label>
                <input type="number" inputMode="numeric" max={getSectionsPerUnit(book)} value={endSection}
                  onChange={e => setEndSection(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors text-sm" />
              </div>
            </div>
          </div>

          {/* Summary */}
          {isComplete && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
              <span className="text-amber-700 text-sm font-medium">{t('bulkNotching.totalSections')}</span>
              <span className="text-amber-900 font-semibold text-sm">{t('bulkNotching.aboutSections', { count: sectionsStudied, unit: sectionsStudied === 1 ? t('bulkNotching.section') : t('bulkNotching.sections') })}</span>
            </div>
          )}

          {/* Progress description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('bulkNotching.progressLabel')}</label>
            <textarea
              value={progressDescription}
              onChange={e => setProgressDescription(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors resize-none"
              rows={3}
              placeholder={t('bulkNotching.progressPlaceholder')}
            />
          </div>

          {/* Plant selector */}
          <PlantSelectorChecklist
            plants={plants}
            selectedPlantIds={selectedPlantIds}
            onSelectionChange={setSelectedPlantIds}
          />

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors">
              {t('bulkNotching.cancelBtn')}
            </button>
            <button type="submit" disabled={!isComplete || isSubmitting}
              className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors">
              {isSubmitting ? t('bulkNotching.savingBtn') : t('bulkNotching.logForPlants', { count: selectedPlantIds.size })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
