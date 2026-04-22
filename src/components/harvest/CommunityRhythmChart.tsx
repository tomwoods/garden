import React from 'react';
import type { MonthlyTrend, WeeklyPattern } from '../../lib/collectivePulseService';

interface MonthlyChartProps {
  data: MonthlyTrend[];
  printMode?: boolean;
}

interface DayOfWeekChartProps {
  data: WeeklyPattern[];
  printMode?: boolean;
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export const CommunityRhythmChart: React.FC<MonthlyChartProps> = ({ data, printMode = false }) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No activity data in this period
      </div>
    );
  }

  const maxTotal = Math.max(...data.map(d => d.total), 1);
  const chartHeight = 120;
  const labelHeight = 28;
  const totalHeight = chartHeight + labelHeight;
  const barWidth = 32;
  const gap = 8;
  const totalWidth = data.length * (barWidth + gap) - gap;
  const svgWidth = totalWidth + 40;

  const colors = {
    tending: '#16a34a',
    watering: '#2563eb',
    sunlight: '#d97706',
    fruit: '#dc2626',
    pruning: '#7c3aed',
  };

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgWidth}
        height={totalHeight}
        viewBox={`0 0 ${svgWidth} ${totalHeight}`}
        className="min-w-0"
      >
        {data.map((d, i) => {
          const x = 20 + i * (barWidth + gap);
          const total = d.total;
          const segments = [
            { key: 'tending', val: d.tending },
            { key: 'watering', val: d.watering },
            { key: 'sunlight', val: d.sunlight },
            { key: 'fruit', val: d.fruit },
            { key: 'pruning', val: d.pruning },
          ] as const;

          let currentY = chartHeight;
          const bars = segments
            .filter(s => s.val > 0)
            .map(s => {
              const h = Math.max(2, (s.val / maxTotal) * chartHeight);
              currentY -= h;
              const rect = { y: currentY, h, key: s.key };
              return rect;
            });

          const barHeight = total > 0 ? (total / maxTotal) * chartHeight : 0;

          return (
            <g key={i}>
              {bars.map((b) => (
                <rect
                  key={b.key}
                  x={x}
                  y={b.y}
                  width={barWidth}
                  height={b.h}
                  fill={colors[b.key]}
                  fillOpacity={printMode ? 0.7 : 0.85}
                  rx="1"
                />
              ))}
              {total === 0 && (
                <rect
                  x={x}
                  y={chartHeight - 2}
                  width={barWidth}
                  height={2}
                  fill={printMode ? '#d1d5db' : '#e5e7eb'}
                  rx="1"
                />
              )}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 12}
                textAnchor="middle"
                fontSize="9"
                fill={printMode ? '#374151' : '#6b7280'}
                fontFamily="system-ui, sans-serif"
              >
                {formatMonthLabel(d.month)}
              </text>
              {total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - barHeight - 3}
                  textAnchor="middle"
                  fontSize="8"
                  fill={printMode ? '#374151' : '#6b7280'}
                  fontFamily="system-ui, sans-serif"
                >
                  {total}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const DayOfWeekChart: React.FC<DayOfWeekChartProps> = ({ data, printMode = false }) => {
  const maxVal = Math.max(...data.map(d => d.tending + d.watering + d.sunlight), 1);
  const chartHeight = 80;
  const labelHeight = 20;
  const totalHeight = chartHeight + labelHeight;
  const barWidth = 28;
  const gap = 4;
  const totalWidth = data.length * (barWidth + gap) - gap;
  const svgWidth = totalWidth + 8;

  const colors = {
    tending: '#16a34a',
    watering: '#2563eb',
    sunlight: '#d97706',
  };

  return (
    <svg
      width={svgWidth}
      height={totalHeight}
      viewBox={`0 0 ${svgWidth} ${totalHeight}`}
    >
      {data.map((d, i) => {
        const x = 4 + i * (barWidth + gap);
        const total = d.tending + d.watering + d.sunlight;

        const segments = [
          { key: 'tending' as const, val: d.tending },
          { key: 'watering' as const, val: d.watering },
          { key: 'sunlight' as const, val: d.sunlight },
        ];

        let currentY = chartHeight;
        const bars = segments
          .filter(s => s.val > 0)
          .map(s => {
            const h = Math.max(2, (s.val / maxVal) * chartHeight);
            currentY -= h;
            return { y: currentY, h, key: s.key };
          });

        return (
          <g key={i}>
            {bars.map(b => (
              <rect
                key={b.key}
                x={x}
                y={b.y}
                width={barWidth}
                height={b.h}
                fill={colors[b.key]}
                fillOpacity={printMode ? 0.7 : 0.85}
                rx="1"
              />
            ))}
            {total === 0 && (
              <rect
                x={x}
                y={chartHeight - 2}
                width={barWidth}
                height={2}
                fill={printMode ? '#d1d5db' : '#e5e7eb'}
                rx="1"
              />
            )}
            <text
              x={x + barWidth / 2}
              y={chartHeight + 13}
              textAnchor="middle"
              fontSize="9"
              fill={printMode ? '#374151' : '#6b7280'}
              fontFamily="system-ui, sans-serif"
            >
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
