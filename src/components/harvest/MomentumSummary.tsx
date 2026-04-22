import React from 'react';
import type { Momentum } from '../../lib/collectivePulseService';

interface Props {
  momentum: Momentum;
  printMode?: boolean;
}

export const MomentumSummary: React.FC<Props> = ({ momentum, printMode = false }) => {
  const tiles = [
    {
      label: 'Growing',
      count: momentum.growing,
      percent: momentum.growingPercent,
      color: '#16a34a',
      bg: printMode ? '#dcfce7' : 'bg-green-50',
      border: printMode ? '#bbf7d0' : 'border-green-200',
      description: 'More active lately',
    },
    {
      label: 'Steady',
      count: momentum.steady,
      percent: momentum.steadyPercent,
      color: '#2563eb',
      bg: printMode ? '#dbeafe' : 'bg-blue-50',
      border: printMode ? '#bfdbfe' : 'border-blue-200',
      description: 'Consistent pace',
    },
    {
      label: 'Slowing',
      count: momentum.slowing,
      percent: momentum.slowingPercent,
      color: '#d97706',
      bg: printMode ? '#fef3c7' : 'bg-amber-50',
      border: printMode ? '#fde68a' : 'border-amber-200',
      description: 'Less active lately',
    },
  ];

  if (printMode) {
    return (
      <div style={{ display: 'flex', gap: '12px' }}>
        {tiles.map(t => (
          <div
            key={t.label}
            style={{
              flex: 1,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              padding: '10px',
              backgroundColor: t.bg,
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: t.color }}>{t.count}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: t.color, marginTop: '2px' }}>{t.label}</div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{t.percent}% of garden</div>
            <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px' }}>{t.description}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map(t => (
        <div
          key={t.label}
          className={`rounded-xl border ${t.border} ${t.bg} p-3`}
        >
          <div className="text-2xl font-bold tabular-nums" style={{ color: t.color }}>
            {t.count}
          </div>
          <div className="text-xs font-semibold mt-0.5" style={{ color: t.color }}>
            {t.label}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{t.percent}% of garden</div>
          <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>
        </div>
      ))}
    </div>
  );
};
