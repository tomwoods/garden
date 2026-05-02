import alasql from 'alasql';
import { v4 as uuidv4 } from 'uuid';

// Configure AlaSQL to use localStorage for persistence
alasql.options.autocommit = true;

export interface Plant {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  last_interaction: number;
  created_at: number;
  updated_at: number;
  care_frequency_multiplier: number;
  care_frequency_unit: 'days' | 'weeks';
  next_scheduled_care: number;
  last_cared_for: number;
  additional_info?: string; // JSON string
}

export interface Tending {
  id: string;
  plant_id: string;
  datetime: number;
  updated_at: number;
  type: string;
  summary: string;
  additional_info?: string; // JSON string
}

export interface Watering {
  id: string;
  plant_id: string;
  datetime: number;
  updated_at: number;
  source: string;
  progress_description: string;
  additional_info?: string; // JSON string
}

export interface Sunlight {
  id: string;
  plant_id: string;
  datetime: number;
  updated_at: number;
  topic: string;
  additional_info?: string; // JSON string
}

export interface Fruit {
  id: string;
  plant_id: string;
  datetime: number;
  updated_at: number;
  description: string;
  basic_activity?: string;
  additional_info?: string; // JSON string
}

export interface Pruning {
  id: string;
  plant_id: string;
  datetime: number;
  updated_at: number;
  difficulty: string;
  description: string;
  additional_info?: string; // JSON string
}

export interface Companion {
  id: string;
  plant_a_id: string;
  relationship_descriptor: string;
  plant_b_id: string;
  updated_at: number;
  additional_info?: string; // JSON string
}

export interface ScheduledEvent {
  id: string;
  plant_id: string;
  event_type: 'tending' | 'watering';
  scheduled_date: number;
  updated_at: number;
  description?: string;
  additional_info?: string; // JSON string
}

export interface Plot {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
  additional_info?: string; // JSON string
}

export interface PlotMembership {
  id: string;
  plot_id: string;
  plant_id: string;
  updated_at: number;
}

export interface Bud {
  id: string;
  plant_id: string;
  text: string;
  created_at: number;
  updated_at: number;
}

export interface Notching {
  id: string;
  plant_id: string;
  datetime: number;
  updated_at: number;
  book: string;
  start_unit: number;
  start_section: number;
  end_unit: number;
  end_section: number;
  sections_studied: number;
  progress_description?: string;
  additional_info?: string;
}

export interface Capability {
  id: string;
  plant_id: string;
  text: string;
  created_at: number;
  updated_at: number;
}

export interface PlotWithMembers extends Plot {
  members: Plant[];
}

// Tombstone for deleted records — only populated when a plant is shared
export interface SharedPlantTombstone {
  id: string;          // UUID for this tombstone record
  record_id: string;   // ID of the deleted record
  table_name: string;  // Which table the record belonged to
  plant_id: string;    // Which plant this deletion belongs to
  deleted_at: number;  // Unix ms timestamp
}

// ─── Shared Plant types ────────────────────────────────────────────────────

export type SyncDeltaType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface SyncDelta {
  id: string;           // UUID for this delta entry
  type: SyncDeltaType;
  table: string;
  record_id: string;    // ID of the affected record
  plant_id: string;
  data?: Record<string, unknown>; // full record for INSERT/UPDATE
  ts: number;           // updated_at of the record (or deleted_at for DELETE)
  author_uuid: string;
}

export interface PlantSnapshot {
  plant: Plant;
  tendings: Tending[];
  waterings: Watering[];
  sunlight: Sunlight[];
  fruits: Fruit[];
  prunings: Pruning[];
  companions: Companion[];
  scheduled_events: ScheduledEvent[];
  buds: Bud[];
  notchings: Notching[];
  capabilities: Capability[];
  snapshot_at: number;
}

export interface PlantShareObject {
  snapshot: PlantSnapshot;
  deltas: SyncDelta[];
  schema_version: number;
}

export interface SharedPlantRef {
  plantId: string;
  sharedPlantId: string; // UUID in the shared_plants Supabase table
  role: 'owner' | 'co-tender' | 'viewer';
  ownedByMe: boolean;
  plantPublicKeyBase64: string;
}

export interface ConflictRecord {
  table: string;
  record_id: string;
  local: Record<string, unknown>;
  incoming: Record<string, unknown>;
}

// ─── Shared plant refs (localStorage) ─────────────────────────────────────

const SHARED_REFS_KEY = 'shared_plant_refs_v1';

export function getSharedPlantRefs(): SharedPlantRef[] {
  try {
    const raw = localStorage.getItem(SHARED_REFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSharedPlantRefs(refs: SharedPlantRef[]): void {
  localStorage.setItem(SHARED_REFS_KEY, JSON.stringify(refs));
}

export function addSharedPlantRef(ref: SharedPlantRef): void {
  const refs = getSharedPlantRefs();
  const existing = refs.findIndex(r => r.plantId === ref.plantId);
  if (existing >= 0) {
    refs[existing] = ref;
  } else {
    refs.push(ref);
  }
  saveSharedPlantRefs(refs);
}

export function removeSharedPlantRef(plantId: string): void {
  const refs = getSharedPlantRefs().filter(r => r.plantId !== plantId);
  saveSharedPlantRefs(refs);
}

// ─── Pending changes ───────────────────────────────────────────────────────

const PENDING_CHANGES_KEY = 'has_pending_local_changes';
let _hasPendingLocalChanges = localStorage.getItem(PENDING_CHANGES_KEY) === 'true';

export function markPendingChanges(): void {
  _hasPendingLocalChanges = true;
  localStorage.setItem(PENDING_CHANGES_KEY, 'true');
}

export function clearPendingChanges(): void {
  _hasPendingLocalChanges = false;
  localStorage.removeItem(PENDING_CHANGES_KEY);
}

export function getPendingChanges(): boolean {
  return _hasPendingLocalChanges || localStorage.getItem(PENDING_CHANGES_KEY) === 'true';
}

// ─── Per-plant pending change tracking (for shared sync) ──────────────────

export function markPlantPendingChange(plantId: string): void {
  const key = `pending_plant_${plantId}`;
  localStorage.setItem(key, Date.now().toString());
}

export function getPlantLastChange(plantId: string): number {
  const val = localStorage.getItem(`pending_plant_${plantId}`);
  return val ? parseInt(val, 10) : 0;
}

export function clearPlantPendingChange(plantId: string): void {
  localStorage.removeItem(`pending_plant_${plantId}`);
}

// ─── Shared sync timestamp per plant ──────────────────────────────────────

export function getSharedSyncTs(plantId: string): number {
  const val = localStorage.getItem(`shared_sync_ts_${plantId}`);
  return val ? parseInt(val, 10) : 0;
}

export function setSharedSyncTs(plantId: string, ts: number): void {
  localStorage.setItem(`shared_sync_ts_${plantId}`, ts.toString());
}

// ─── Tombstone helpers (only for shared plants) ───────────────────────────

function recordTombstone(recordId: string, tableName: string, plantId: string): void {
  const tombstone: SharedPlantTombstone = {
    id: uuidv4(),
    record_id: recordId,
    table_name: tableName,
    plant_id: plantId,
    deleted_at: Date.now(),
  };
  alasql('INSERT INTO shared_plant_tombstones VALUES (?, ?, ?, ?, ?)', [
    tombstone.id,
    tombstone.record_id,
    tombstone.table_name,
    tombstone.plant_id,
    tombstone.deleted_at,
  ]);
}

function isSharedPlant(plantId: string): boolean {
  return getSharedPlantRefs().some(r => r.plantId === plantId);
}

// ─── DatabaseService ───────────────────────────────────────────────────────

export class DatabaseService {
  private static initialized = false;
  private static dbName = 'GardenDB';

  static async init(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('Initializing database with localStorage...');

      await new Promise<void>((resolve, reject) => {
        alasql(`CREATE LOCALSTORAGE DATABASE IF NOT EXISTS ${this.dbName}`, [], (res: any) => {
          if (res === 1 || res === 0) { resolve(); }
          else { reject(new Error('Failed to create localStorage database')); }
        });
      });

      await new Promise<void>((resolve, reject) => {
        alasql(`ATTACH LOCALSTORAGE DATABASE ${this.dbName}`, [], (res: any) => {
          if (res === 1) { resolve(); }
          else { reject(new Error('Failed to attach to localStorage')); }
        });
      });

      await new Promise<void>((resolve, reject) => {
        alasql(`USE ${this.dbName}`, [], (res: any) => {
          if (res === 1 || res === 0) { resolve(); }
          else { reject(new Error('Failed to use localStorage database')); }
        });
      });

    } catch (error) {
      console.warn('localStorage not available, falling back to memory storage:', error);
    }

    await this.createTable('plants', `
      id STRING PRIMARY KEY,
      name STRING NOT NULL,
      email STRING,
      phone STRING,
      last_interaction NUMBER DEFAULT 0,
      created_at NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      care_frequency_multiplier NUMBER DEFAULT 2,
      care_frequency_unit STRING DEFAULT 'weeks',
      next_scheduled_care NUMBER NOT NULL,
      last_cared_for NUMBER NOT NULL,
      description STRING,
      additional_info STRING
    `);

    await this.createTable('tendings', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      type STRING NOT NULL,
      summary STRING,
      additional_info STRING
    `);

    await this.createTable('waterings', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      source STRING NOT NULL,
      progress_description STRING,
      additional_info STRING
    `);

    await this.createTable('sunlight', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      topic STRING NOT NULL,
      additional_info STRING
    `);

    await this.createTable('fruits', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      description STRING NOT NULL,
      basic_activity STRING,
      additional_info STRING
    `);

    await this.createTable('prunings', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      difficulty STRING NOT NULL,
      description STRING,
      additional_info STRING
    `);

    await this.createTable('companions', `
      id STRING PRIMARY KEY,
      plant_a_id STRING NOT NULL,
      relationship_descriptor STRING NOT NULL,
      plant_b_id STRING NOT NULL,
      updated_at NUMBER NOT NULL,
      additional_info STRING
    `);

    await this.createTable('scheduled_events', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      event_type STRING NOT NULL,
      scheduled_date NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      description STRING,
      additional_info STRING
    `);

    await this.createTable('plots', `
      id STRING PRIMARY KEY,
      name STRING NOT NULL,
      description STRING,
      created_at NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      additional_info STRING
    `);

    await this.createTable('plot_memberships', `
      id STRING PRIMARY KEY,
      plot_id STRING NOT NULL,
      plant_id STRING NOT NULL,
      updated_at NUMBER NOT NULL
    `);

    await this.createTable('buds', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      text STRING NOT NULL,
      created_at NUMBER NOT NULL,
      updated_at NUMBER NOT NULL
    `);

    await this.createTable('notchings', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      updated_at NUMBER NOT NULL,
      book STRING NOT NULL,
      start_unit NUMBER NOT NULL,
      start_section NUMBER NOT NULL,
      end_unit NUMBER NOT NULL,
      end_section NUMBER NOT NULL,
      sections_studied NUMBER NOT NULL,
      progress_description STRING,
      additional_info STRING
    `);

    await this.createTable('capabilities', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      text STRING NOT NULL,
      created_at NUMBER NOT NULL,
      updated_at NUMBER NOT NULL
    `);

    // Tombstone table — only populated for shared plants, zero overhead otherwise
    await this.createTable('shared_plant_tombstones', `
      id STRING PRIMARY KEY,
      record_id STRING NOT NULL,
      table_name STRING NOT NULL,
      plant_id STRING NOT NULL,
      deleted_at NUMBER NOT NULL
    `);

    // Backfill updated_at for any pre-existing rows that have NULL updated_at
    await this.backfillUpdatedAt();

    this.initialized = true;
    console.log('Database initialization complete');
  }

  // Backfill updated_at for records created before this migration
  private static async backfillUpdatedAt(): Promise<void> {
    const now = Date.now();
    const tables: Array<{ name: string; ts: string }> = [
      { name: 'plants', ts: 'last_interaction' },
      { name: 'tendings', ts: 'datetime' },
      { name: 'waterings', ts: 'datetime' },
      { name: 'sunlight', ts: 'datetime' },
      { name: 'fruits', ts: 'datetime' },
      { name: 'prunings', ts: 'datetime' },
      { name: 'companions', ts: '' },
      { name: 'scheduled_events', ts: 'scheduled_date' },
      { name: 'plots', ts: 'created_at' },
      { name: 'plot_memberships', ts: '' },
      { name: 'buds', ts: 'created_at' },
      { name: 'notchings', ts: 'datetime' },
      { name: 'capabilities', ts: 'created_at' },
    ];
    for (const { name, ts } of tables) {
      try {
        if (ts) {
          alasql(`UPDATE ${name} SET updated_at = ${ts} WHERE updated_at IS NULL OR updated_at = 0`);
        } else {
          alasql(`UPDATE ${name} SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at = 0`);
        }
      } catch {
        // Table may not have the column yet in legacy DBs — silently skip
      }
    }
  }

  private static async createTable(tableName: string, schema: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      alasql(`CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`, [], (res: any) => {
        if (res === 1 || res === 0) {
          console.log(`Table ${tableName} created/verified`);
          resolve();
        } else {
          console.error(`Failed to create table ${tableName}:`, res);
          reject(new Error(`Failed to create table ${tableName}`));
        }
      });
    });
  }

  static async saveToStorage(): Promise<void> {
    try {
      markPendingChanges();
      console.log('Data saved to localStorage');
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  // ─── Plant operations ────────────────────────────────────────────────────

  static async getPlant(id: string): Promise<Plant | null> {
    const results = alasql('SELECT * FROM plants WHERE id = ?', [id]);
    return results.length > 0 ? results[0] : null;
  }

  static async getAllPlants(): Promise<Plant[]> {
    try {
      const results = alasql('SELECT * FROM plants ORDER BY next_scheduled_care ASC');
      const fields = alasql('show columns from plants');
      console.log("240",fields,results);
      return Array.isArray(results) ? results : [];
    } catch (error) {
      console.error('Failed to get plants:', error);
      return [];
    }
  }

  static async addPlant(plant: Omit<Plant, 'id' | 'created_at' | 'updated_at'>): Promise<Plant> {
    const now = Date.now();
    const hoursInUnit = plant.care_frequency_unit === 'weeks' ? 168 : 24;
    const nextCareTimestamp = now + (plant.care_frequency_multiplier * hoursInUnit * 60 * 60 * 1000);
    console.log("next care", nextCareTimestamp);
    const newPlant: Plant = {
      id: uuidv4(),
      created_at: now,
      updated_at: now,
      last_interaction: now,
      last_cared_for: plant.last_cared_for || now,
      next_scheduled_care: plant.next_scheduled_care || nextCareTimestamp,
      ...plant
    };
    console.log("new plant", newPlant);

    alasql('INSERT INTO plants (id, name, email, phone, last_interaction, created_at, updated_at, care_frequency_multiplier, care_frequency_unit, next_scheduled_care, last_cared_for, description, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      newPlant.id,
      newPlant.name,
      newPlant.email || null,
      newPlant.phone || null,
      newPlant.last_interaction,
      newPlant.created_at,
      newPlant.updated_at,
      newPlant.care_frequency_multiplier,
      newPlant.care_frequency_unit,
      newPlant.next_scheduled_care,
      newPlant.last_cared_for,
      newPlant.description || null,
      newPlant.additional_info || null
    ]);

    await this.saveToStorage();

    if (typeof window !== 'undefined' && 'dispatchEvent' in window) {
      window.dispatchEvent(new CustomEvent('plant-care-updated', {
        detail: { plantId: newPlant.id, nextCareTimestamp: newPlant.next_scheduled_care, plantName: newPlant.name }
      }));
    }

    return newPlant;
  }

  static async updatePlantInteraction(plantId: string, timestamp: number): Promise<void> {
    alasql('UPDATE plants SET last_interaction = ?, updated_at = ? WHERE id = ?', [timestamp, Date.now(), plantId]);
    markPendingChanges();
    if (isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async updatePlantCare(plantId: string, timestamp: number): Promise<void> {
    const plant = await this.getPlant(plantId);
    if (!plant) return;

    const hoursInUnit = plant.care_frequency_unit === 'weeks' ? 168 : 24;
    const nextCareTimestamp = timestamp + (plant.care_frequency_multiplier * hoursInUnit * 60 * 60 * 1000);

    alasql('UPDATE plants SET last_cared_for = ?, next_scheduled_care = ?, updated_at = ? WHERE id = ?', [
      timestamp,
      nextCareTimestamp,
      Date.now(),
      plantId
    ]);
    markPendingChanges();
    if (isSharedPlant(plantId)) markPlantPendingChange(plantId);

    if (typeof window !== 'undefined' && 'dispatchEvent' in window) {
      window.dispatchEvent(new CustomEvent('plant-care-updated', {
        detail: { plantId, nextCareTimestamp, plantName: plant.name }
      }));
    }
  }

  static async updatePlantNextScheduledCare(plantId: string, timestamp: number): Promise<void> {
    const plant = await this.getPlant(plantId);
    alasql('UPDATE plants SET next_scheduled_care = ?, updated_at = ? WHERE id = ?', [timestamp, Date.now(), plantId]);
    await this.saveToStorage();
    if (isSharedPlant(plantId)) markPlantPendingChange(plantId);

    if (plant && typeof window !== 'undefined' && 'dispatchEvent' in window) {
      window.dispatchEvent(new CustomEvent('plant-care-updated', {
        detail: { plantId, nextCareTimestamp: timestamp, plantName: plant.name }
      }));
    }
  }

  static async updatePlant(plantId: string, updates: Partial<Omit<Plant, 'id' | 'created_at' | 'last_interaction' | 'last_cared_for'>>): Promise<void> {
    const now = Date.now();
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE plants SET ${fields}, updated_at = ? WHERE id = ?`, [...values, now, plantId]);
    await this.saveToStorage();
    if (isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async updatePlantImageId(plantId: string, imageId: string | null): Promise<void> {
    const plant = await this.getPlant(plantId);
    if (!plant) return;
    let info: Record<string, unknown> = {};
    try {
      if (plant.additional_info) info = JSON.parse(plant.additional_info);
    } catch {}
    if (imageId === null) {
      delete info.imageId;
    } else {
      info.imageId = imageId;
    }
    const serialized = Object.keys(info).length > 0 ? JSON.stringify(info) : null;
    alasql('UPDATE plants SET additional_info = ?, updated_at = ? WHERE id = ?', [serialized, Date.now(), plantId]);
    markPendingChanges();
    if (isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async removePlant(plantId: string): Promise<void> {
    const shared = isSharedPlant(plantId);

    if (shared) {
      // Record tombstones for all related records before deleting
      const relatedTables: Array<{ table: string; field: string }> = [
        { table: 'tendings', field: 'plant_id' },
        { table: 'waterings', field: 'plant_id' },
        { table: 'sunlight', field: 'plant_id' },
        { table: 'fruits', field: 'plant_id' },
        { table: 'prunings', field: 'plant_id' },
        { table: 'scheduled_events', field: 'plant_id' },
        { table: 'buds', field: 'plant_id' },
        { table: 'notchings', field: 'plant_id' },
        { table: 'capabilities', field: 'plant_id' },
      ];
      for (const { table, field } of relatedTables) {
        const rows = alasql(`SELECT id FROM ${table} WHERE ${field} = ?`, [plantId]);
        for (const row of rows) {
          recordTombstone(row.id, table, plantId);
        }
      }
      recordTombstone(plantId, 'plants', plantId);
    }

    alasql('DELETE FROM plants WHERE id = ?', [plantId]);
    alasql('DELETE FROM tendings WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM waterings WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM sunlight WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM fruits WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM prunings WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM scheduled_events WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM buds WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM notchings WHERE plant_id = ?', [plantId]);
    alasql('DELETE FROM capabilities WHERE plant_id = ?', [plantId]);

    await this.saveToStorage();
  }

  // ─── Tending operations ──────────────────────────────────────────────────

  static async addTending(tending: Omit<Tending, 'id' | 'updated_at'>): Promise<Tending> {
    const now = Date.now();
    const newTending: Tending = { id: uuidv4(), updated_at: now, ...tending };

    alasql('INSERT INTO tendings VALUES (?, ?, ?, ?, ?, ?, ?)', [
      newTending.id,
      newTending.plant_id,
      newTending.datetime,
      newTending.updated_at,
      newTending.type,
      newTending.summary || null,
      newTending.additional_info || null
    ]);

    await this.updatePlantInteraction(newTending.plant_id, newTending.datetime);
    await this.updatePlantCare(newTending.plant_id, newTending.datetime);

    await this.saveToStorage();
    if (isSharedPlant(newTending.plant_id)) markPlantPendingChange(newTending.plant_id);
    return newTending;
  }

  static async getTendingsForPlant(plantId: string): Promise<Tending[]> {
    return alasql('SELECT * FROM tendings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static async updateTending(id: string, updates: Partial<Omit<Tending, 'id' | 'plant_id' | 'datetime' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM tendings WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE tendings SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deleteTending(tendingId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM tendings WHERE id = ?', [tendingId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(tendingId, 'tendings', plantId);
    alasql('DELETE FROM tendings WHERE id = ?', [tendingId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Watering operations ─────────────────────────────────────────────────

  static async addWatering(watering: Omit<Watering, 'id' | 'updated_at'>): Promise<Watering> {
    const now = Date.now();
    const newWatering: Watering = { id: uuidv4(), updated_at: now, ...watering };

    alasql('INSERT INTO waterings VALUES (?, ?, ?, ?, ?, ?, ?)', [
      newWatering.id,
      newWatering.plant_id,
      newWatering.datetime,
      newWatering.updated_at,
      newWatering.source,
      newWatering.progress_description || null,
      newWatering.additional_info || null
    ]);

    await this.updatePlantInteraction(newWatering.plant_id, newWatering.datetime);
    await this.updatePlantCare(newWatering.plant_id, newWatering.datetime);

    await this.saveToStorage();
    if (isSharedPlant(newWatering.plant_id)) markPlantPendingChange(newWatering.plant_id);
    return newWatering;
  }

  static async getWateringsForPlant(plantId: string): Promise<Watering[]> {
    return alasql('SELECT * FROM waterings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static async updateWatering(id: string, updates: Partial<Omit<Watering, 'id' | 'plant_id' | 'datetime' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM waterings WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE waterings SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deleteWatering(wateringId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM waterings WHERE id = ?', [wateringId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(wateringId, 'waterings', plantId);
    alasql('DELETE FROM waterings WHERE id = ?', [wateringId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Sunlight operations ─────────────────────────────────────────────────

  static async addSunlight(sunlight: Omit<Sunlight, 'id' | 'updated_at'>): Promise<Sunlight> {
    const now = Date.now();
    const newSunlight: Sunlight = { id: uuidv4(), updated_at: now, ...sunlight };

    alasql('INSERT INTO sunlight VALUES (?, ?, ?, ?, ?, ?)', [
      newSunlight.id,
      newSunlight.plant_id,
      newSunlight.datetime,
      newSunlight.updated_at,
      newSunlight.topic,
      newSunlight.additional_info || null
    ]);

    await this.saveToStorage();
    if (isSharedPlant(newSunlight.plant_id)) markPlantPendingChange(newSunlight.plant_id);
    return newSunlight;
  }

  static async getSunlightForPlant(plantId: string): Promise<Sunlight[]> {
    return alasql('SELECT * FROM sunlight WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static async updateSunlight(id: string, updates: Partial<Omit<Sunlight, 'id' | 'plant_id' | 'datetime' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM sunlight WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE sunlight SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deleteSunlight(sunlightId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM sunlight WHERE id = ?', [sunlightId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(sunlightId, 'sunlight', plantId);
    alasql('DELETE FROM sunlight WHERE id = ?', [sunlightId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Fruit operations ────────────────────────────────────────────────────

  static async addFruit(fruit: Omit<Fruit, 'id' | 'updated_at'>): Promise<Fruit> {
    const now = Date.now();
    const newFruit: Fruit = { id: uuidv4(), updated_at: now, ...fruit };

    alasql('INSERT INTO fruits VALUES (?, ?, ?, ?, ?, ?, ?)', [
      newFruit.id,
      newFruit.plant_id,
      newFruit.datetime,
      newFruit.updated_at,
      newFruit.description,
      newFruit.basic_activity || null,
      newFruit.additional_info || null
    ]);

    await this.saveToStorage();
    if (isSharedPlant(newFruit.plant_id)) markPlantPendingChange(newFruit.plant_id);
    return newFruit;
  }

  static async getFruitsForPlant(plantId: string): Promise<Fruit[]> {
    return alasql('SELECT * FROM fruits WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static async updateFruit(id: string, updates: Partial<Omit<Fruit, 'id' | 'plant_id' | 'datetime' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM fruits WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE fruits SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deleteFruit(fruitId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM fruits WHERE id = ?', [fruitId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(fruitId, 'fruits', plantId);
    alasql('DELETE FROM fruits WHERE id = ?', [fruitId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Pruning operations ──────────────────────────────────────────────────

  static async addPruning(pruning: Omit<Pruning, 'id' | 'updated_at'>): Promise<Pruning> {
    const now = Date.now();
    const newPruning: Pruning = { id: uuidv4(), updated_at: now, ...pruning };

    alasql('INSERT INTO prunings VALUES (?, ?, ?, ?, ?, ?, ?)', [
      newPruning.id,
      newPruning.plant_id,
      newPruning.datetime,
      newPruning.updated_at,
      newPruning.difficulty,
      newPruning.description || null,
      newPruning.additional_info || null
    ]);

    await this.saveToStorage();
    if (isSharedPlant(newPruning.plant_id)) markPlantPendingChange(newPruning.plant_id);
    return newPruning;
  }

  static async getPruningsForPlant(plantId: string): Promise<Pruning[]> {
    return alasql('SELECT * FROM prunings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static async updatePruning(id: string, updates: Partial<Omit<Pruning, 'id' | 'plant_id' | 'datetime' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM prunings WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE prunings SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deletePruning(pruningId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM prunings WHERE id = ?', [pruningId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(pruningId, 'prunings', plantId);
    alasql('DELETE FROM prunings WHERE id = ?', [pruningId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Plot operations ─────────────────────────────────────────────────────

  static async createPlot(plot: Omit<Plot, 'id' | 'created_at' | 'updated_at'>): Promise<Plot> {
    const now = Date.now();
    const newPlot: Plot = { id: uuidv4(), created_at: now, updated_at: now, ...plot };

    alasql('INSERT INTO plots VALUES (?, ?, ?, ?, ?, ?)', [
      newPlot.id,
      newPlot.name,
      newPlot.description || null,
      newPlot.created_at,
      newPlot.updated_at,
      newPlot.additional_info || null
    ]);

    await this.saveToStorage();
    return newPlot;
  }

  static async getPlots(): Promise<Plot[]> {
    return alasql('SELECT * FROM plots ORDER BY created_at DESC');
  }

  static async getPlot(id: string): Promise<Plot | null> {
    const results = alasql('SELECT * FROM plots WHERE id = ?', [id]);
    return results.length > 0 ? results[0] : null;
  }

  static async updatePlot(id: string, updates: Partial<Omit<Plot, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE plots SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
  }

  static async deletePlot(id: string): Promise<void> {
    alasql('DELETE FROM plots WHERE id = ?', [id]);
    alasql('DELETE FROM plot_memberships WHERE plot_id = ?', [id]);
    await this.saveToStorage();
  }

  static async getPlotWithMembers(plotId: string): Promise<PlotWithMembers | null> {
    const plot = await this.getPlot(plotId);
    if (!plot) return null;

    const membershipResults = alasql(`
      SELECT p.* FROM plants p
      INNER JOIN plot_memberships pm ON p.id = pm.plant_id
      WHERE pm.plot_id = ?
      ORDER BY p.name ASC
    `, [plotId]);

    return { ...plot, members: membershipResults || [] };
  }

  static async addPlantToPlot(plotId: string, plantId: string): Promise<void> {
    const existing = alasql('SELECT * FROM plot_memberships WHERE plot_id = ? AND plant_id = ?', [plotId, plantId]);
    if (existing.length > 0) return;

    const now = Date.now();
    const membership: PlotMembership = { id: uuidv4(), plot_id: plotId, plant_id: plantId, updated_at: now };

    alasql('INSERT INTO plot_memberships VALUES (?, ?, ?, ?)', [
      membership.id,
      membership.plot_id,
      membership.plant_id,
      membership.updated_at
    ]);

    await this.saveToStorage();
  }

  static async removePlantFromPlot(plotId: string, plantId: string): Promise<void> {
    alasql('DELETE FROM plot_memberships WHERE plot_id = ? AND plant_id = ?', [plotId, plantId]);
    await this.saveToStorage();
  }

  static async updatePlotMemberships(plotId: string, plantIds: string[]): Promise<void> {
    alasql('DELETE FROM plot_memberships WHERE plot_id = ?', [plotId]);

    const now = Date.now();
    for (const plantId of plantIds) {
      const membership: PlotMembership = { id: uuidv4(), plot_id: plotId, plant_id: plantId, updated_at: now };
      alasql('INSERT INTO plot_memberships VALUES (?, ?, ?, ?)', [
        membership.id,
        membership.plot_id,
        membership.plant_id,
        membership.updated_at
      ]);
    }

    await this.saveToStorage();
  }

  // ─── Bulk activity logging ───────────────────────────────────────────────

  static async logBulkActivity(
    activityType: 'tending' | 'watering' | 'sunlight' | 'fruit',
    activityData: any,
    plantIds: string[],
    customTimestamp?: number
  ): Promise<void> {
    if (plantIds.length === 0) return;

    const timestamp = customTimestamp || Date.now();
    const now = Date.now();
    const recordsToInsert: any[][] = [];
    let tableName: string;
    let columns: string[];

    switch (activityType) {
      case 'tending':
        tableName = 'tendings';
        columns = ['id', 'plant_id', 'datetime', 'updated_at', 'type', 'summary', 'additional_info'];
        break;
      case 'watering':
        tableName = 'waterings';
        columns = ['id', 'plant_id', 'datetime', 'updated_at', 'source', 'progress_description', 'additional_info'];
        break;
      case 'sunlight':
        tableName = 'sunlight';
        columns = ['id', 'plant_id', 'datetime', 'updated_at', 'topic', 'additional_info'];
        break;
      case 'fruit':
        tableName = 'fruits';
        columns = ['id', 'plant_id', 'datetime', 'updated_at', 'description', 'basic_activity', 'additional_info'];
        break;
      default:
        throw new Error(`Unsupported activity type: ${activityType}`);
    }

    for (const plantId of plantIds) {
      const id = uuidv4();
      let record: any[];

      switch (activityType) {
        case 'tending':
          record = [id, plantId, timestamp, now, activityData.type, activityData.summary || null, activityData.additional_info || null];
          break;
        case 'watering':
          record = [id, plantId, timestamp, now, activityData.source, activityData.progress_description || null, activityData.additional_info || null];
          break;
        case 'sunlight':
          record = [id, plantId, timestamp, now, activityData.topic, activityData.additional_info || null];
          break;
        case 'fruit':
          record = [id, plantId, timestamp, now, activityData.description, activityData.basic_activity || null, activityData.additional_info || null];
          break;
        default:
          throw new Error(`Unsupported activity type: ${activityType}`);
      }

      recordsToInsert.push(record);
    }

    const columnsStr = columns.join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const valuesClause = recordsToInsert.map(() => `(${placeholders})`).join(', ');
    const sql = `INSERT INTO ${tableName} (${columnsStr}) VALUES ${valuesClause}`;

    alasql(sql, recordsToInsert.flat());

    if (activityType === 'tending' || activityType === 'watering') {
      for (const plantId of plantIds) {
        await this.updatePlantInteraction(plantId, timestamp);
        await this.updatePlantCare(plantId, timestamp);
      }
    }

    // Mark pending for any shared plants in the batch
    for (const plantId of plantIds) {
      if (isSharedPlant(plantId)) markPlantPendingChange(plantId);
    }

    await this.saveToStorage();
  }

  // ─── Scheduled events ────────────────────────────────────────────────────

  static async addScheduledEvent(event: Omit<ScheduledEvent, 'id' | 'updated_at'>): Promise<ScheduledEvent> {
    const now = Date.now();
    const newEvent: ScheduledEvent = { id: uuidv4(), updated_at: now, ...event };

    alasql('INSERT INTO scheduled_events VALUES (?, ?, ?, ?, ?, ?, ?)', [
      newEvent.id,
      newEvent.plant_id,
      newEvent.event_type,
      newEvent.scheduled_date,
      newEvent.updated_at,
      newEvent.description || null,
      newEvent.additional_info || null
    ]);

    await this.saveToStorage();
    if (isSharedPlant(newEvent.plant_id)) markPlantPendingChange(newEvent.plant_id);
    return newEvent;
  }

  static async getScheduledEventsForPlant(plantId: string): Promise<ScheduledEvent[]> {
    return alasql('SELECT * FROM scheduled_events WHERE plant_id = ? ORDER BY scheduled_date ASC', [plantId]);
  }

  static async deleteScheduledEvent(eventId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM scheduled_events WHERE id = ?', [eventId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(eventId, 'scheduled_events', plantId);
    alasql('DELETE FROM scheduled_events WHERE id = ?', [eventId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Companion operations ────────────────────────────────────────────────

  static async addCompanion(companion: Omit<Companion, 'id' | 'updated_at'>): Promise<Companion> {
    const now = Date.now();
    const newCompanion: Companion = { id: uuidv4(), updated_at: now, ...companion };

    alasql('INSERT INTO companions VALUES (?, ?, ?, ?, ?, ?)', [
      newCompanion.id,
      newCompanion.plant_a_id,
      newCompanion.relationship_descriptor,
      newCompanion.plant_b_id,
      newCompanion.updated_at,
      newCompanion.additional_info || null
    ]);

    await this.saveToStorage();
    return newCompanion;
  }

  static async getCompanionsForPlant(plantId: string): Promise<Companion[]> {
    return alasql('SELECT * FROM companions WHERE plant_a_id = ? OR plant_b_id = ?', [plantId, plantId]);
  }

  static async updateCompanion(id: string, updates: Partial<Omit<Companion, 'id' | 'plant_a_id' | 'updated_at'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE companions SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
  }

  static async deleteCompanion(companionId: string): Promise<void> {
    alasql('DELETE FROM companions WHERE id = ?', [companionId]);
    await this.saveToStorage();
  }

  // ─── Bud operations ──────────────────────────────────────────────────────

  static async addBud(bud: Omit<Bud, 'id' | 'updated_at'>): Promise<Bud> {
    const now = Date.now();
    const newBud: Bud = { id: uuidv4(), updated_at: now, ...bud };
    alasql('INSERT INTO buds VALUES (?, ?, ?, ?, ?)', [
      newBud.id, newBud.plant_id, newBud.text, newBud.created_at, newBud.updated_at
    ]);
    await this.saveToStorage();
    if (isSharedPlant(newBud.plant_id)) markPlantPendingChange(newBud.plant_id);
    return newBud;
  }

  static async getBudsForPlant(plantId: string): Promise<Bud[]> {
    return alasql('SELECT * FROM buds WHERE plant_id = ? ORDER BY created_at ASC', [plantId]);
  }

  static async updateBud(id: string, updates: Partial<Omit<Bud, 'id' | 'plant_id' | 'created_at' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM buds WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE buds SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deleteBud(budId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM buds WHERE id = ?', [budId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(budId, 'buds', plantId);
    alasql('DELETE FROM buds WHERE id = ?', [budId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Notching operations ─────────────────────────────────────────────────

  static async addNotching(notching: Omit<Notching, 'id' | 'updated_at'>): Promise<Notching> {
    const now = Date.now();
    const newNotching: Notching = { id: uuidv4(), updated_at: now, ...notching };
    alasql('INSERT INTO notchings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      newNotching.id,
      newNotching.plant_id,
      newNotching.datetime,
      newNotching.updated_at,
      newNotching.book,
      newNotching.start_unit,
      newNotching.start_section,
      newNotching.end_unit,
      newNotching.end_section,
      newNotching.sections_studied,
      newNotching.progress_description || null,
      newNotching.additional_info || null
    ]);
    await this.saveToStorage();
    this.updatePlantInteraction(newNotching.plant_id, newNotching.datetime);
    this.updatePlantCare(newNotching.plant_id, newNotching.datetime);
    if (isSharedPlant(newNotching.plant_id)) markPlantPendingChange(newNotching.plant_id);
    return newNotching;
  }

  static async getNotchingsForPlant(plantId: string): Promise<Notching[]> {
    return alasql('SELECT * FROM notchings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static async updateNotching(id: string, updates: Partial<Omit<Notching, 'id' | 'plant_id' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM notchings WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE notchings SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deleteNotching(notchingId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM notchings WHERE id = ?', [notchingId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(notchingId, 'notchings', plantId);
    alasql('DELETE FROM notchings WHERE id = ?', [notchingId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Capability operations ───────────────────────────────────────────────

  static async addCapability(capability: Omit<Capability, 'id' | 'updated_at'>): Promise<Capability> {
    const now = Date.now();
    const newCapability: Capability = { id: uuidv4(), updated_at: now, ...capability };
    alasql('INSERT INTO capabilities VALUES (?, ?, ?, ?, ?)', [
      newCapability.id, newCapability.plant_id, newCapability.text, newCapability.created_at, newCapability.updated_at
    ]);
    await this.saveToStorage();
    if (isSharedPlant(newCapability.plant_id)) markPlantPendingChange(newCapability.plant_id);
    return newCapability;
  }

  static async getCapabilitiesForPlant(plantId: string): Promise<Capability[]> {
    return alasql('SELECT * FROM capabilities WHERE plant_id = ? ORDER BY created_at ASC', [plantId]);
  }

  static async updateCapability(id: string, updates: Partial<Omit<Capability, 'id' | 'plant_id' | 'created_at' | 'updated_at'>>): Promise<void> {
    const row = alasql('SELECT plant_id FROM capabilities WHERE id = ?', [id]);
    const plantId = row[0]?.plant_id;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE capabilities SET ${fields}, updated_at = ? WHERE id = ?`, [...values, Date.now(), id]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  static async deleteCapability(capabilityId: string): Promise<void> {
    const row = alasql('SELECT plant_id FROM capabilities WHERE id = ?', [capabilityId]);
    const plantId = row[0]?.plant_id;
    if (plantId && isSharedPlant(plantId)) recordTombstone(capabilityId, 'capabilities', plantId);
    alasql('DELETE FROM capabilities WHERE id = ?', [capabilityId]);
    await this.saveToStorage();
    if (plantId && isSharedPlant(plantId)) markPlantPendingChange(plantId);
  }

  // ─── Query helpers ───────────────────────────────────────────────────────

  static async getLatestTendingForPlant(plantId: string): Promise<number | null> {
    const results = alasql('SELECT MAX(datetime) as latest FROM tendings WHERE plant_id = ?', [plantId]);
    return results.length > 0 && results[0].latest ? results[0].latest : null;
  }

  static async getLatestWateringForPlant(plantId: string): Promise<number | null> {
    const results = alasql('SELECT MAX(datetime) as latest FROM waterings WHERE plant_id = ?', [plantId]);
    return results.length > 0 && results[0].latest ? results[0].latest : null;
  }

  static async getLatestSunlightForPlant(plantId: string): Promise<number | null> {
    const results = alasql('SELECT MAX(datetime) as latest FROM sunlight WHERE plant_id = ?', [plantId]);
    return results.length > 0 && results[0].latest ? results[0].latest : null;
  }

  static async getPlantTimeline(plantId: string): Promise<any[]> {
    const tendings = await this.getTendingsForPlant(plantId);
    const waterings = await this.getWateringsForPlant(plantId);
    const sunlight = await this.getSunlightForPlant(plantId);
    const fruits = await this.getFruitsForPlant(plantId);
    const prunings = await this.getPruningsForPlant(plantId);

    const timeline = [
      ...tendings.map(t => ({ ...t, type: 'tending', activity_type: t.type })),
      ...waterings.map(w => ({ ...w, type: 'watering', source: w.source })),
      ...sunlight.map(s => ({ ...s, type: 'sunlight', topic: s.topic })),
      ...fruits.map(f => ({ ...f, type: 'fruit', description: f.description })),
      ...prunings.map(p => ({ ...p, type: 'pruning', difficulty: p.difficulty }))
    ];

    return timeline.sort((a, b) => b.datetime - a.datetime);
  }

  // ─── Backup operations ───────────────────────────────────────────────────

  static async getFullBackupAsObject(): Promise<object> {
    return {
      plants: alasql('SELECT * FROM plants'),
      tendings: alasql('SELECT * FROM tendings'),
      waterings: alasql('SELECT * FROM waterings'),
      sunlight: alasql('SELECT * FROM sunlight'),
      fruits: alasql('SELECT * FROM fruits'),
      prunings: alasql('SELECT * FROM prunings'),
      companions: alasql('SELECT * FROM companions'),
      scheduled_events: alasql('SELECT * FROM scheduled_events'),
      plots: alasql('SELECT * FROM plots'),
      plot_memberships: alasql('SELECT * FROM plot_memberships'),
      buds: alasql('SELECT * FROM buds'),
      notchings: alasql('SELECT * FROM notchings'),
      capabilities: alasql('SELECT * FROM capabilities'),
      backup_timestamp: Date.now()
    };
  }

  static async restoreBackupFromObject(backup: any): Promise<void> {
    alasql('DELETE FROM plants');
    alasql('DELETE FROM tendings');
    alasql('DELETE FROM waterings');
    alasql('DELETE FROM sunlight');
    alasql('DELETE FROM fruits');
    alasql('DELETE FROM prunings');
    alasql('DELETE FROM companions');
    alasql('DELETE FROM scheduled_events');
    alasql('DELETE FROM plots');
    alasql('DELETE FROM plot_memberships');
    alasql('DELETE FROM buds');
    alasql('DELETE FROM notchings');
    alasql('DELETE FROM capabilities');

    const now = Date.now();

    if (backup.plants) {
      backup.plants.forEach((plant: Plant) => {
        alasql('INSERT INTO plants (id, name, email, phone, last_interaction, created_at, updated_at, care_frequency_multiplier, care_frequency_unit, next_scheduled_care, last_cared_for, description, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          plant.id,
          plant.name,
          plant.email || null,
          plant.phone || null,
          plant.last_interaction,
          plant.created_at,
          plant.updated_at ?? plant.last_interaction ?? now,
          plant.care_frequency_multiplier,
          plant.care_frequency_unit,
          plant.next_scheduled_care,
          plant.last_cared_for,
          plant.description || null,
          plant.additional_info || null
        ]);
      });
    }

    if (backup.tendings) {
      backup.tendings.forEach((tending: Tending) => {
        alasql('INSERT INTO tendings (id, plant_id, datetime, updated_at, type, summary, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          tending.id, tending.plant_id, tending.datetime,
          tending.updated_at ?? tending.datetime ?? now,
          tending.type, tending.summary, tending.additional_info || null
        ]);
      });
    }

    if (backup.waterings) {
      backup.waterings.forEach((watering: Watering) => {
        alasql('INSERT INTO waterings (id, plant_id, datetime, updated_at, source, progress_description, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          watering.id, watering.plant_id, watering.datetime,
          watering.updated_at ?? watering.datetime ?? now,
          watering.source, watering.progress_description, watering.additional_info || null
        ]);
      });
    }

    if (backup.sunlight) {
      backup.sunlight.forEach((sunlight: Sunlight) => {
        alasql('INSERT INTO sunlight (id, plant_id, datetime, updated_at, topic, additional_info) VALUES (?, ?, ?, ?, ?, ?)', [
          sunlight.id, sunlight.plant_id, sunlight.datetime,
          sunlight.updated_at ?? sunlight.datetime ?? now,
          sunlight.topic, sunlight.additional_info || null
        ]);
      });
    }

    if (backup.fruits) {
      backup.fruits.forEach((fruit: Fruit) => {
        alasql('INSERT INTO fruits (id, plant_id, datetime, updated_at, description, basic_activity, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          fruit.id, fruit.plant_id, fruit.datetime,
          fruit.updated_at ?? fruit.datetime ?? now,
          fruit.description, fruit.basic_activity || null, fruit.additional_info || null
        ]);
      });
    }

    if (backup.prunings) {
      backup.prunings.forEach((pruning: Pruning) => {
        alasql('INSERT INTO prunings (id, plant_id, datetime, updated_at, difficulty, description, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          pruning.id, pruning.plant_id, pruning.datetime,
          pruning.updated_at ?? pruning.datetime ?? now,
          pruning.difficulty, pruning.description, pruning.additional_info || null
        ]);
      });
    }

    if (backup.companions) {
      backup.companions.forEach((companion: Companion) => {
        alasql('INSERT INTO companions (id, plant_a_id, relationship_descriptor, plant_b_id, updated_at, additional_info) VALUES (?, ?, ?, ?, ?, ?)', [
          companion.id, companion.plant_a_id, companion.relationship_descriptor,
          companion.plant_b_id,
          companion.updated_at ?? now,
          companion.additional_info || null
        ]);
      });
    }

    if (backup.scheduled_events) {
      backup.scheduled_events.forEach((event: ScheduledEvent) => {
        alasql('INSERT INTO scheduled_events (id, plant_id, event_type, scheduled_date, updated_at, description, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          event.id, event.plant_id, event.event_type, event.scheduled_date,
          event.updated_at ?? event.scheduled_date ?? now,
          event.description, event.additional_info || null
        ]);
      });
    }

    if (backup.plots) {
      backup.plots.forEach((plot: Plot) => {
        alasql('INSERT INTO plots (id, name, description, created_at, updated_at, additional_info) VALUES (?, ?, ?, ?, ?, ?)', [
          plot.id, plot.name, plot.description, plot.created_at,
          plot.updated_at ?? plot.created_at ?? now,
          plot.additional_info || null
        ]);
      });
    }

    if (backup.plot_memberships) {
      backup.plot_memberships.forEach((membership: PlotMembership) => {
        alasql('INSERT INTO plot_memberships (id, plot_id, plant_id, updated_at) VALUES (?, ?, ?, ?)', [
          membership.id, membership.plot_id, membership.plant_id,
          membership.updated_at ?? now
        ]);
      });
    }

    if (backup.buds) {
      backup.buds.forEach((bud: Bud) => {
        alasql('INSERT INTO buds (id, plant_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
          bud.id, bud.plant_id, bud.text, bud.created_at,
          bud.updated_at ?? bud.created_at ?? now
        ]);
      });
    }

    if (backup.notchings) {
      backup.notchings.forEach((n: Notching) => {
        alasql('INSERT INTO notchings (id, plant_id, datetime, updated_at, book, start_unit, start_section, end_unit, end_section, sections_studied, progress_description, additional_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          n.id, n.plant_id, n.datetime,
          n.updated_at ?? n.datetime ?? now,
          n.book, n.start_unit, n.start_section,
          n.end_unit, n.end_section, n.sections_studied,
          n.progress_description || null, n.additional_info || null
        ]);
      });
    }

    if (backup.capabilities) {
      backup.capabilities.forEach((cap: Capability) => {
        alasql('INSERT INTO capabilities (id, plant_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
          cap.id, cap.plant_id, cap.text, cap.created_at,
          cap.updated_at ?? cap.created_at ?? now
        ]);
      });
    }

    await this.saveToStorage();
    clearPendingChanges();
    console.log('Backup restoration complete');
  }

  // ─── Shared plant operations ─────────────────────────────────────────────

  /**
   * Build a full PlantShareObject (snapshot + empty deltas) for a given plant.
   * Used when creating the initial share or performing compaction.
   */
  static async getPlantSnapshotAsObject(plantId: string): Promise<PlantShareObject | null> {
    const plant = await this.getPlant(plantId);
    if (!plant) return null;

    const companions = await this.getCompanionsForPlant(plantId);

    const snapshot: PlantSnapshot = {
      plant,
      tendings: await this.getTendingsForPlant(plantId),
      waterings: await this.getWateringsForPlant(plantId),
      sunlight: await this.getSunlightForPlant(plantId),
      fruits: await this.getFruitsForPlant(plantId),
      prunings: await this.getPruningsForPlant(plantId),
      companions,
      scheduled_events: await this.getScheduledEventsForPlant(plantId),
      buds: await this.getBudsForPlant(plantId),
      notchings: await this.getNotchingsForPlant(plantId),
      capabilities: await this.getCapabilitiesForPlant(plantId),
      snapshot_at: Date.now(),
    };

    return { snapshot, deltas: [], schema_version: 1 };
  }

  /**
   * Gather deltas since a given timestamp for use when pushing to a shared plant.
   * Reads changed records from all activity tables and tombstones.
   */
  static async getPlantDeltasSince(
    plantId: string,
    sinceTs: number,
    authorUuid: string
  ): Promise<SyncDelta[]> {
    const deltas: SyncDelta[] = [];

    const activityTables: Array<{ name: string; field: string }> = [
      { name: 'plants', field: 'id' },
      { name: 'tendings', field: 'plant_id' },
      { name: 'waterings', field: 'plant_id' },
      { name: 'sunlight', field: 'plant_id' },
      { name: 'fruits', field: 'plant_id' },
      { name: 'prunings', field: 'plant_id' },
      { name: 'companions', field: 'plant_a_id' },
      { name: 'scheduled_events', field: 'plant_id' },
      { name: 'buds', field: 'plant_id' },
      { name: 'notchings', field: 'plant_id' },
      { name: 'capabilities', field: 'plant_id' },
    ];

    for (const { name, field } of activityTables) {
      const rows = alasql(
        `SELECT * FROM ${name} WHERE ${field} = ? AND updated_at > ?`,
        [plantId, sinceTs]
      );
      for (const row of rows) {
        deltas.push({
          id: uuidv4(),
          type: 'UPDATE',
          table: name,
          record_id: row.id,
          plant_id: plantId,
          data: row as Record<string, unknown>,
          ts: row.updated_at,
          author_uuid: authorUuid,
        });
      }
    }

    // Tombstones (deletions)
    const tombstones: SharedPlantTombstone[] = alasql(
      'SELECT * FROM shared_plant_tombstones WHERE plant_id = ? AND deleted_at > ?',
      [plantId, sinceTs]
    );
    for (const t of tombstones) {
      deltas.push({
        id: uuidv4(),
        type: 'DELETE',
        table: t.table_name,
        record_id: t.record_id,
        plant_id: plantId,
        ts: t.deleted_at,
        author_uuid: authorUuid,
      });
    }

    return deltas.sort((a, b) => a.ts - b.ts);
  }

  /**
   * Apply incoming deltas from a remote PlantShareObject to local DB.
   * Returns any true conflicts (same ID, both sides changed, ts within 5s of each other).
   */
  static async applyPlantDeltas(
    plantId: string,
    deltas: SyncDelta[]
  ): Promise<ConflictRecord[]> {
    const conflicts: ConflictRecord[] = [];
    const CONFLICT_WINDOW_MS = 5000;

    // Apply in timestamp order
    const sorted = [...deltas].sort((a, b) => a.ts - b.ts);

    for (const delta of sorted) {
      if (delta.type === 'DELETE') {
        // Hard delete; record a tombstone so we don't re-insert from a stale snapshot
        alasql(`DELETE FROM ${delta.table} WHERE id = ?`, [delta.record_id]);
        // Ensure tombstone exists locally
        const existing = alasql('SELECT id FROM shared_plant_tombstones WHERE record_id = ?', [delta.record_id]);
        if (existing.length === 0) {
          recordTombstone(delta.record_id, delta.table, plantId);
        }
        continue;
      }

      if (!delta.data) continue;

      // Check if the record already exists locally
      const localRows = alasql(`SELECT * FROM ${delta.table} WHERE id = ?`, [delta.record_id]);

      if (localRows.length === 0) {
        // INSERT — record doesn't exist locally, insert it
        this.insertRecordFromDelta(delta.table, delta.data);
      } else {
        const local = localRows[0];
        const localTs: number = local.updated_at ?? 0;
        const incomingTs: number = delta.ts;

        if (incomingTs > localTs) {
          // Incoming is definitively newer — apply
          this.updateRecordFromDelta(delta.table, delta.record_id, delta.data);
        } else if (Math.abs(incomingTs - localTs) <= CONFLICT_WINDOW_MS && incomingTs !== localTs) {
          // True conflict — nearly simultaneous edits
          conflicts.push({
            table: delta.table,
            record_id: delta.record_id,
            local: local as Record<string, unknown>,
            incoming: delta.data,
          });
        }
        // else: local is newer, keep local — do nothing
      }
    }

    if (deltas.length > 0) {
      await this.saveToStorage();
    }

    return conflicts;
  }

  /**
   * Apply a full PlantSnapshot as INSERT deltas (used on first receive of a shared plant).
   */
  static async applyPlantSnapshot(snapshot: PlantSnapshot): Promise<void> {
    const plantId = snapshot.plant.id;

    // Check for tombstones before inserting — don't re-insert deleted records
    const tombstones: SharedPlantTombstone[] = alasql(
      'SELECT record_id FROM shared_plant_tombstones WHERE plant_id = ?',
      [plantId]
    );
    const tombstoneIds = new Set(tombstones.map(t => t.record_id));

    const insertIfNotTombstoned = (table: string, record: Record<string, unknown>) => {
      const id = record.id as string;
      if (tombstoneIds.has(id)) return;
      const existing = alasql(`SELECT id FROM ${table} WHERE id = ?`, [id]);
      if (existing.length === 0) {
        this.insertRecordFromDelta(table, record);
      }
    };

    insertIfNotTombstoned('plants', snapshot.plant as unknown as Record<string, unknown>);
    for (const r of snapshot.tendings) insertIfNotTombstoned('tendings', r as unknown as Record<string, unknown>);
    for (const r of snapshot.waterings) insertIfNotTombstoned('waterings', r as unknown as Record<string, unknown>);
    for (const r of snapshot.sunlight) insertIfNotTombstoned('sunlight', r as unknown as Record<string, unknown>);
    for (const r of snapshot.fruits) insertIfNotTombstoned('fruits', r as unknown as Record<string, unknown>);
    for (const r of snapshot.prunings) insertIfNotTombstoned('prunings', r as unknown as Record<string, unknown>);
    for (const r of snapshot.companions) insertIfNotTombstoned('companions', r as unknown as Record<string, unknown>);
    for (const r of snapshot.scheduled_events) insertIfNotTombstoned('scheduled_events', r as unknown as Record<string, unknown>);
    for (const r of snapshot.buds) insertIfNotTombstoned('buds', r as unknown as Record<string, unknown>);
    for (const r of snapshot.notchings) insertIfNotTombstoned('notchings', r as unknown as Record<string, unknown>);
    for (const r of snapshot.capabilities) insertIfNotTombstoned('capabilities', r as unknown as Record<string, unknown>);

    await this.saveToStorage();
  }

  private static insertRecordFromDelta(table: string, data: Record<string, unknown>): void {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(c => data[c]);
    try {
      alasql(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
    } catch {
      // Silently skip duplicate inserts
    }
  }

  private static updateRecordFromDelta(table: string, id: string, data: Record<string, unknown>): void {
    const fields = Object.keys(data)
      .filter(k => k !== 'id')
      .map(k => `${k} = ?`).join(', ');
    const values = Object.keys(data)
      .filter(k => k !== 'id')
      .map(k => data[k]);
    if (!fields) return;
    alasql(`UPDATE ${table} SET ${fields} WHERE id = ?`, [...values, id]);
  }

  // ─── Tombstone helpers ───────────────────────────────────────────────────

  static getTombstonesForPlant(plantId: string): SharedPlantTombstone[] {
    return alasql('SELECT * FROM shared_plant_tombstones WHERE plant_id = ?', [plantId]);
  }

  static purgeTombstonesForPlant(plantId: string): void {
    alasql('DELETE FROM shared_plant_tombstones WHERE plant_id = ?', [plantId]);
  }

  // ─── Clear all data ──────────────────────────────────────────────────────

  static async clearAllData(): Promise<void> {
    try {
      alasql('DELETE FROM plants');
      alasql('DELETE FROM tendings');
      alasql('DELETE FROM waterings');
      alasql('DELETE FROM sunlight');
      alasql('DELETE FROM fruits');
      alasql('DELETE FROM prunings');
      alasql('DELETE FROM companions');
      alasql('DELETE FROM scheduled_events');
      alasql('DELETE FROM plots');
      alasql('DELETE FROM plot_memberships');
      alasql('DELETE FROM buds');
      alasql('DELETE FROM notchings');
      alasql('DELETE FROM capabilities');
      alasql('DELETE FROM shared_plant_tombstones');

      await this.saveToStorage();
      clearPendingChanges();
      console.log('All database data cleared');
    } catch (error) {
      console.error('Failed to clear database data:', error);
      throw error;
    }
  }

  // ─── Image storage ───────────────────────────────────────────────────────

  static async saveImageLocally(imageData: {
    plantId: string;
    dataUrl: string;
    index: number;
    timestamp: number;
  }): Promise<void> {
    const key = `plant_image_${imageData.plantId}_${imageData.index}`;
    localStorage.setItem(key, JSON.stringify(imageData));
  }

  static getAllImagesLocally(): Array<{ plantId: string; dataUrl: string; index: number; timestamp: number }> {
    const images: Array<{ plantId: string; dataUrl: string; index: number; timestamp: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('plant_image_')) {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            images.push(JSON.parse(data));
          } catch (error) {
            console.error('Failed to parse image data:', error);
          }
        }
      }
    }
    return images;
  }

  static getImagesForPlant(plantId: string): string[] {
    const images: Array<{ dataUrl: string; index: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`plant_image_${plantId}_`)) {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            images.push({ dataUrl: parsed.dataUrl, index: parsed.index });
          } catch (error) {
            console.error('Failed to parse image data:', error);
          }
        }
      }
    }
    return images.sort((a, b) => a.index - b.index).map(img => img.dataUrl);
  }

  static async deleteImageLocally(plantId: string, index: number): Promise<void> {
    const key = `plant_image_${plantId}_${index}`;
    localStorage.removeItem(key);
  }

  static async deleteAndReindexImages(plantId: string, deletedIndex: number): Promise<void> {
    const allImages: Array<{ dataUrl: string; index: number; timestamp: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`plant_image_${plantId}_`)) {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            allImages.push(parsed);
          } catch {}
        }
      }
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`plant_image_${plantId}_`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    const remaining = allImages
      .filter(img => img.index !== deletedIndex)
      .sort((a, b) => a.index - b.index);

    for (let i = 0; i < remaining.length; i++) {
      const newKey = `plant_image_${plantId}_${i}`;
      localStorage.setItem(newKey, JSON.stringify({ ...remaining[i], index: i }));
    }
  }

  static async getCurrentUser(): Promise<{ id: string; signature_private_key: string; signature_public_key: string } | null> {
    const privateKey = localStorage.getItem('signature_private_key');
    const publicKey = localStorage.getItem('signature_public_key');
    const userId = localStorage.getItem('user_id');

    if (!privateKey || !publicKey || !userId) return null;

    return { id: userId, signature_private_key: privateKey, signature_public_key: publicKey };
  }
}
