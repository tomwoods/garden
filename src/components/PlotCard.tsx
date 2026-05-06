import React from 'react';
import { Users, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { PlotWithMembers } from '../lib/database';

dayjs.extend(relativeTime);

interface PlotCardProps {
  plot: PlotWithMembers;
  onClick: () => void;
}

export const PlotCard: React.FC<PlotCardProps> = ({ plot, onClick }) => {
  const { t } = useTranslation('garden_shared');
  const formatCreatedAt = (timestamp: number) => {
    return dayjs(timestamp).fromNow();
  };

  return (
    <div 
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <img src="/plots_icon.svg" alt="Plot" className="w-5 h-5" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{plot.name}</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <img src="/plots_icon.svg" alt="Members" className="w-3 h-3" style={{ filter: 'invert(60%) sepia(10%) saturate(200%) hue-rotate(180deg) brightness(95%) contrast(85%)' }} />
                <span className="text-gray-500">
                  {t('membersCount', { count: plot.members.length })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500">
                  Created {formatCreatedAt(plot.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {plot.description && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-700 leading-relaxed">
            {plot.description}
          </p>
        </div>
      )}

      {plot.members.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plot.members.slice(0, 3).map((member) => (
            <span
              key={member.id}
              className="inline-flex items-center px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full"
            >
              🌱 {member.name}
            </span>
          ))}
          {plot.members.length > 3 && (
            <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
              +{plot.members.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
};