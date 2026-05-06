import React, { useState, useEffect } from 'react';
import { ClipboardList, ChevronDown } from 'lucide-react';
import { SharedGardenDatabase, type GardenChangeLogEntry } from '../lib/sharedGardenDatabase';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const PAGE_SIZE = 10;

function formatEntry(entry: GardenChangeLogEntry): string {
  const actor = entry.actor_display_name || 'Someone';
  const label = entry.target_label || entry.target_id;

  switch (entry.action_type) {
    case 'add_plant': return `${actor} added ${label}`;
    case 'edit_plant': return `${actor} updated ${label}`;
    case 'remove_plant': return `${actor} removed ${label}`;
    case 'add_tending': return `${actor} logged a tending for ${label}`;
    case 'edit_tending': return `${actor} edited a tending`;
    case 'delete_tending': return `${actor} deleted a tending`;
    case 'add_watering': return `${actor} logged a watering for ${label}`;
    case 'edit_watering': return `${actor} edited a watering`;
    case 'delete_watering': return `${actor} deleted a watering`;
    case 'add_sunlight': return `${actor} added sunlight for ${label}`;
    case 'edit_sunlight': return `${actor} edited sunlight`;
    case 'delete_sunlight': return `${actor} deleted sunlight`;
    case 'add_fruit': return `${actor} recorded a fruit: ${label}`;
    case 'delete_fruit': return `${actor} deleted a fruit`;
    case 'add_pruning': return `${actor} recorded a pruning`;
    case 'delete_pruning': return `${actor} deleted a pruning`;
    case 'add_bud': return `${actor} added a bud: ${label}`;
    case 'delete_bud': return `${actor} deleted a bud`;
    case 'add_notching': return `${actor} recorded a notching: ${label}`;
    case 'delete_notching': return `${actor} deleted a notching`;
    case 'add_capability': return `${actor} noted a capacity: ${label}`;
    case 'delete_capability': return `${actor} deleted a capacity`;
    case 'add_companion': return `${actor} added a companion relationship`;
    case 'delete_companion': return `${actor} removed a companion relationship`;
    case 'edit_fruit': return `${actor} edited a fruit`;
    case 'edit_pruning': return `${actor} edited a pruning`;
    case 'edit_bud': return `${actor} edited a bud`;
    case 'edit_notching': return `${actor} edited a notching`;
    case 'edit_capability': return `${actor} edited a capacity`;
    case 'remove_member': return `${actor} removed a gardener from the garden`;
    case 'create_plot': return `${actor} created the plot "${label}"`;
    case 'edit_plot': return `${actor} updated the plot "${label}"`;
    case 'delete_plot': return `${actor} removed the plot "${label}"`;
    case 'edit_plot_members': return `${actor} updated members of the "${label}" plot`;
    case 'bulk_tending': return `${actor} logged a tending for the "${label}" plot`;
    case 'bulk_watering': return `${actor} logged a watering for the "${label}" plot`;
    case 'bulk_sunlight': return `${actor} added sunlight for the "${label}" plot`;
    case 'bulk_fruit': return `${actor} recorded a fruit for the "${label}" plot`;
    case 'bulk_notching': return `${actor} recorded a study session for the "${label}" plot`;
    default: return `${actor} made a change`;
  }
}

interface GardenChangeLogCardProps {
  gardenId: string;
  refreshKey?: number;
}

export const GardenChangeLogCard: React.FC<GardenChangeLogCardProps> = ({ gardenId, refreshKey }) => {
  const [entries, setEntries] = useState<GardenChangeLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

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
        <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
          <ClipboardList className="w-4 h-4 text-gray-600" />
        </div>
        <h3 className="font-medium text-gray-900 text-sm">Garden activity</h3>
      </div>

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
              Show more ({totalCount - entries.length} remaining)
            </>
          )}
        </button>
      )}
    </div>
  );
};
