import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sprout, Droplets, Sun, Apple, Scissors, Users, RefreshCw, Search, Check } from 'lucide-react';
import { HarvestPreview, AgeGroupCounts, AgeGroup, resolveAgeGroup, parseAgeInfoFromPlant, generateHarvestPreview } from '../lib/harvestService';
import type { Plant } from '../lib/database';
import dayjs from 'dayjs';

interface HarvestPreviewModalProps {
  isOpen: boolean;
  preview: HarvestPreview | null;
  isGenerating: boolean;
  allPlants: Plant[];
  onConfirm: (selectedPlantIds?: string[]) => void;
  onClose: () => void;
}

interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}

const StatRow: React.FC<StatRowProps> = ({ icon, label, value, suffix }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
    <div className="flex items-center gap-3 text-gray-700">
      <div className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <span className="text-sm">{label}</span>
    </div>
    <span className="text-sm font-semibold text-gray-900">
      {value}{suffix ? ` ${suffix}` : ''}
    </span>
  </div>
);

interface AgeRowProps {
  label: string;
  value: number;
}

const AgeRow: React.FC<AgeRowProps> = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-600 capitalize">{label}</span>
    <span className="text-sm font-semibold text-gray-900">{value}</span>
  </div>
);

function hasAnyNonAdult(groups: AgeGroupCounts): boolean {
  return groups.child > 0 || groups.junior_youth > 0 || groups.youth > 0 || groups.voting_youth > 0;
}

const AGE_GROUP_LABELS: { group: AgeGroup; label: string }[] = [
  { group: 'adult', label: 'adult' },
  { group: 'voting_youth', label: 'voting youth' },
  { group: 'youth', label: 'youth' },
  { group: 'junior_youth', label: 'junior youth' },
  { group: 'child', label: 'child' },
];

const ALL_AGE_GROUPS = new Set<AgeGroup>(['adult', 'voting_youth', 'youth', 'junior_youth', 'child']);

export const HarvestPreviewModal: React.FC<HarvestPreviewModalProps> = ({
  isOpen,
  preview: initialPreview,
  isGenerating,
  allPlants,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation('modals');
  const [includesAll, setIncludesAll] = useState(true);
  const [activeAgeGroups, setActiveAgeGroups] = useState<Set<AgeGroup>>(new Set(ALL_AGE_GROUPS));
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPreview, setFilteredPreview] = useState<HarvestPreview | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIncludesAll(true);
      setActiveAgeGroups(new Set(ALL_AGE_GROUPS));
      setSelectedPlantIds(new Set(allPlants.map(p => p.id)));
      setSearchTerm('');
      setFilteredPreview(null);
    }
  }, [isOpen, allPlants]);

  const plantAgeGroupMap = useMemo(() => {
    const map = new Map<string, AgeGroup>();
    for (const plant of allPlants) {
      map.set(plant.id, resolveAgeGroup(parseAgeInfoFromPlant(plant)));
    }
    return map;
  }, [allPlants]);

  const visiblePlants = useMemo(() => {
    return allPlants.filter(plant => {
      const group = plantAgeGroupMap.get(plant.id) ?? 'adult';
      if (!activeAgeGroups.has(group)) return false;
      if (searchTerm && !plant.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [allPlants, activeAgeGroups, searchTerm, plantAgeGroupMap]);

  useEffect(() => {
    if (!isOpen || !initialPreview) return;
    if (includesAll) {
      setFilteredPreview(null);
      return;
    }
    const ids = Array.from(selectedPlantIds);
    const result = generateHarvestPreview(initialPreview.dateFrom, initialPreview.dateTo, ids);
    setFilteredPreview(result);
  }, [isOpen, includesAll, selectedPlantIds, initialPreview]);

  const handleAgeGroupToggle = (group: AgeGroup) => {
    setActiveAgeGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
        const removedIds = allPlants
          .filter(p => (plantAgeGroupMap.get(p.id) ?? 'adult') === group)
          .map(p => p.id);
        setSelectedPlantIds(cur => {
          const updated = new Set(cur);
          removedIds.forEach(id => updated.delete(id));
          return updated;
        });
      } else {
        next.add(group);
        const addedIds = allPlants
          .filter(p => (plantAgeGroupMap.get(p.id) ?? 'adult') === group)
          .map(p => p.id);
        setSelectedPlantIds(cur => {
          const updated = new Set(cur);
          addedIds.forEach(id => updated.add(id));
          return updated;
        });
      }
      return next;
    });
  };

  const handlePlantToggle = (plantId: string) => {
    setSelectedPlantIds(prev => {
      const next = new Set(prev);
      if (next.has(plantId)) {
        next.delete(plantId);
      } else {
        next.add(plantId);
      }
      return next;
    });
  };

  const handleSelectVisible = () => {
    setSelectedPlantIds(prev => {
      const next = new Set(prev);
      visiblePlants.forEach(p => next.add(p.id));
      return next;
    });
  };

  const handleDeselectVisible = () => {
    setSelectedPlantIds(prev => {
      const next = new Set(prev);
      visiblePlants.forEach(p => next.delete(p.id));
      return next;
    });
  };

  const handleIncludesAllToggle = (checked: boolean) => {
    setIncludesAll(checked);
    if (checked) {
      setSelectedPlantIds(new Set(allPlants.map(p => p.id)));
      setActiveAgeGroups(new Set(ALL_AGE_GROUPS));
      setSearchTerm('');
    }
  };

  const handleConfirm = () => {
    if (includesAll) {
      onConfirm();
    } else {
      onConfirm(Array.from(selectedPlantIds));
    }
  };

  if (!isOpen || !initialPreview) return null;

  const preview = filteredPreview ?? initialPreview;
  const fromLabel = dayjs(preview.dateFrom).format('MMM D, YYYY');
  const toLabel = dayjs(preview.dateTo).format('MMM D, YYYY');
  const showAgeDistribution = preview.ageGroups && hasAnyNonAdult(preview.ageGroups);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 px-6 pt-6 pb-4 flex-shrink-0">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Sprout className="w-6 h-6 text-green-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">{t('harvestPreview.atAGlance')}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{fromLabel} — {toLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="px-6 pb-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              {t('harvestPreview.privacyNote')}
            </p>
          </div>

          <div className="px-6 pb-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                onClick={() => handleIncludesAllToggle(!includesAll)}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  includesAll ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}
              >
                {includesAll && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm text-gray-700">{t('harvestPreview.includesAll')}</span>
            </label>
          </div>

          {!includesAll && (
            <div className="px-6 pb-3">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {AGE_GROUP_LABELS.map(({ group, label }) => {
                  const active = activeAgeGroups.has(group);
                  return (
                    <button
                      key={group}
                      type="button"
                      onClick={() => handleAgeGroupToggle(group)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                        active
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder={t('harvestPreview.searchPlants')}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">
                  {t('harvestPreview.selectedOf', { selected: selectedPlantIds.size, total: allPlants.length })}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectVisible}
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    {t('harvestPreview.selectAll')}
                  </button>
                  <span className="text-xs text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectVisible}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    {t('harvestPreview.selectNone')}
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl max-h-44 overflow-y-auto">
                {visiblePlants.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">
                    {searchTerm ? t('harvestPreview.noSearchMatch') : t('harvestPreview.noPlants')}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {visiblePlants.map(plant => {
                      const selected = selectedPlantIds.has(plant.id);
                      return (
                        <button
                          key={plant.id}
                          type="button"
                          onClick={() => handlePlantToggle(plant.id)}
                          className={`w-full px-3 py-2.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors ${selected ? 'bg-green-50' : ''}`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            selected ? 'bg-green-500 border-green-500' : 'border-gray-300'
                          }`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-sm text-gray-900 font-medium truncate">{plant.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-6 py-3">
            <StatRow
              icon={<Sprout className="w-3.5 h-3.5 text-green-600" />}
              label={t('harvestPreview.soulsLabel')}
              value={preview.souls}
            />
            <StatRow
              icon={<Users className="w-3.5 h-3.5 text-green-600" />}
              label={t('harvestPreview.plotsLabel')}
              value={preview.plots}
            />
            <StatRow
              icon={<Sprout className="w-3.5 h-3.5 text-green-600" />}
              label={t('harvestPreview.tendingsLabel')}
              value={preview.tendings}
            />
            <StatRow
              icon={<Droplets className="w-3.5 h-3.5 text-green-600" />}
              label={t('harvestPreview.wateringsLabel')}
              value={preview.waterings}
            />
            <StatRow
              icon={<Sun className="w-3.5 h-3.5 text-green-600" />}
              label={t('harvestPreview.sunlightLabel')}
              value={preview.sunlight}
            />
            <StatRow
              icon={<Apple className="w-3.5 h-3.5 text-green-600" />}
              label={t('harvestPreview.fruitsLabel')}
              value={preview.fruits}
            />
            <StatRow
              icon={<Scissors className="w-3.5 h-3.5 text-green-600" />}
              label={t('harvestPreview.pruningsLabel')}
              value={preview.prunings}
            />
          </div>

          {showAgeDistribution && preview.ageGroups && (
            <div className="px-6 pb-3">
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{t('harvestPreview.ageDistribution')}</p>
                {preview.ageGroups.child > 0 && (
                  <AgeRow label="child" value={preview.ageGroups.child} />
                )}
                {preview.ageGroups.junior_youth > 0 && (
                  <AgeRow label="junior youth" value={preview.ageGroups.junior_youth} />
                )}
                {preview.ageGroups.youth > 0 && (
                  <AgeRow label="youth" value={preview.ageGroups.youth} />
                )}
                {preview.ageGroups.voting_youth > 0 && (
                  <AgeRow label="voting youth" value={preview.ageGroups.voting_youth} />
                )}
                {preview.ageGroups.adult > 0 && (
                  <AgeRow label="adult" value={preview.ageGroups.adult} />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6 pt-2 flex-shrink-0">
          <button
            onClick={handleConfirm}
            disabled={isGenerating || (!includesAll && selectedPlantIds.size === 0)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-medium transition-colors text-sm"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sprout className="w-4 h-4" />
            )}
            {isGenerating ? t('harvestPreview.preparingBtn') : t('harvestPreview.exportBtn')}
          </button>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 rounded-xl font-medium transition-colors text-sm"
          >
            {t('harvestPreview.goBackBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
