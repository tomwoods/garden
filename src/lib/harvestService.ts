import alasql from 'alasql';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

export interface AgeInfo {
  age: number;
  timestamp_age_poll: number;
  is_over_21: boolean;
}

export type AgeGroup = 'adult' | 'voting_youth' | 'youth' | 'junior_youth' | 'child';

export interface AgeGroupCounts {
  adult: number;
  voting_youth: number;
  youth: number;
  junior_youth: number;
  child: number;
}

export function resolveEffectiveAge(ageInfo: AgeInfo): number {
  const elapsedMs = Date.now() - ageInfo.timestamp_age_poll;
  const elapsedYears = elapsedMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(ageInfo.age + elapsedYears);
}

export function resolveAgeGroup(ageInfo: AgeInfo | undefined): AgeGroup {
  if (!ageInfo || ageInfo.is_over_21) return 'adult';
  const age = resolveEffectiveAge(ageInfo);
  if (age >= 21) return 'adult';
  if (age >= 18) return 'voting_youth';
  if (age >= 15) return 'youth';
  if (age >= 12) return 'junior_youth';
  return 'child';
}

export function resolveAgeGroupLabel(group: AgeGroup): string {
  switch (group) {
    case 'adult': return 'adult';
    case 'voting_youth': return 'voting youth';
    case 'youth': return 'youth';
    case 'junior_youth': return 'junior_youth';
    case 'child': return 'child';
  }
}

export interface HarvestPlant {
  hashed_id: string;
  created_at: number;
  care_frequency_multiplier: number;
  care_frequency_unit: 'days' | 'weeks';
  age_group: AgeGroup;
}

export interface HarvestTending {
  hashed_plant_id: string;
  datetime: number;
  type: string;
}

export interface HarvestWatering {
  hashed_plant_id: string;
  datetime: number;
  source: string;
}

export interface HarvestSunlight {
  hashed_plant_id: string;
  datetime: number;
  topic: string;
}

export interface HarvestFruit {
  hashed_plant_id: string;
  datetime: number;
}

export interface HarvestPruning {
  hashed_plant_id: string;
  datetime: number;
}

export interface HarvestPlotCount {
  hashed_plot_id: string;
  member_count: number;
}

export interface HarvestReport {
  schema_version: number;
  generated_at: number;
  date_range: {
    from: number;
    to: number;
  };
  plants: HarvestPlant[];
  tendings: HarvestTending[];
  waterings: HarvestWatering[];
  sunlight: HarvestSunlight[];
  fruits: HarvestFruit[];
  prunings: HarvestPruning[];
  plots: HarvestPlotCount[];
}

export interface HarvestPreview {
  souls: number;
  tendings: number;
  waterings: number;
  sunlight: number;
  fruits: number;
  prunings: number;
  plots: number;
  dateFrom: Date;
  dateTo: Date;
  ageGroups?: AgeGroupCounts;
}

function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

function hashId(id: string, salt: string): string {
  const combined = salt + ':' + id;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(combined);
  const digest = sha256(bytes);
  return bytesToHex(digest).slice(0, 16);
}

export function parseAgeInfoFromPlant(plant: { additional_info?: string | null }): AgeInfo | undefined {
  return parseAgeInfo(plant.additional_info);
}

function parseAgeInfo(additionalInfo: string | null | undefined): AgeInfo | undefined {
  if (!additionalInfo) return undefined;
  try {
    const parsed = JSON.parse(additionalInfo);
    if (parsed.age_info && typeof parsed.age_info.age === 'number' && typeof parsed.age_info.timestamp_age_poll === 'number') {
      return parsed.age_info as AgeInfo;
    }
  } catch {}
  return undefined;
}

function computeAgeGroups(rawPlants: { additional_info?: string | null }[]): AgeGroupCounts | undefined {
  const counts: AgeGroupCounts = { adult: 0, voting_youth: 0, youth: 0, junior_youth: 0, child: 0 };
  let hasKnownAge = false;

  for (const p of rawPlants) {
    const ageInfo = parseAgeInfo(p.additional_info);
    if (ageInfo && !ageInfo.is_over_21) {
      hasKnownAge = true;
    }
    const group = resolveAgeGroup(ageInfo);
    counts[group]++;
  }

  return hasKnownAge ? counts : undefined;
}

export function generateHarvestPreview(dateFrom: Date, dateTo: Date, plantIdFilter?: string[]): HarvestPreview {
  const fromMs = dateFrom.getTime();
  const toMs = dateTo.getTime();

  if (plantIdFilter) {
    if (plantIdFilter.length === 0) {
      return {
        souls: 0,
        tendings: 0,
        waterings: 0,
        sunlight: 0,
        fruits: 0,
        prunings: 0,
        plots: 0,
        dateFrom,
        dateTo,
        ageGroups: undefined,
      };
    }

    const ids = plantIdFilter;
    const rawPlants: { additional_info?: string | null }[] = alasql(
      `SELECT additional_info FROM plants WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );

    const countActivity = (table: string): number => {
      const rows: { cnt: number }[] = alasql(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE datetime >= ? AND datetime <= ? AND plant_id IN (${ids.map(() => '?').join(',')})`,
        [fromMs, toMs, ...ids]
      );
      return rows[0]?.cnt ?? 0;
    };

    const plotRows: { plot_id: string }[] = alasql(
      `SELECT DISTINCT plot_id FROM plot_memberships WHERE plant_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );

    return {
      souls: ids.length,
      tendings: countActivity('tendings'),
      waterings: countActivity('waterings'),
      sunlight: countActivity('sunlight'),
      fruits: countActivity('fruits'),
      prunings: countActivity('prunings'),
      plots: plotRows.length,
      dateFrom,
      dateTo,
      ageGroups: computeAgeGroups(rawPlants),
    };
  }

  const plantRows: { cnt: number }[] = alasql('SELECT COUNT(*) as cnt FROM plants');
  const tendingCount: { cnt: number }[] = alasql('SELECT COUNT(*) as cnt FROM tendings WHERE datetime >= ? AND datetime <= ?', [fromMs, toMs]);
  const wateringCount: { cnt: number }[] = alasql('SELECT COUNT(*) as cnt FROM waterings WHERE datetime >= ? AND datetime <= ?', [fromMs, toMs]);
  const sunlightCount: { cnt: number }[] = alasql('SELECT COUNT(*) as cnt FROM sunlight WHERE datetime >= ? AND datetime <= ?', [fromMs, toMs]);
  const fruitCount: { cnt: number }[] = alasql('SELECT COUNT(*) as cnt FROM fruits WHERE datetime >= ? AND datetime <= ?', [fromMs, toMs]);
  const pruningCount: { cnt: number }[] = alasql('SELECT COUNT(*) as cnt FROM prunings WHERE datetime >= ? AND datetime <= ?', [fromMs, toMs]);
  const plotCount: { cnt: number }[] = alasql('SELECT COUNT(*) as cnt FROM plots');

  const rawPlants: { additional_info?: string | null }[] = alasql('SELECT additional_info FROM plants');
  const ageGroups = computeAgeGroups(rawPlants);

  return {
    souls: plantRows[0]?.cnt ?? 0,
    tendings: tendingCount[0]?.cnt ?? 0,
    waterings: wateringCount[0]?.cnt ?? 0,
    sunlight: sunlightCount[0]?.cnt ?? 0,
    fruits: fruitCount[0]?.cnt ?? 0,
    prunings: pruningCount[0]?.cnt ?? 0,
    plots: plotCount[0]?.cnt ?? 0,
    dateFrom,
    dateTo,
    ageGroups,
  };
}

export async function generatePersonalHarvest(dateFrom: Date, dateTo: Date, plantIdFilter?: string[]): Promise<HarvestReport> {
  const fromMs = dateFrom.getTime();
  const toMs = dateTo.getTime();
  const salt = generateSalt();

  const allRawPlants: { id: string; created_at: number; care_frequency_multiplier: number; care_frequency_unit: string; additional_info?: string | null }[] =
    alasql('SELECT id, created_at, care_frequency_multiplier, care_frequency_unit, additional_info FROM plants');

  const rawPlants = plantIdFilter
    ? allRawPlants.filter(p => plantIdFilter.includes(p.id))
    : allRawPlants;

  const plants: HarvestPlant[] = rawPlants.map(p => {
    const ageInfo = parseAgeInfo(p.additional_info);
    return {
      hashed_id: hashId(p.id, salt),
      created_at: p.created_at,
      care_frequency_multiplier: p.care_frequency_multiplier,
      care_frequency_unit: p.care_frequency_unit as 'days' | 'weeks',
      age_group: resolveAgeGroup(ageInfo),
    };
  });

  const filterIds = plantIdFilter ?? rawPlants.map(p => p.id);

  const queryActivity = <T>(table: string, cols: string): T[] => {
    if (filterIds.length === 0) return [];
    return alasql(
      `SELECT ${cols} FROM ${table} WHERE datetime >= ? AND datetime <= ? AND plant_id IN (${filterIds.map(() => '?').join(',')})`,
      [fromMs, toMs, ...filterIds]
    );
  };

  const rawTendings: { plant_id: string; datetime: number; type: string }[] =
    queryActivity('tendings', 'plant_id, datetime, type');

  const tendings: HarvestTending[] = rawTendings.map(t => ({
    hashed_plant_id: hashId(t.plant_id, salt),
    datetime: t.datetime,
    type: t.type,
  }));

  const rawWaterings: { plant_id: string; datetime: number; source: string }[] =
    queryActivity('waterings', 'plant_id, datetime, source');

  const waterings: HarvestWatering[] = rawWaterings.map(w => ({
    hashed_plant_id: hashId(w.plant_id, salt),
    datetime: w.datetime,
    source: w.source,
  }));

  const rawSunlight: { plant_id: string; datetime: number; topic: string }[] =
    queryActivity('sunlight', 'plant_id, datetime, topic');

  const sunlight: HarvestSunlight[] = rawSunlight.map(s => ({
    hashed_plant_id: hashId(s.plant_id, salt),
    datetime: s.datetime,
    topic: s.topic,
  }));

  const rawFruits: { plant_id: string; datetime: number }[] =
    queryActivity('fruits', 'plant_id, datetime');

  const fruits: HarvestFruit[] = rawFruits.map(f => ({
    hashed_plant_id: hashId(f.plant_id, salt),
    datetime: f.datetime,
  }));

  const rawPrunings: { plant_id: string; datetime: number }[] =
    queryActivity('prunings', 'plant_id, datetime');

  const prunings: HarvestPruning[] = rawPrunings.map(p => ({
    hashed_plant_id: hashId(p.plant_id, salt),
    datetime: p.datetime,
  }));

  const plotRows: { plot_id: string }[] = filterIds.length === 0
    ? []
    : alasql(
        `SELECT DISTINCT plot_id FROM plot_memberships WHERE plant_id IN (${filterIds.map(() => '?').join(',')})`,
        filterIds
      );

  const plots: HarvestPlotCount[] = plotRows.map(row => {
    const memberRows: { cnt: number }[] = filterIds.length === 0
      ? [{ cnt: 0 }]
      : alasql(
          `SELECT COUNT(*) as cnt FROM plot_memberships WHERE plot_id = ? AND plant_id IN (${filterIds.map(() => '?').join(',')})`,
          [row.plot_id, ...filterIds]
        );
    return {
      hashed_plot_id: hashId(row.plot_id, salt),
      member_count: memberRows[0]?.cnt ?? 0,
    };
  });

  return {
    schema_version: 1.1,
    generated_at: Date.now(),
    date_range: { from: fromMs, to: toMs },
    plants,
    tendings,
    waterings,
    sunlight,
    fruits,
    prunings,
    plots,
  };
}

export function downloadHarvestReport(report: HarvestReport): void {
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date(report.generated_at);
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  a.href = url;
  a.download = `garden-harvest-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
