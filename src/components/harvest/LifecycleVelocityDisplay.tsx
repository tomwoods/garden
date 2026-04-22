import React from 'react';
import type { LifecycleVelocity } from '../../lib/collectivePulseService';

interface Props {
  velocity: LifecycleVelocity;
  printMode?: boolean;
}

export const LifecycleVelocityDisplay: React.FC<Props> = ({ velocity, printMode = false }) => {
  const stages = [
    {
      label: 'Seeds',
      sublabel: 'New this period',
      count: velocity.seeds,
      percent: velocity.seedsPercent,
      color: '#d97706',
      bg: printMode ? '#fef3c7' : 'bg-amber-50',
      border: printMode ? '#fde68a' : 'border-amber-200',
      icon: '·',
    },
    {
      label: 'Shoots',
      sublabel: 'Within 90 days',
      count: velocity.shoots,
      percent: velocity.shootsPercent,
      color: '#16a34a',
      bg: printMode ? '#dcfce7' : 'bg-green-50',
      border: printMode ? '#bbf7d0' : 'border-green-200',
      icon: '↑',
    },
    {
      label: 'Mature',
      sublabel: 'Established',
      count: velocity.mature,
      percent: velocity.maturePercent,
      color: '#065f46',
      bg: printMode ? '#d1fae5' : 'bg-emerald-50',
      border: printMode ? '#6ee7b7' : 'border-emerald-300',
      icon: '★',
    },
  ];

  if (printMode) {
    return (
      <div style={{ display: 'flex', gap: '12px' }}>
        {stages.map(s => (
          <div
            key={s.label}
            style={{
              flex: 1,
              border: `1px solid ${s.border}`,
              borderRadius: '8px',
              padding: '10px',
              backgroundColor: s.bg,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: s.color, marginTop: '2px' }}>{s.label}</div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{s.percent}%</div>
            <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px' }}>{s.sublabel}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {stages.map(s => (
        <div
          key={s.label}
          className={`rounded-xl border ${s.border} ${s.bg} p-3 text-center`}
        >
          <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>
            {s.count}
          </div>
          <div className="text-xs font-semibold mt-0.5" style={{ color: s.color }}>
            {s.label}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{s.percent}%</div>
          <div className="text-xs text-gray-400 mt-0.5">{s.sublabel}</div>
        </div>
      ))}
    </div>
  );
};
