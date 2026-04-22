import React from 'react';
import type { CollectivePulse } from '../../lib/collectivePulseService';
import { FlowerRadarChart } from './FlowerRadarChart';
import { CommunityRhythmChart, DayOfWeekChart } from './CommunityRhythmChart';
import { CareIndexBar } from './CareIndexBar';
import { LifecycleVelocityDisplay } from './LifecycleVelocityDisplay';
import { MomentumSummary } from './MomentumSummary';

interface Props {
  pulse: CollectivePulse;
  reportCount: number;
  coordinatorName?: string;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatWindowDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function generateSummary(pulse: CollectivePulse, reportCount: number): string {
  const { souls, careIndex, momentum, gardenBalance, harvestRatio, dateRange, relationshipDepth, sowingWindows } = pulse;

  const topActivity = (['tending', 'watering', 'sunlight', 'fruit', 'pruning'] as const)
    .reduce((best, key) => gardenBalance[key] > gardenBalance[best] ? key : best, 'tending' as const);

  const activityLabels: Record<string, string> = {
    tending: 'tending visits',
    watering: 'study gatherings',
    sunlight: 'prayers offered',
    fruit: 'acts of service',
    pruning: 'loving corrections',
  };

  const parts: string[] = [];

  if (reportCount === 1) {
    parts.push(`This report reflects the care patterns of a single gardener tending ${souls} soul${souls !== 1 ? 's' : ''}.`);
  } else {
    parts.push(`This brief draws from ${reportCount} harvest reports covering ${souls} soul${souls !== 1 ? 's' : ''} across the period ${formatShortDate(dateRange.from)} to ${formatShortDate(dateRange.to)}.`);
  }

  if (careIndex.score >= 80) {
    parts.push(`The garden is flourishing — ${careIndex.score}% of souls are receiving timely care.`);
  } else if (careIndex.score >= 55) {
    parts.push(`Care is being offered consistently, with ${careIndex.score}% of souls tended within their expected rhythms.`);
  } else {
    parts.push(`There is room to deepen consistency — ${careIndex.overdue} soul${careIndex.overdue !== 1 ? 's' : ''} may benefit from renewed attention.`);
  }

  const dominantLabel = activityLabels[topActivity];
  parts.push(`The primary expression of care has been through ${dominantLabel} (${gardenBalance[topActivity]}% of all recorded activity).`);

  if (harvestRatio.totalFruit > 0) {
    parts.push(`${harvestRatio.totalFruit} act${harvestRatio.totalFruit !== 1 ? 's' : ''} of service were recorded — a meaningful sign of growth.`);
  }

  if (momentum.growingPercent >= 40) {
    parts.push(`${momentum.growingPercent}% of souls show increasing engagement in the second half of this period.`);
  } else if (momentum.slowingPercent >= 40) {
    parts.push(`${momentum.slowingPercent}% of souls show reduced activity toward the end of this period — worth prayerful reflection.`);
  }

  if (relationshipDepth.pruningCount > 0) {
    parts.push(`Relationship depth is marked as "${relationshipDepth.label}" — ${relationshipDepth.description.toLowerCase()}`);
  }

  const totalSown = sowingWindows.reduce((s, w) => s + w.seedsPlanted, 0);
  if (sowingWindows.length > 0 && totalSown > 0) {
    parts.push(`${totalSown} new seed${totalSown !== 1 ? 's' : ''} were sown during a sowing season in this period.`);
  }

  return parts.join(' ');
}

function generateRecommendations(pulse: CollectivePulse): string[] {
  const recs: string[] = [];
  const { careIndex, momentum, gardenBalance, harvestRatio, lifecycleVelocity, relationshipDepth, sowingWindows } = pulse;

  if (careIndex.overdue > 0) {
    recs.push(`${careIndex.overdue} soul${careIndex.overdue !== 1 ? 's' : ''} may not have been visited within their expected rhythm. Consider a gentle outreach.`);
  }

  if (momentum.slowing > momentum.growing && momentum.slowing > 2) {
    recs.push('A number of relationships are showing reduced interaction — creating more intentional shared moments may help renew connection.');
  }

  if (lifecycleVelocity.seeds > 0) {
    recs.push(`${lifecycleVelocity.seeds} new soul${lifecycleVelocity.seeds !== 1 ? 's' : ''} joined the garden this period. Consistent early contact helps roots take hold.`);
  }

  if (gardenBalance.sunlight < 10 && gardenBalance.total > 0) {
    recs.push('Prayer for souls (sunlight) represents a small share of care. Expanding this practice can deepen spiritual accompaniment.');
  }

  if (harvestRatio.fruitPerSoul < 0.5 && pulse.souls > 3) {
    recs.push('Fruit — acts of selfless service — is relatively sparse. Celebrating and encouraging service can catalyze growth.');
  }

  if (relationshipDepth.score >= 90 && relationshipDepth.pruningCount === 0 && pulse.souls > 2) {
    recs.push('No loving corrections have been recorded. Relationships that never face honest conversation may not yet have the depth needed to accompany souls through difficulty.');
  } else if (relationshipDepth.score < 50 && relationshipDepth.pruningCount > 0) {
    recs.push('Pruning events are outpacing nourishment. Ensure each soul is receiving consistent warmth and care alongside any difficult conversations.');
  }

  for (const w of sowingWindows) {
    const fullWindowDays = Math.round((w.windowEnd.getTime() - w.windowStart.getTime()) / (1000 * 60 * 60 * 24));
    if (w.overlapDays >= fullWindowDays && w.seedsPlanted === 0) {
      recs.push(`A full sowing window (${w.label}) passed during this period without any new seeds. Consider whether there are souls ready to be welcomed into the garden.`);
    }
  }

  if (recs.length === 0) {
    recs.push('The garden is in healthy rhythm. Continue tending with love and intention.');
  }

  return recs;
}

const NOTE_LINES = 7;

export const HarvestBriefDocument: React.FC<Props> = ({ pulse, reportCount, coordinatorName }) => {
  const summary = generateSummary(pulse, reportCount);
  const recommendations = generateRecommendations(pulse);

  const sectionStyle: React.CSSProperties = {
    marginBottom: '24px',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#374151',
    borderBottom: '1px solid #d1fae5',
    paddingBottom: '4px',
    marginBottom: '12px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  };

  const bodyStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#374151',
    lineHeight: '1.6',
  };

  return (
    <div
      id="harvest-brief-document"
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        backgroundColor: '#ffffff',
        color: '#1f2937',
        width: '794px',
        padding: '56px 64px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ borderBottom: '2px solid #16a34a', paddingBottom: '16px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#065f46', margin: 0, letterSpacing: '-0.02em' }}>
              Harvest Brief
            </h1>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0', fontFamily: 'system-ui, sans-serif' }}>
              Collective Garden — Care Patterns Report
            </p>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontSize: '11px', color: '#374151', fontWeight: 600 }}>
              {formatDate(pulse.dateRange.from)} — {formatDate(pulse.dateRange.to)}
            </div>
            {coordinatorName && (
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                Prepared by {coordinatorName}
              </div>
            )}
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
              {reportCount} gardener report{reportCount !== 1 ? 's' : ''} · {pulse.souls} soul{pulse.souls !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div>
          <div style={sectionStyle}>
            <div style={headingStyle}>Summary</div>
            <p style={bodyStyle}>{summary}</p>
          </div>

          <div style={sectionStyle}>
            <div style={headingStyle}>Care Faithfulness</div>
            <CareIndexBar careIndex={pulse.careIndex} printMode />
          </div>

          <div style={sectionStyle}>
            <div style={headingStyle}>Garden Lifecycle</div>
            <LifecycleVelocityDisplay velocity={pulse.lifecycleVelocity} printMode />
          </div>
        </div>

        <div>
          <div style={sectionStyle}>
            <div style={headingStyle}>Balance of Care</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <FlowerRadarChart balance={pulse.gardenBalance} size={200} printMode />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {[
                { label: 'Tending', color: '#16a34a' },
                { label: 'Watering', color: '#2563eb' },
                { label: 'Sunlight', color: '#d97706' },
                { label: 'Fruit', color: '#dc2626' },
                { label: 'Care Index', color: '#0891b2' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'system-ui, sans-serif' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }} />
                  <span style={{ fontSize: '9px', color: '#4b5563' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={headingStyle}>Momentum</div>
            <MomentumSummary momentum={pulse.momentum} printMode />
          </div>
        </div>
      </div>

      <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
        <div style={headingStyle}>Activity Over Time</div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          <div style={{ flex: 2 }}>
            <div style={{ ...labelStyle, marginBottom: '8px', fontFamily: 'system-ui, sans-serif' }}>Monthly Rhythm</div>
            <CommunityRhythmChart data={pulse.monthlyTrend} printMode />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...labelStyle, marginBottom: '8px', fontFamily: 'system-ui, sans-serif' }}>Day of Week</div>
            <DayOfWeekChart data={pulse.weeklyPattern} printMode />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', fontFamily: 'system-ui, sans-serif' }}>
          {[
            { label: 'Tending', color: '#16a34a' },
            { label: 'Watering', color: '#2563eb' },
            { label: 'Sunlight', color: '#d97706' },
            { label: 'Fruit', color: '#dc2626' },
            { label: 'Pruning Event', color: '#7c3aed' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: item.color }} />
              <span style={{ fontSize: '9px', color: '#4b5563' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...sectionStyle }}>
        <div style={headingStyle}>Harvest & Service</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontFamily: 'system-ui, sans-serif' }}>
          {[
            { label: 'Total Fruits', value: pulse.harvestRatio.totalFruit, sub: 'acts of service' },
            { label: 'Fruit per Soul', value: pulse.harvestRatio.fruitPerSoul, sub: 'on average' },
          ].map(stat => (
            <div key={stat.label} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#065f46' }}>{stat.value}</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#374151', marginTop: '2px' }}>{stat.label}</div>
              <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px' }}>{stat.sub}</div>
            </div>
          ))}
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#065f46' }}>{pulse.relationshipDepth.label}</div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#374151', marginTop: '2px' }}>Relationship Depth</div>
            <div style={{ marginTop: '6px', height: '4px', borderRadius: '2px', backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                borderRadius: '2px',
                width: `${pulse.relationshipDepth.score}%`,
                backgroundColor: pulse.relationshipDepth.score >= 70 ? '#16a34a' : pulse.relationshipDepth.score >= 50 ? '#d97706' : '#dc2626',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
              <span style={{ fontSize: '9px', color: '#9ca3af' }}>{pulse.relationshipDepth.nurturingCount} nurturing</span>
              <span style={{ fontSize: '9px', color: '#9ca3af' }}>{pulse.relationshipDepth.pruningCount} pruning events</span>
            </div>
          </div>
        </div>
      </div>

      {pulse.sowingWindows.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Sowing Season</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'system-ui, sans-serif' }}>
            {pulse.sowingWindows.map((w, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px 12px',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>{w.label}</span>
                  <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: '8px' }}>
                    {formatWindowDate(w.overlapStart)} – {formatWindowDate(w.overlapEnd)}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>{w.seedsPlanted}</span>
                  <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '4px' }}>
                    {w.seedsPlanted === 1 ? 'seed' : 'seeds'} sown
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={headingStyle}>Reflections for the Coordinator</div>
        <ul style={{ margin: 0, padding: '0 0 0 16px', ...bodyStyle }}>
          {recommendations.map((rec, i) => (
            <li key={i} style={{ marginBottom: '6px' }}>{rec}</li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Notes</div>
        {Array.from({ length: NOTE_LINES }).map((_, i) => (
          <div
            key={i}
            style={{
              height: '24px',
              borderBottom: '1px solid #e5e7eb',
              marginBottom: '4px',
            }}
          />
        ))}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid #d1fae5',
        paddingTop: '8px',
        marginTop: '24px',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <span style={{ fontSize: '9px', color: '#9ca3af' }}>
          Generated {formatDate(Date.now())} · All data is privacy-preserving and anonymized
        </span>
        <span style={{ fontSize: '9px', color: '#9ca3af' }}>
          {pulse.plotCount > 0 ? `${pulse.plotCount} plot${pulse.plotCount !== 1 ? 's' : ''} · avg ${pulse.averagePlotSize} souls/plot` : ''}
        </span>
      </div>
    </div>
  );
};
