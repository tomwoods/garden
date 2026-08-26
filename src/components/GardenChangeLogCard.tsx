import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { SharedGardenDatabase, type GardenChangeLogEntry } from '../lib/sharedGardenDatabase';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const PAGE_SIZE = 10;

interface GardenChangeLogCardProps {
  gardenId: string;
  refreshKey?: number;
  onGenerateReport?: () => void;
}

export const GardenChangeLogCard: React.FC<GardenChangeLogCardProps> = ({ gardenId, refreshKey, onGenerateReport }) => {
  const { t } = useTranslation('garden_shared');
  const [entries, setEntries] = useState<GardenChangeLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const formatEntry = (entry: GardenChangeLogEntry): string => {
    const actor = entry.actor_display_name || 'Someone';
    const label = entry.target_label || entry.target_id;
    const key = `changeLog.${entry.action_type}`;
    return t(key, { actor, label, defaultValue: t('changeLog.default', { actor }) });
  };

  const loadEntries = async (p: number) => {
    setLoading(true);
    try {
      const batch = SharedGardenDatabase.getChangeLog(gardenId, PAGE_SIZE, p * PAGE_SIZE);
      const count = SharedGardenDatabase.getChangeLogCount(gardenId);
      if (p === 0) {
        setEntries(batch);
      } else {
        setEntries(prev => [...prev, ...batch]);
      }
      setTotalCount(count);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    setEntries([]);
    loadEntries(0);
  }, [gardenId, refreshKey]);

  const handleShowMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadEntries(nextPage);
  };

  if (totalCount === 0) return null;

  const hasMore = entries.length < totalCount;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-4 h-4 text-gray-600" />
        </div>
        <h3 className="font-medium text-gray-900 text-sm flex-1">{t('changeLog.title')}</h3>
        {onGenerateReport && (
          <button
            onClick={onGenerateReport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors flex-shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            {t('activityReport.generate')}
          </button>
        )}
        <button
          onClick={() => setExpanded(prev => !prev)}
          aria-label={expanded ? t('changeLog.hideActivity') : t('changeLog.showActivity')}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                <p className="text-sm text-gray-700 leading-relaxed flex-1">{formatEntry(entry)}</p>
                <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{dayjs(entry.occurred_at).fromNow()}</span>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={handleShowMore}
              disabled={loading}
              className="w-full mt-3 flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
            >
              {loading ? (
                <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  {t('changeLog.showMore', { count: totalCount - entries.length })}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
};
