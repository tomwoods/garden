import React from 'react';
import type { GardenBalance } from '../../lib/collectivePulseService';

interface Props {
  balance: GardenBalance;
  size?: number;
  printMode?: boolean;
}

interface Petal {
  label: string;
  value: number;
  color: string;
  angle: number;
}

export const FlowerRadarChart: React.FC<Props> = ({ balance, size = 220, printMode = false }) => {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.38;
  const centerRadius = size * 0.06;

  const petals: Petal[] = [
    { label: 'Tending', value: balance.tending, color: '#16a34a', angle: -90 },
    { label: 'Watering', value: balance.watering, color: '#2563eb', angle: -18 },
    { label: 'Sunlight', value: balance.sunlight, color: '#d97706', angle: 54 },
    { label: 'Fruit', value: balance.fruit, color: '#dc2626', angle: 126 },
    { label: 'Care Index', value: balance.careIndexScore, color: '#0891b2', angle: 198 },
  ];

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const petalPath = (angle: number, ratio: number): string => {
    const r = centerRadius + ratio * (maxRadius - centerRadius);
    const spread = 30;
    const leftAngle = angle - spread;
    const rightAngle = angle + spread;

    const tipX = cx + r * Math.cos(toRad(angle));
    const tipY = cy + r * Math.sin(toRad(angle));

    const leftX = cx + centerRadius * Math.cos(toRad(leftAngle));
    const leftY = cy + centerRadius * Math.sin(toRad(leftAngle));

    const rightX = cx + centerRadius * Math.cos(toRad(rightAngle));
    const rightY = cy + centerRadius * Math.sin(toRad(rightAngle));

    const cp1X = cx + (r * 0.7) * Math.cos(toRad(leftAngle));
    const cp1Y = cy + (r * 0.7) * Math.sin(toRad(leftAngle));

    const cp2X = cx + (r * 0.7) * Math.cos(toRad(rightAngle));
    const cp2Y = cy + (r * 0.7) * Math.sin(toRad(rightAngle));

    return `M ${leftX} ${leftY} C ${cp1X} ${cp1Y}, ${tipX} ${tipY}, ${tipX} ${tipY} C ${tipX} ${tipY}, ${cp2X} ${cp2Y}, ${rightX} ${rightY} Z`;
  };

  const labelPosition = (angle: number) => {
    const dist = maxRadius + size * 0.1;
    return {
      x: cx + dist * Math.cos(toRad(angle)),
      y: cy + dist * Math.sin(toRad(angle)),
    };
  };

  const guideRadii = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={printMode ? '' : 'mx-auto'}
    >
      {guideRadii.map((r, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={centerRadius + r * (maxRadius - centerRadius)}
          fill="none"
          stroke={printMode ? '#ccc' : '#e5e7eb'}
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
      ))}

      {petals.map((p, i) => {
        const ratio = balance.total > 0 ? p.value / 100 : 0.1;
        return (
          <path
            key={i}
            d={petalPath(p.angle, ratio)}
            fill={p.color}
            fillOpacity={printMode ? 0.6 : 0.72}
            stroke={p.color}
            strokeWidth="0.5"
          />
        );
      })}

      <circle cx={cx} cy={cy} r={centerRadius} fill={printMode ? '#d1fae5' : '#bbf7d0'} />

      {petals.map((p, i) => {
        const pos = labelPosition(p.angle);
        const fs = size * 0.052;
        return (
          <text
            key={i}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fs}
            fill={printMode ? '#374151' : '#4b5563'}
            fontFamily="system-ui, sans-serif"
          >
            {p.label}
          </text>
        );
      })}

      {petals.map((p, i) => {
        const pos = labelPosition(p.angle);
        const fs = size * 0.044;
        return (
          <text
            key={`val-${i}`}
            x={pos.x}
            y={pos.y + fs * 1.4}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fs}
            fill={p.color}
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
          >
            {p.value}%
          </text>
        );
      })}
    </svg>
  );
};
