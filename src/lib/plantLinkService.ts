/**
 * PlantLinkService — bidirectional linking between personal garden plants
 * and shared garden plants.
 *
 * Link record is stored as JSON in plant.additional_info under the key
 * "sharedGardenLink": { gardenId, sharedPlantId }
 *
 * Rules:
 * - Sharing a personal plant to a shared garden copies profile fields only (no activities).
 * - Importing a shared plant to personal garden copies profile + only the current gardener's own activities.
 * - When the current gardener adds an activity in the shared garden on a linked plant,
 *   that activity is mirrored to the personal garden.
 * - Activities by OTHER gardeners in the shared garden are NOT mirrored.
 * - Removing a plant from either side silently breaks the link (no warning).
 */

import { DatabaseService, type Plant, type Tending, type Watering, type Sunlight, type Fruit, type Pruning } from './database';
import { SharedGardenDatabase } from './sharedGardenDatabase';
import { v4 as uuidv4 } from 'uuid';

// ─── Link metadata stored inside plant.additional_info ────────────────────────

interface SharedGardenLink {
  gardenId: string;
  sharedPlantId: string;
}

function parseAdditionalInfo(plant: Plant): Record<string, unknown> {
  if (!plant.additional_info) return {};
  try { return JSON.parse(plant.additional_info); } catch { return {}; }
}

function serializeAdditionalInfo(info: Record<string, unknown>): string | null {
  return Object.keys(info).length > 0 ? JSON.stringify(info) : null;
}

export function getPlantLink(plant: Plant): SharedGardenLink | null {
  const info = parseAdditionalInfo(plant);
  return (info.sharedGardenLink as SharedGardenLink) ?? null;
}

function setPlantLink(plant: Plant, link: SharedGardenLink | null): string | null {
  const info = parseAdditionalInfo(plant);
  if (link) {
    info.sharedGardenLink = link;
  } else {
    delete info.sharedGardenLink;
  }
  return serializeAdditionalInfo(info);
}

// ─── Link a personal plant into a shared garden ───────────────────────────────

export async function linkPlantToSharedGarden(
  personalPlantId: string,
  gardenId: string,
  authorUuid: string,
  authorDisplayName: string
): Promise<string | null> {
  const personalPlant = await DatabaseService.getPlant(personalPlantId);
  if (!personalPlant) return null;

  // Copy profile fields (no activities) into the shared garden
  const sharedPlant = SharedGardenDatabase.addPlant(
    gardenId,
    {
      name: personalPlant.name,
      email: personalPlant.email,
      phone: personalPlant.phone,
      description: personalPlant.description,
      care_frequency_multiplier: personalPlant.care_frequency_multiplier,
      care_frequency_unit: personalPlant.care_frequency_unit,
      last_interaction: personalPlant.last_interaction,
      last_cared_for: personalPlant.last_cared_for,
      next_scheduled_care: personalPlant.next_scheduled_care,
      additional_info: (() => {
        // Carry location forward but add the back-link
        const info = parseAdditionalInfo(personalPlant);
        delete info.sharedGardenLink;
        info.linkedPersonalPlantId = personalPlantId;
        return serializeAdditionalInfo(info);
      })(),
    },
    authorUuid,
    authorDisplayName
  );

  // Store forward link in personal plant
  const newInfo = setPlantLink(personalPlant, { gardenId, sharedPlantId: sharedPlant.id });
  await DatabaseService.updatePlant(personalPlantId, { additional_info: newInfo ?? undefined });

  return sharedPlant.id;
}

// ─── Import a shared plant into the personal garden ───────────────────────────

export async function importPlantFromSharedGarden(
  sharedPlantId: string,
  gardenId: string,
  myUuid: string
): Promise<string | null> {
  const sharedPlant = SharedGardenDatabase.getPlant(gardenId, sharedPlantId);
  if (!sharedPlant) return null;

  // Build additional_info for personal plant — carry the back-link
  const sharedInfo = parseAdditionalInfo(sharedPlant);
  delete sharedInfo.linkedPersonalPlantId;
  const personalInfo: Record<string, unknown> = { ...sharedInfo };

  const newPersonalPlant = await DatabaseService.addPlant({
    name: sharedPlant.name,
    email: sharedPlant.email,
    phone: sharedPlant.phone,
    description: sharedPlant.description,
    care_frequency_multiplier: sharedPlant.care_frequency_multiplier,
    care_frequency_unit: sharedPlant.care_frequency_unit,
    last_interaction: sharedPlant.last_interaction,
    last_cared_for: sharedPlant.last_cared_for,
    next_scheduled_care: sharedPlant.next_scheduled_care,
    additional_info: serializeAdditionalInfo(personalInfo) ?? undefined,
  });

  // Store forward link in personal plant
  const withLink = setPlantLink(newPersonalPlant, { gardenId, sharedPlantId });
  await DatabaseService.updatePlant(newPersonalPlant.id, { additional_info: withLink ?? undefined });

  // Store back-link in shared plant
  const sInfo = parseAdditionalInfo(sharedPlant);
  sInfo.linkedPersonalPlantId = newPersonalPlant.id;
  SharedGardenDatabase.updatePlant(gardenId, sharedPlantId, { additional_info: serializeAdditionalInfo(sInfo) }, myUuid, '');

  // Copy only the current gardener's own activities from shared garden to personal
  await _copyOwnActivitiesToPersonal(gardenId, sharedPlantId, newPersonalPlant.id, myUuid);

  return newPersonalPlant.id;
}

async function _copyOwnActivitiesToPersonal(
  gardenId: string,
  sharedPlantId: string,
  personalPlantId: string,
  myUuid: string
): Promise<void> {
  const tendings = SharedGardenDatabase.getTendingsForPlant(gardenId, sharedPlantId)
    .filter((t: Tending & { authored_by_uuid?: string }) => t.authored_by_uuid === myUuid);
  for (const t of tendings) {
    await DatabaseService.addTending({ plant_id: personalPlantId, datetime: t.datetime, type: t.type, summary: t.summary ?? '', additional_info: t.additional_info });
  }

  const waterings = SharedGardenDatabase.getWateringsForPlant(gardenId, sharedPlantId)
    .filter((w: Watering & { authored_by_uuid?: string }) => w.authored_by_uuid === myUuid);
  for (const w of waterings) {
    await DatabaseService.addWatering({ plant_id: personalPlantId, datetime: w.datetime, source: w.source, progress_description: w.progress_description ?? '' });
  }

  const sunlights = SharedGardenDatabase.getSunlightForPlant(gardenId, sharedPlantId)
    .filter((s: Sunlight & { authored_by_uuid?: string }) => s.authored_by_uuid === myUuid);
  for (const s of sunlights) {
    await DatabaseService.addSunlight({ plant_id: personalPlantId, datetime: s.datetime, topic: s.topic });
  }

  const fruits = SharedGardenDatabase.getFruitsForPlant(gardenId, sharedPlantId)
    .filter((f: Fruit & { authored_by_uuid?: string }) => f.authored_by_uuid === myUuid);
  for (const f of fruits) {
    await DatabaseService.addFruit({ plant_id: personalPlantId, datetime: f.datetime, description: f.description, basic_activity: f.basic_activity });
  }

  const prunings = SharedGardenDatabase.getPruningsForPlant(gardenId, sharedPlantId)
    .filter((p: Pruning & { authored_by_uuid?: string }) => p.authored_by_uuid === myUuid);
  for (const p of prunings) {
    await DatabaseService.addPruning({ plant_id: personalPlantId, datetime: p.datetime, difficulty: p.difficulty, description: p.description ?? '' });
  }
}

// ─── Mirror a shared-garden activity to personal garden (only own activities) ──

export async function mirrorActivityToPersonalGarden(
  gardenId: string,
  sharedPlantId: string,
  activityTable: string,
  activityData: Record<string, unknown>,
  authoredByUuid: string,
  myUuid: string
): Promise<void> {
  // Only mirror the current gardener's own activities
  if (authoredByUuid !== myUuid) return;

  // Find the linked personal plant
  const sharedPlant = SharedGardenDatabase.getPlant(gardenId, sharedPlantId);
  if (!sharedPlant) return;

  const sharedInfo = parseAdditionalInfo(sharedPlant);
  const linkedPersonalPlantId = sharedInfo.linkedPersonalPlantId as string | undefined;
  if (!linkedPersonalPlantId) return;

  const personalPlant = await DatabaseService.getPlant(linkedPersonalPlantId);
  if (!personalPlant) return;

  const datetime = activityData.datetime as number ?? Date.now();

  switch (activityTable) {
    case 'tendings':
      await DatabaseService.addTending({
        plant_id: linkedPersonalPlantId,
        datetime,
        type: activityData.type as string ?? '',
        summary: activityData.summary as string ?? '',
      });
      break;
    case 'waterings':
      await DatabaseService.addWatering({
        plant_id: linkedPersonalPlantId,
        datetime,
        source: activityData.source as string ?? '',
        progress_description: activityData.progress_description as string ?? '',
      });
      break;
    case 'sunlight':
      await DatabaseService.addSunlight({
        plant_id: linkedPersonalPlantId,
        datetime,
        topic: activityData.topic as string ?? '',
      });
      break;
    case 'fruits':
      await DatabaseService.addFruit({
        plant_id: linkedPersonalPlantId,
        datetime,
        description: activityData.description as string ?? '',
        basic_activity: activityData.basic_activity as string | undefined,
      });
      break;
    case 'prunings':
      await DatabaseService.addPruning({
        plant_id: linkedPersonalPlantId,
        datetime,
        difficulty: activityData.difficulty as string ?? '',
        description: activityData.description as string ?? '',
      });
      break;
  }
}

// ─── Break the link silently ───────────────────────────────────────────────────

export async function breakPlantLink(personalPlantId: string): Promise<void> {
  const plant = await DatabaseService.getPlant(personalPlantId);
  if (!plant) return;
  const info = parseAdditionalInfo(plant);
  delete info.sharedGardenLink;
  await DatabaseService.updatePlant(personalPlantId, { additional_info: serializeAdditionalInfo(info) ?? undefined });
}
