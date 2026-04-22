import type { HarvestReport, HarvestPlant, HarvestTending, HarvestWatering, HarvestSunlight, HarvestFruit, HarvestPruning, AgeGroup } from './harvestService';
import { getSowingWindowOverlaps, type SowingWindowOverlap } from './sowingSeasonService';

export interface AgeGroupCounts {
  adult: number;
  voting_youth: number;
  youth: number;
  junior_youth: number;
  child: number;
}

export interface CareIndex {
  score: number;
  onTrack: number;
  overdue: number;
  total: number;
}

export interface GardenBalance {
  tending: number;
  watering: number;
  sunlight: number;
  fruit: number;
  pruning: number;
  total: number;
  careIndexScore: number;
}

export interface LifecycleVelocity {
  seeds: number;
  shoots: number;
  mature: number;
  seedsPercent: number;
  shootsPercent: number;
  maturePercent: number;
}

export interface MomentumBucket {
  plantId: string;
  activityCount: number;
  lastActivity: number;
}

export interface Momentum {
  growing: number;
  steady: number;
  slowing: number;
  growingPercent: number;
  steadyPercent: number;
  slowingPercent: number;
}

export interface HarvestRatio {
  fruitPerSoul: number;
  fruitPerTending: number;
  totalFruit: number;
  totalSouls: number;
  totalTendings: number;
}

export interface PruningPulse {
  count: number;
  perSoul: number;
  byMonth: { month: string; count: number }[];
}

export interface WeeklyPattern {
  day: string;
  tending: number;
  watering: number;
  sunlight: number;
}

export interface MonthlyTrend {
  month: string;
  tending: number;
  watering: number;
  sunlight: number;
  fruit: number;
  pruning: number;
  total: number;
}

export interface RelationshipDepth {
  score: number;
  nurturingCount: number;
  pruningCount: number;
  label: string;
  description: string;
}

export interface CollectivePulse {
  souls: number;
  dateRange: { from: number; to: number };
  ageGroups: AgeGroupCounts | null;
  careIndex: CareIndex;
  gardenBalance: GardenBalance;
  lifecycleVelocity: LifecycleVelocity;
  momentum: Momentum;
  harvestRatio: HarvestRatio;
  pruningPulse: PruningPulse;
  relationshipDepth: RelationshipDepth;
  weeklyPattern: WeeklyPattern[];
  monthlyTrend: MonthlyTrend[];
  plotCount: number;
  averagePlotSize: number;
  sowingWindows: SowingWindowOverlap[];
}

function dayOfWeek(ts: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(ts).getDay()];
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function computeAgeGroups(plants: HarvestPlant[]): AgeGroupCounts | null {
  const counts: AgeGroupCounts = { adult: 0, voting_youth: 0, youth: 0, junior_youth: 0, child: 0 };
  let hasNonAdult = false;

  for (const p of plants) {
    counts[p.age_group]++;
    if (p.age_group !== 'adult') hasNonAdult = true;
  }

  return hasNonAdult ? counts : null;
}

function computeCareIndex(plants: HarvestPlant[], to: number): CareIndex {
  if (plants.length === 0) return { score: 0, onTrack: 0, overdue: 0, total: 0 };

  let onTrack = 0;
  let overdue = 0;

  for (const p of plants) {
    const freqMs = p.care_frequency_unit === 'weeks'
      ? p.care_frequency_multiplier * 7 * 24 * 60 * 60 * 1000
      : p.care_frequency_multiplier * 24 * 60 * 60 * 1000;

    const windowStart = to - freqMs;
    if (p.created_at >= windowStart) {
      onTrack++;
    } else {
      overdue++;
    }
  }

  const total = plants.length;
  const score = total > 0 ? Math.round((onTrack / total) * 100) : 0;

  return { score, onTrack, overdue, total };
}

function computeScheduledCareMet(
  plants: HarvestPlant[],
  tendings: HarvestTending[],
  from: number,
  to: number
): number {
  if (plants.length === 0) return 0;

  const periodMs = to - from;
  const tendingsByPlant = new Map<string, number>();
  for (const t of tendings) {
    tendingsByPlant.set(t.hashed_plant_id, (tendingsByPlant.get(t.hashed_plant_id) ?? 0) + 1);
  }

  let metCount = 0;
  for (const p of plants) {
    const freqMs = p.care_frequency_unit === 'weeks'
      ? p.care_frequency_multiplier * 7 * 24 * 60 * 60 * 1000
      : p.care_frequency_multiplier * 24 * 60 * 60 * 1000;

    const expectedCount = freqMs > 0 ? Math.max(1, Math.floor(periodMs / freqMs)) : 1;
    const actualCount = tendingsByPlant.get(p.hashed_id) ?? 0;

    if (actualCount >= expectedCount) metCount++;
  }

  return Math.round((metCount / plants.length) * 100);
}

function computeGardenBalance(
  plants: HarvestPlant[],
  tendings: HarvestTending[],
  waterings: HarvestWatering[],
  sunlight: HarvestSunlight[],
  fruits: HarvestFruit[],
  prunings: HarvestPruning[],
  from: number,
  to: number
): GardenBalance {
  const t = tendings.length;
  const w = waterings.length;
  const s = sunlight.length;
  const f = fruits.length;
  const p = prunings.length;
  const total = t + w + s + f + p;
  const careIndexScore = computeScheduledCareMet(plants, tendings, from, to);

  return {
    tending: total > 0 ? Math.round((t / total) * 100) : 0,
    watering: total > 0 ? Math.round((w / total) * 100) : 0,
    sunlight: total > 0 ? Math.round((s / total) * 100) : 0,
    fruit: total > 0 ? Math.round((f / total) * 100) : 0,
    pruning: total > 0 ? Math.round((p / total) * 100) : 0,
    total,
    careIndexScore,
  };
}

function computeLifecycleVelocity(plants: HarvestPlant[], from: number, to: number): LifecycleVelocity {
  const windowMs = to - from;
  let seeds = 0;
  let shoots = 0;
  let mature = 0;

  for (const p of plants) {
    const ageMs = to - p.created_at;
    const ageRatio = windowMs > 0 ? ageMs / windowMs : 1;

    if (ageRatio < 1) {
      seeds++;
    } else if (ageMs < 90 * 24 * 60 * 60 * 1000) {
      shoots++;
    } else {
      mature++;
    }
  }

  const total = plants.length;
  return {
    seeds,
    shoots,
    mature,
    seedsPercent: total > 0 ? Math.round((seeds / total) * 100) : 0,
    shootsPercent: total > 0 ? Math.round((shoots / total) * 100) : 0,
    maturePercent: total > 0 ? Math.round((mature / total) * 100) : 0,
  };
}

function computeMomentum(
  plants: HarvestPlant[],
  tendings: HarvestTending[],
  waterings: HarvestWatering[],
  sunlight: HarvestSunlight[],
  from: number,
  to: number
): Momentum {
  const midpoint = from + (to - from) / 2;

  const countBefore = new Map<string, number>();
  const countAfter = new Map<string, number>();

  const countActivity = (plantId: string, dt: number) => {
    if (dt < midpoint) {
      countBefore.set(plantId, (countBefore.get(plantId) ?? 0) + 1);
    } else {
      countAfter.set(plantId, (countAfter.get(plantId) ?? 0) + 1);
    }
  };

  for (const t of tendings) { countActivity(t.hashed_plant_id, t.datetime); }
  for (const w of waterings) { countActivity(w.hashed_plant_id, w.datetime); }
  for (const s of sunlight) { countActivity(s.hashed_plant_id, s.datetime); }

  let growing = 0;
  let steady = 0;
  let slowing = 0;

  for (const p of plants) {
    const before = countBefore.get(p.hashed_id) ?? 0;
    const after = countAfter.get(p.hashed_id) ?? 0;

    if (after > before) growing++;
    else if (after === before) steady++;
    else slowing++;
  }

  const total = plants.length;
  return {
    growing,
    steady,
    slowing,
    growingPercent: total > 0 ? Math.round((growing / total) * 100) : 0,
    steadyPercent: total > 0 ? Math.round((steady / total) * 100) : 0,
    slowingPercent: total > 0 ? Math.round((slowing / total) * 100) : 0,
  };
}

function computeHarvestRatio(fruits: HarvestFruit[], plants: HarvestPlant[], tendings: HarvestTending[]): HarvestRatio {
  const totalFruit = fruits.length;
  const totalSouls = plants.length;
  const totalTendings = tendings.length;

  return {
    fruitPerSoul: totalSouls > 0 ? parseFloat((totalFruit / totalSouls).toFixed(2)) : 0,
    fruitPerTending: totalTendings > 0 ? parseFloat((totalFruit / totalTendings).toFixed(2)) : 0,
    totalFruit,
    totalSouls,
    totalTendings,
  };
}

function computeRelationshipDepth(
  tendings: HarvestTending[],
  waterings: HarvestWatering[],
  sunlight: HarvestSunlight[],
  prunings: HarvestPruning[]
): RelationshipDepth {
  const nurturingCount = tendings.length + waterings.length + sunlight.length;
  const pruningCount = prunings.length;
  const total = nurturingCount + pruningCount;

  if (total === 0) {
    return {
      score: 0,
      nurturingCount: 0,
      pruningCount: 0,
      label: 'No activity recorded',
      description: 'No care activities have been recorded for this period.',
    };
  }

  const ratio = nurturingCount / total;
  const score = Math.round(ratio * 100);

  let label: string;
  let description: string;

  if (score >= 90) {
    label = 'Still taking root';
    description = 'Relationships are primarily nurturing. Deeper bonds may be needed before honest correction can flourish.';
  } else if (score >= 70) {
    label = 'Growing in depth';
    description = 'A healthy balance of care and honest conversation. Relationships are maturing well.';
  } else if (score >= 50) {
    label = 'Deeply rooted';
    description = 'Strong, honest relationships where both nourishment and gentle correction are present.';
  } else {
    label = 'Needs more nourishment';
    description = 'Correction is outpacing care. Ensure relationships are well nourished before deeper challenges are offered.';
  }

  return { score, nurturingCount, pruningCount, label, description };
}

function computePruningPulse(prunings: HarvestPruning[], plants: HarvestPlant[]): PruningPulse {
  const count = prunings.length;
  const perSoul = plants.length > 0 ? parseFloat((count / plants.length).toFixed(2)) : 0;

  const byMonthMap = new Map<string, number>();
  for (const p of prunings) {
    const key = monthKey(p.datetime);
    byMonthMap.set(key, (byMonthMap.get(key) ?? 0) + 1);
  }

  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return { count, perSoul, byMonth };
}

function computeWeeklyPattern(
  tendings: HarvestTending[],
  waterings: HarvestWatering[],
  sunlight: HarvestSunlight[]
): WeeklyPattern[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const map = new Map<string, WeeklyPattern>();

  for (const d of days) {
    map.set(d, { day: d, tending: 0, watering: 0, sunlight: 0 });
  }

  for (const t of tendings) {
    const d = dayOfWeek(t.datetime);
    map.get(d)!.tending++;
  }
  for (const w of waterings) {
    const d = dayOfWeek(w.datetime);
    map.get(d)!.watering++;
  }
  for (const s of sunlight) {
    const d = dayOfWeek(s.datetime);
    map.get(d)!.sunlight++;
  }

  return days.map(d => map.get(d)!);
}

function computeMonthlyTrend(
  tendings: HarvestTending[],
  waterings: HarvestWatering[],
  sunlight: HarvestSunlight[],
  fruits: HarvestFruit[],
  prunings: HarvestPruning[]
): MonthlyTrend[] {
  const map = new Map<string, MonthlyTrend>();

  const ensure = (key: string) => {
    if (!map.has(key)) {
      map.set(key, { month: key, tending: 0, watering: 0, sunlight: 0, fruit: 0, pruning: 0, total: 0 });
    }
    return map.get(key)!;
  };

  for (const t of tendings) { const e = ensure(monthKey(t.datetime)); e.tending++; e.total++; }
  for (const w of waterings) { const e = ensure(monthKey(w.datetime)); e.watering++; e.total++; }
  for (const s of sunlight) { const e = ensure(monthKey(s.datetime)); e.sunlight++; e.total++; }
  for (const f of fruits) { const e = ensure(monthKey(f.datetime)); e.fruit++; e.total++; }
  for (const p of prunings) { const e = ensure(monthKey(p.datetime)); e.pruning++; e.total++; }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function mergeReports(reports: HarvestReport[]): HarvestReport {
  if (reports.length === 0) {
    throw new Error('No reports to merge');
  }

  if (reports.length === 1) return reports[0];

  const fromMs = Math.min(...reports.map(r => r.date_range.from));
  const toMs = Math.max(...reports.map(r => r.date_range.to));

  const plantMap = new Map<string, HarvestPlant>();
  for (const r of reports) {
    for (const p of r.plants) {
      if (!plantMap.has(p.hashed_id)) plantMap.set(p.hashed_id, p);
    }
  }

  return {
    schema_version: 1.1,
    generated_at: Date.now(),
    date_range: { from: fromMs, to: toMs },
    plants: Array.from(plantMap.values()),
    tendings: reports.flatMap(r => r.tendings),
    waterings: reports.flatMap(r => r.waterings),
    sunlight: reports.flatMap(r => r.sunlight),
    fruits: reports.flatMap(r => r.fruits),
    prunings: reports.flatMap(r => r.prunings),
    plots: reports.flatMap(r => r.plots),
  };
}

export function computeAll(report: HarvestReport): CollectivePulse {
  const { plants, tendings, waterings, sunlight, fruits, prunings, date_range, plots } = report;

  const ageGroups = computeAgeGroups(plants);
  const careIndex = computeCareIndex(plants, date_range.to);
  const gardenBalance = computeGardenBalance(plants, tendings, waterings, sunlight, fruits, prunings, date_range.from, date_range.to);
  const lifecycleVelocity = computeLifecycleVelocity(plants, date_range.from, date_range.to);
  const momentum = computeMomentum(plants, tendings, waterings, sunlight, date_range.from, date_range.to);
  const harvestRatio = computeHarvestRatio(fruits, plants, tendings);
  const pruningPulse = computePruningPulse(prunings, plants);
  const relationshipDepth = computeRelationshipDepth(tendings, waterings, sunlight, prunings);
  const weeklyPattern = computeWeeklyPattern(tendings, waterings, sunlight);
  const monthlyTrend = computeMonthlyTrend(tendings, waterings, sunlight, fruits, prunings);

  const totalPlotMembers = plots.reduce((sum, p) => sum + p.member_count, 0);
  const averagePlotSize = plots.length > 0 ? parseFloat((totalPlotMembers / plots.length).toFixed(1)) : 0;

  const plantCreatedAts = plants.map(p => p.created_at);
  const sowingWindows = getSowingWindowOverlaps(
    new Date(date_range.from),
    new Date(date_range.to),
    plantCreatedAts
  );

  return {
    souls: plants.length,
    dateRange: date_range,
    ageGroups,
    careIndex,
    gardenBalance,
    lifecycleVelocity,
    momentum,
    harvestRatio,
    pruningPulse,
    relationshipDepth,
    weeklyPattern,
    monthlyTrend,
    plotCount: plots.length,
    averagePlotSize,
    sowingWindows,
  };
}
