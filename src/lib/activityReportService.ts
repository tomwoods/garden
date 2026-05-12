import dayjs from 'dayjs';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { SharedGardenDatabase } from './sharedGardenDatabase';
import type { Plant } from './database';
import {
  downloadHarvestReport,
  type HarvestReport,
  type HarvestPlant,
  type HarvestTending,
  type HarvestWatering,
  type HarvestSunlight,
  type HarvestFruit,
  type HarvestPruning,
  type HarvestPlotCount,
} from './harvestService';
import { parseAgeInfoFromPlant, resolveAgeGroup } from './harvestService';

export type TFunction = (key: string, opts?: Record<string, unknown>) => string;

export interface ReportParagraph {
  text: string;
}

export interface ReportDay {
  dateLabel: string; // e.g. "Tuesday, June 24, 2025"
  dateKey: string;   // YYYY-MM-DD for deduplication
  paragraphs: ReportParagraph[];
}

export type PlainTextReport = ReportDay[];

function formatTime(ms: number): string {
  return dayjs(ms).format('h:mma');
}

function formatDate(ms: number): string {
  return dayjs(ms).format('dddd, MMMM D, YYYY');
}

function formatDateKey(ms: number): string {
  return dayjs(ms).format('YYYY-MM-DD');
}

function listNames(names: string[], t: TFunction): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return t('activityReport.sentences.listTwo', { a: names[0], b: names[1] });
  const rest = names.slice(0, -1).join(', ');
  const last = names[names.length - 1];
  return t('activityReport.sentences.listMany', { rest, last });
}

// Groups records that share the same authored_by_uuid, datetime, and type key
// so bulk/plot activities are collapsed into a single paragraph.
function groupByKey<T extends { datetime: number; authored_by_uuid: string }>(
  records: T[],
  typeKey: (r: T) => string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of records) {
    const k = `${r.authored_by_uuid}::${r.datetime}::${typeKey(r)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return map;
}

type WithAuthor = { authored_by_display_name: string; authored_by_uuid: string };

export async function buildPlainTextReport(
  gardenId: string,
  fromMs: number,
  toMs: number,
  plants: Plant[],
  t: TFunction
): Promise<PlainTextReport> {
  const plantMap = new Map<string, string>(plants.map(p => [p.id, p.name]));

  const tendings = SharedGardenDatabase.getAllTendingsByRange(gardenId, fromMs, toMs) as (ReturnType<typeof SharedGardenDatabase.getAllTendingsByRange>[number] & WithAuthor)[];
  const waterings = SharedGardenDatabase.getAllWateringsByRange(gardenId, fromMs, toMs) as (ReturnType<typeof SharedGardenDatabase.getAllWateringsByRange>[number] & WithAuthor)[];
  const sunlights = SharedGardenDatabase.getAllSunlightByRange(gardenId, fromMs, toMs) as (ReturnType<typeof SharedGardenDatabase.getAllSunlightByRange>[number] & WithAuthor)[];
  const fruits = SharedGardenDatabase.getAllFruitsByRange(gardenId, fromMs, toMs) as (ReturnType<typeof SharedGardenDatabase.getAllFruitsByRange>[number] & WithAuthor)[];
  const prunings = SharedGardenDatabase.getAllPruningsByRange(gardenId, fromMs, toMs) as (ReturnType<typeof SharedGardenDatabase.getAllPruningsByRange>[number] & WithAuthor)[];
  const notchings = SharedGardenDatabase.getAllNotchingsByRange(gardenId, fromMs, toMs) as (ReturnType<typeof SharedGardenDatabase.getAllNotchingsByRange>[number] & WithAuthor)[];

  // Collect all paragraphs with their timestamp for day-bucketing
  const allParagraphs: { ts: number; text: string }[] = [];

  // Tendings
  const tendingGroups = groupByKey(tendings, r => r.type);
  for (const group of tendingGroups.values()) {
    const first = group[0];
    const time = formatTime(first.datetime);
    const actor = first.authored_by_display_name || 'Someone';
    const names = group.map(r => plantMap.get(r.plant_id) || 'someone');
    const names_str = listNames(names, t);
    const typeSlug = first.type || 'conversation';
    const knownSlugs = ['conversation', 'coffee', 'meal', 'call', 'message', 'activity'];
    const typeLabel = knownSlugs.includes(typeSlug)
      ? t(`activity.interactionTypes.${typeSlug}`, { ns: 'modals', defaultValue: typeSlug })
      : typeSlug;
    const key = first.summary ? 'activityReport.sentences.tendingWithSummary' : 'activityReport.sentences.tending';
    const text = t(key, { time, actor, type: typeLabel, names: names_str, summary: first.summary ?? '' });
    allParagraphs.push({ ts: first.datetime, text });
  }

  // Waterings (study)
  const wateringGroups = groupByKey(waterings, r => r.source);
  for (const group of wateringGroups.values()) {
    const first = group[0];
    const time = formatTime(first.datetime);
    const actor = first.authored_by_display_name || 'Someone';
    const names = group.map(r => plantMap.get(r.plant_id) || 'someone');
    const names_str = listNames(names, t);
    const source = first.source || 'a sacred text';
    const key = first.progress_description ? 'activityReport.sentences.wateringWithNotes' : 'activityReport.sentences.watering';
    const text = t(key, { time, actor, source, names: names_str, notes: first.progress_description ?? '' });
    allParagraphs.push({ ts: first.datetime, text });
  }

  // Sunlight (prayer)
  const sunlightGroups = groupByKey(sunlights, r => r.topic || '');
  for (const group of sunlightGroups.values()) {
    const first = group[0];
    const time = formatTime(first.datetime);
    const actor = first.authored_by_display_name || 'Someone';
    const names = group.map(r => plantMap.get(r.plant_id) || 'someone');
    const names_str = listNames(names, t);
    const key = first.topic ? 'activityReport.sentences.sunlightWithTopic' : 'activityReport.sentences.sunlight';
    const text = t(key, { time, actor, names: names_str, topic: first.topic ?? '' });
    allParagraphs.push({ ts: first.datetime, text });
  }

  // Fruits (service)
  for (const r of fruits) {
    const time = formatTime(r.datetime);
    const actor = r.authored_by_display_name || 'Someone';
    const name = plantMap.get(r.plant_id) || 'someone';
    const key = r.description ? 'activityReport.sentences.fruitWithDescription' : 'activityReport.sentences.fruit';
    const text = t(key, { time, actor, name, description: r.description ?? '' });
    allParagraphs.push({ ts: r.datetime, text });
  }

  // Prunings (difficult conversations)
  for (const r of prunings) {
    const time = formatTime(r.datetime);
    const actor = r.authored_by_display_name || 'Someone';
    const name = plantMap.get(r.plant_id) || 'someone';
    const key = r.description ? 'activityReport.sentences.pruningWithDescription' : 'activityReport.sentences.pruning';
    const text = t(key, { time, actor, name, description: r.description ?? '' });
    allParagraphs.push({ ts: r.datetime, text });
  }

  // Notchings (focused study with book reference)
  const notchingGroups = groupByKey(notchings, r => `${r.book}::${r.start_unit}::${r.end_unit}`);
  for (const group of notchingGroups.values()) {
    const first = group[0];
    const time = formatTime(first.datetime);
    const actor = first.authored_by_display_name || 'Someone';
    const names = group.map(r => plantMap.get(r.plant_id) || 'someone');
    const names_str = listNames(names, t);
    const book = first.book || 'a text';
    const hasRange = first.start_unit !== undefined && first.end_unit !== undefined;
    let key: string;
    if (!hasRange) {
      key = 'activityReport.sentences.notchingSimple';
    } else if (first.progress_description) {
      key = 'activityReport.sentences.notchingWithNotes';
    } else {
      key = 'activityReport.sentences.notching';
    }
    const text = t(key, {
      time, actor, book, names: names_str,
      start: first.start_unit ?? '',
      end: first.end_unit ?? '',
      sections: first.sections_studied ?? '',
      notes: first.progress_description ?? '',
    });
    allParagraphs.push({ ts: first.datetime, text });
  }

  if (allParagraphs.length === 0) return [];

  // Sort all paragraphs by time ascending
  allParagraphs.sort((a, b) => a.ts - b.ts);

  // Bucket into days
  const dayMap = new Map<string, ReportDay>();
  for (const p of allParagraphs) {
    const key = formatDateKey(p.ts);
    if (!dayMap.has(key)) {
      dayMap.set(key, { dateKey: key, dateLabel: formatDate(p.ts), paragraphs: [] });
    }
    dayMap.get(key)!.paragraphs.push({ text: p.text });
  }

  return Array.from(dayMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
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

export function generateSharedGardenHarvest(
  gardenId: string,
  fromMs: number,
  toMs: number,
  plants: Plant[]
): HarvestReport {
  const salt = generateSalt();

  const harvestPlants: HarvestPlant[] = plants.map(p => {
    const ageInfo = parseAgeInfoFromPlant(p);
    return {
      hashed_id: hashId(p.id, salt),
      created_at: p.created_at,
      care_frequency_multiplier: p.care_frequency_multiplier,
      care_frequency_unit: (p.care_frequency_unit || 'weeks') as 'days' | 'weeks',
      age_group: resolveAgeGroup(ageInfo),
    };
  });

  const plantIds = plants.map(p => p.id);

  const rawTendings = SharedGardenDatabase.getAllTendingsByRange(gardenId, fromMs, toMs)
    .filter(t => plantIds.includes(t.plant_id));
  const tendings: HarvestTending[] = rawTendings.map(t => ({
    hashed_plant_id: hashId(t.plant_id, salt),
    datetime: t.datetime,
    type: t.type,
  }));

  const rawWaterings = SharedGardenDatabase.getAllWateringsByRange(gardenId, fromMs, toMs)
    .filter(w => plantIds.includes(w.plant_id));
  const waterings: HarvestWatering[] = rawWaterings.map(w => ({
    hashed_plant_id: hashId(w.plant_id, salt),
    datetime: w.datetime,
    source: w.source,
  }));

  const rawSunlight = SharedGardenDatabase.getAllSunlightByRange(gardenId, fromMs, toMs)
    .filter(s => plantIds.includes(s.plant_id));
  const sunlight: HarvestSunlight[] = rawSunlight.map(s => ({
    hashed_plant_id: hashId(s.plant_id, salt),
    datetime: s.datetime,
    topic: s.topic,
  }));

  const rawFruits = SharedGardenDatabase.getAllFruitsByRange(gardenId, fromMs, toMs)
    .filter(f => plantIds.includes(f.plant_id));
  const fruits: HarvestFruit[] = rawFruits.map(f => ({
    hashed_plant_id: hashId(f.plant_id, salt),
    datetime: f.datetime,
    ...(f.basic_activity ? { basic_activity: f.basic_activity } : {}),
  }));

  const rawPrunings = SharedGardenDatabase.getAllPruningsByRange(gardenId, fromMs, toMs)
    .filter(p => plantIds.includes(p.plant_id));
  const prunings: HarvestPruning[] = rawPrunings.map(p => ({
    hashed_plant_id: hashId(p.plant_id, salt),
    datetime: p.datetime,
  }));

  const memberships = SharedGardenDatabase.getAllPlotMemberships(gardenId);
  const plotIdSet = new Set(memberships.filter(m => plantIds.includes(m.plant_id)).map(m => m.plot_id));
  const plots: HarvestPlotCount[] = Array.from(plotIdSet).map(plotId => ({
    hashed_plot_id: hashId(plotId, salt),
    member_count: memberships.filter(m => m.plot_id === plotId && plantIds.includes(m.plant_id)).length,
  }));

  return {
    schema_version: 1.1,
    generated_at: Date.now(),
    date_range: { from: fromMs, to: toMs },
    plants: harvestPlants,
    tendings,
    waterings,
    sunlight,
    fruits,
    prunings,
    plots,
  };
}

export { downloadHarvestReport };
