import React from 'react';
import type { CareIndex } from '../../lib/collectivePulseService';

interface Props {
  careIndex: CareIndex;
  printMode?: boolean;
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Flourishing';
  if (score >= 65) return 'Tended';
  if (score >= 40) return 'Growing';
  return 'Needs Care';
}

function scoreColor(score: number, printMode: boolean): string {
  if (printMode) return '#374151';
  if (score >= 85) return 'text-green-700';
  if (score >= 65) return 'text-green-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function barColor(score: number): string {
  if (score >= 85) return '#16a34a';
  if (score >= 65) return '#22c55e';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

export const CareIndexBar: React.FC<Props> = ({ careIndex, printMode = false }) => {
  const { score, onTrack, overdue, total } = careIndex;
  const fillColor = barColor(score);

  return (
    <div className={printMode ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-end justify-between">
        <span
          className={`text-3xl font-bold tabular-nums ${printMode ? '' : scoreColor(score, false)}`}
          style={printMode ? { color: fillColor } : undefined}
        >
          {score}%
        </span>
        <span
          className={`text-sm font-medium ${printMode ? 'text-gray-600' : scoreColor(score, false)}`}
          style={printMode ? { color: fillColor } : undefined}
        >
          {scoreLabel(score)}
        </span>
      </div>

      <div className={`w-full rounded-full overflow-hidden ${printMode ? 'h-3' : 'h-4'}`}
        style={{ backgroundColor: printMode ? '#e5e7eb' : '#f3f4f6' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: fillColor }}
        />
      </div>

      <div className={`flex gap-4 text-xs ${printMode ? 'text-gray-600' : 'text-gray-500'}`}>
        <span>
          <span className="font-semibold" style={{ color: '#16a34a' }}>{onTrack}</span>
          {' '}on track
        </span>
        <span>
          <span className="font-semibold" style={{ color: '#dc2626' }}>{overdue}</span>
          {' '}overdue
        </span>
        <span>
          <span className="font-semibold" style={{ color: '#374151' }}>{total}</span>
          {' '}total souls
        </span>
      </div>
    </div>
  );
};
