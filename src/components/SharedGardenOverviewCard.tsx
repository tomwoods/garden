import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sprout, Users, ChevronRight } from 'lucide-react';
import { SharedGardenDatabase } from '../lib/sharedGardenDatabase';
import { parseAgeInfoFromPlant, resolveAgeGroup, type AgeGroup } from '../lib/harvestService';
import type { Plant } from '../lib/database';

interface SharedGardenOverviewCardProps {
  gardenId: string;
  plants: Plant[];
  refreshKey: number;
  onShowAllPlants: () => void;
}

interface ActivityStats {
  tendings: number;
  waterings: number;
  sunlight: number;
  fruits: number;
  prunings: number;
  notchings: number;
}

interface AgeCounts {
  adult: number;
  voting_youth: number;
  youth: number;
  junior_youth: number;
  child: number;
  unknown: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function countByRange(gardenId: string, fromMs: number): ActivityStats {
  const now = Date.now();
  return {
    tendings: SharedGardenDatabase.getAllTendingsByRange(gardenId, fromMs, now).length,
    waterings: SharedGardenDatabase.getAllWateringsByRange(gardenId, fromMs, now).length,
    sunlight: SharedGardenDatabase.getAllSunlightByRange(gardenId, fromMs, now).length,
    fruits: SharedGardenDatabase.getAllFruitsByRange(gardenId, fromMs, now).length,
    prunings: SharedGardenDatabase.getAllPruningsByRange(gardenId, fromMs, now).length,
    notchings: SharedGardenDatabase.getAllNotchingsByRange(gardenId, fromMs, now).length,
  };
}

function computeAgeCounts(plants: Plant[]): AgeCounts {
  const counts: AgeCounts = { adult: 0, voting_youth: 0, youth: 0, junior_youth: 0, child: 0, unknown: 0 };
  for (const p of plants) {
    const ageInfo = parseAgeInfoFromPlant(p);
    if (!ageInfo || ageInfo.is_over_21) {
      counts.adult++;
    } else {
      const group: AgeGroup = resolveAgeGroup(ageInfo);
      counts[group]++;
    }
  }
  return counts;
}

const activityConfig = [
  { key: 'tendings', emoji: '🪴', color: 'text-green-700', bg: 'bg-green-50' },
  { key: 'waterings', emoji: '🚿', color: 'text-blue-700', bg: 'bg-blue-50' },
  { key: 'sunlight', emoji: '☀️', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  { key: 'fruits', emoji: '🍎', color: 'text-red-700', bg: 'bg-red-50' },
  { key: 'prunings', emoji: '✂️', color: 'text-orange-700', bg: 'bg-orange-50' },
  { key: 'notchings', emoji: '📖', color: 'text-amber-700', bg: 'bg-amber-50' },
] as const;

const ageGroupConfig = [
  { key: 'adult', labelKey: 'overview.ageAdult' },
  { key: 'voting_youth', labelKey: 'overview.ageVotingYouth' },
  { key: 'youth', labelKey: 'overview.ageYouth' },
  { key: 'junior_youth', labelKey: 'overview.ageJuniorYouth' },
  { key: 'child', labelKey: 'overview.ageChild' },
] as const;

export const SharedGardenOverviewCard: React.FC<SharedGardenOverviewCardProps> = ({
  gardenId,
  plants,
  refreshKey,
  onShowAllPlants,
}) => {
  const { t } = useTranslation('garden_shared');

  const stats = useMemo(() => {
    const now = Date.now();
    const day = countByRange(gardenId, now - DAY_MS);
    const week = countByRange(gardenId, now - 7 * DAY_MS);
    const month = countByRange(gardenId, now - 30 * DAY_MS);
    return { day, week, month };
  }, [gardenId, refreshKey, plants.length]);

  const ageCounts = useMemo(() => computeAgeCounts(plants), [plants]);

  const memberCount = useMemo(() => {
    try {
      return SharedGardenDatabase.getMembers(gardenId).length;
    } catch {
      return 0;
    }
  }, [gardenId, refreshKey]);

  const rangeKeys: Array<{ label: string; data: ActivityStats }> = [
    { label: t('overview.pastDay'), data: stats.day },
    { label: t('overview.pastWeek'), data: stats.week },
    { label: t('overview.pastMonth'), data: stats.month },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sprout className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 text-base">{t('overview.title')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('overview.plantsCount', { count: plants.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Age groups */}
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {t('overview.ageBreakdown')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {ageGroupConfig.map(({ key, labelKey }) => {
            const count = ageCounts[key as keyof AgeCounts];
            if (count === 0) return null;
            return (
              <div
                key={key}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"
              >
                <span className="text-sm font-medium text-gray-700">{count}</span>
                <span className="text-xs text-gray-500">{t(labelKey)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity stats */}
      <div className="px-5 py-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {t('overview.activitySummary')}
        </h3>

        {/* Table header */}
        <div className="grid grid-cols-4 gap-2 mb-2">
          <div className="text-xs font-medium text-gray-400" />
          {rangeKeys.map((r) => (
            <div key={r.label} className="text-xs font-medium text-gray-400 text-center">
              {r.label}
            </div>
          ))}
        </div>

        {/* Activity rows */}
        <div className="space-y-1">
          {activityConfig.map(({ key, emoji, color, bg }) => (
            <div key={key} className="grid grid-cols-4 gap-2 items-center py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <span className={`text-sm ${color} leading-none`} aria-hidden="true">{emoji}</span>
                </div>
                <span className="text-xs text-gray-600 truncate">
                  {t(`overview.${key}`)}
                </span>
              </div>
              {rangeKeys.map((r) => (
                <div key={r.label} className="text-sm text-center font-medium text-gray-700">
                  {r.data[key as keyof ActivityStats]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Members + show all button */}
      <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Users className="w-4 h-4" />
          <span>{t('overview.membersCount', { count: memberCount })}</span>
        </div>
        <button
          onClick={onShowAllPlants}
          className="flex items-center gap-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {t('overview.showAllPlants')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
