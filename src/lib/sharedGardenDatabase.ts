import alasql from 'alasql';
import { v4 as uuidv4 } from 'uuid';
import type {
  Plant, Tending, Watering, Sunlight, Fruit, Pruning,
  Companion, ScheduledEvent, Plot, PlotMembership, Bud, Notching, Capability
} from './database';

// ─── Shared-garden-specific types ────────────────────────────────────────────

export interface GardenMember {
  id: string;
  user_uuid: string;
  display_name: string;
  joined_at: number;
  added_by_uuid: string;
  updated_at?: number;
}

export interface GardenChangeLogEntry {
  id: string;
  actor_uuid: string;
  actor_display_name: string;
  action_type: string; // 'add_plant' | 'remove_plant' | 'add_tending' | 'delete_tending' | etc.
  target_table: string;
  target_id: string;
  target_label: string; // human-readable name of the affected record
  occurred_at: number;
}

export interface SharedGardenDelta {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record_id: string;
  data?: Record<string, unknown>;
  ts: number;
  authored_by_uuid: string;
  authored_by_display_name: string;
}

export interface SharedGardenSnapshot {
  plants: Plant[];
  tendings: Tending[];
  waterings: Watering[];
  sunlight: Sunlight[];
  fruits: Fruit[];
  prunings: Pruning[];
  companions: Companion[];
  scheduled_events: ScheduledEvent[];
  plots: Plot[];
  plot_memberships: PlotMembership[];
  buds: Bud[];
  notchings: Notching[];
  capabilities: Capability[];
  members: GardenMember[];
  change_log: GardenChangeLogEntry[];
  snapshot_at: number;
}

export interface SharedGardenObject {
  snapshot: SharedGardenSnapshot;
  deltas: SharedGardenDelta[];
  schema_version: number;
  garden_name: string;
}

export interface SharedGardenTombstone {
  id: string;
  record_id: string;
  table_name: string;
  deleted_at: number;
}

// ─── Shared garden refs (registry in localStorage) ────────────────────────────

export interface SharedGardenRef {
  gardenId: string;           // local identifier (same as sharedGardenId)
  sharedGardenId: string;     // UUID in Supabase shared_gardens table
  gardenName: string;
  myDisplayName: string;
  myUuid: string;
  gardenPublicKeyBase64: string;
  lastSyncTs: number;
  disconnected?: boolean;     // set to true if removed from garden
}

const GARDEN_REFS_KEY = 'shared_garden_refs_v1';
const PLOT_MEMBERSHIP_CLEANUP_KEY = 'shared_garden_plot_membership_cleanup_v1';

export function getSharedGardenRefs(): SharedGardenRef[] {
  try {
    const raw = localStorage.getItem(GARDEN_REFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSharedGardenRefs(refs: SharedGardenRef[]): void {
  localStorage.setItem(GARDEN_REFS_KEY, JSON.stringify(refs));
}

export function addSharedGardenRef(ref: SharedGardenRef): void {
  const refs = getSharedGardenRefs();
  const idx = refs.findIndex(r => r.gardenId === ref.gardenId);
  if (idx >= 0) refs[idx] = ref;
  else refs.push(ref);
  saveSharedGardenRefs(refs);
}

export function removeSharedGardenRef(gardenId: string): void {
  saveSharedGardenRefs(getSharedGardenRefs().filter(r => r.gardenId !== gardenId));
}

export function getSharedGardenRef(gardenId: string): SharedGardenRef | null {
  return getSharedGardenRefs().find(r => r.gardenId === gardenId) ?? null;
}

export function markGardenDisconnected(gardenId: string): void {
  const refs = getSharedGardenRefs();
  const idx = refs.findIndex(r => r.gardenId === gardenId);
  if (idx >= 0) { refs[idx].disconnected = true; saveSharedGardenRefs(refs); }
}

export function setGardenSyncTs(gardenId: string, ts: number): void {
  const refs = getSharedGardenRefs();
  const idx = refs.findIndex(r => r.gardenId === gardenId);
  if (idx >= 0) { refs[idx].lastSyncTs = ts; saveSharedGardenRefs(refs); }
}

// ─── Per-garden AlaSQL database ───────────────────────────────────────────────

const initializedGardens = new Set<string>();

function dbName(gardenId: string): string {
  return `SharedGarden_${gardenId.replace(/-/g, '_')}`;
}

export class SharedGardenDatabase {
  static async init(gardenId: string): Promise<void> {
    if (initializedGardens.has(gardenId)) return;

    const name = dbName(gardenId);

    let attached = false;
    try {
      await new Promise<void>((resolve, reject) => {
        alasql(`CREATE LOCALSTORAGE DATABASE IF NOT EXISTS ${name}`, [], (res: unknown) => {
          if (res === 1 || res === 0) resolve(); else reject(new Error(`Failed to create ${name}`));
        });
      });
      // ATTACH can return 0 or 1 depending on AlaSQL version/state — accept any truthy-ish value
      await new Promise<void>((resolve) => {
        alasql(`ATTACH LOCALSTORAGE DATABASE ${name}`, [], () => resolve());
      });
      await new Promise<void>((resolve) => {
        alasql(`USE ${name}`, [], () => resolve());
      });
      attached = true;
    } catch {
      // localStorage unavailable — fall back to an in-memory named database so that
      // db-qualified SQL (e.g. SharedGarden_xxx.plants) still resolves correctly
    }

    if (!attached) {
      try {
        alasql(`CREATE DATABASE IF NOT EXISTS ${name}`);
        alasql(`USE ${name}`);
      } catch {
        // ignore — tables will fall into whatever current context AlaSQL has
      }
    }

    await this._createTables(gardenId);
    initializedGardens.add(gardenId);

    this._cleanupDuplicatePlotMemberships(gardenId);

    // Restore the personal garden's database context so that subsequent
    // DatabaseService calls (which use unqualified table names) continue to
    // resolve against GardenDB rather than this shared garden database.
    try { alasql('USE GardenDB'); } catch { /* GardenDB not yet initialised — harmless */ }
  }

  private static async _createTables(gardenId: string): Promise<void> {
    const tables: Array<[string, string]> = [
      ['plants', `
        id STRING PRIMARY KEY, name STRING NOT NULL, email STRING, phone STRING,
        last_interaction NUMBER DEFAULT 0, created_at NUMBER NOT NULL, updated_at NUMBER NOT NULL,
        care_frequency_multiplier NUMBER DEFAULT 2, care_frequency_unit STRING DEFAULT 'weeks',
        next_scheduled_care NUMBER NOT NULL, last_cared_for NUMBER NOT NULL,
        description STRING, additional_info STRING,
        authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['tendings', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, datetime NUMBER NOT NULL,
        updated_at NUMBER NOT NULL, type STRING NOT NULL, summary STRING, additional_info STRING,
        authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['waterings', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, datetime NUMBER NOT NULL,
        updated_at NUMBER NOT NULL, source STRING NOT NULL, progress_description STRING,
        additional_info STRING, authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['sunlight', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, datetime NUMBER NOT NULL,
        updated_at NUMBER NOT NULL, topic STRING NOT NULL, additional_info STRING,
        authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['fruits', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, datetime NUMBER NOT NULL,
        updated_at NUMBER NOT NULL, description STRING NOT NULL, basic_activity STRING,
        additional_info STRING, authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['prunings', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, datetime NUMBER NOT NULL,
        updated_at NUMBER NOT NULL, difficulty STRING NOT NULL, description STRING,
        additional_info STRING, authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['companions', `
        id STRING PRIMARY KEY, plant_a_id STRING NOT NULL, relationship_descriptor STRING NOT NULL,
        plant_b_id STRING NOT NULL, updated_at NUMBER NOT NULL, additional_info STRING
      `],
      ['scheduled_events', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, event_type STRING NOT NULL,
        scheduled_date NUMBER NOT NULL, updated_at NUMBER NOT NULL, description STRING,
        additional_info STRING
      `],
      ['plots', `
        id STRING PRIMARY KEY, name STRING NOT NULL, description STRING,
        created_at NUMBER NOT NULL, updated_at NUMBER NOT NULL, additional_info STRING
      `],
      ['plot_memberships', `
        id STRING PRIMARY KEY, plot_id STRING NOT NULL, plant_id STRING NOT NULL,
        updated_at NUMBER NOT NULL
      `],
      ['buds', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, text STRING NOT NULL,
        created_at NUMBER NOT NULL, updated_at NUMBER NOT NULL,
        authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['notchings', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, datetime NUMBER NOT NULL,
        updated_at NUMBER NOT NULL, book STRING NOT NULL, start_unit NUMBER NOT NULL,
        start_section NUMBER NOT NULL, end_unit NUMBER NOT NULL, end_section NUMBER NOT NULL,
        sections_studied NUMBER NOT NULL, progress_description STRING, additional_info STRING,
        authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['capabilities', `
        id STRING PRIMARY KEY, plant_id STRING NOT NULL, text STRING NOT NULL,
        created_at NUMBER NOT NULL, updated_at NUMBER NOT NULL,
        authored_by_uuid STRING, authored_by_display_name STRING
      `],
      ['garden_members', `
        id STRING PRIMARY KEY, user_uuid STRING NOT NULL, display_name STRING NOT NULL,
        joined_at NUMBER NOT NULL, added_by_uuid STRING NOT NULL, updated_at NUMBER NOT NULL
      `],
      ['garden_change_log', `
        id STRING PRIMARY KEY, actor_uuid STRING NOT NULL, actor_display_name STRING NOT NULL,
        action_type STRING NOT NULL, target_table STRING NOT NULL, target_id STRING NOT NULL,
        target_label STRING NOT NULL, occurred_at NUMBER NOT NULL
      `],
      ['garden_tombstones', `
        id STRING PRIMARY KEY, record_id STRING NOT NULL, table_name STRING NOT NULL,
        deleted_at NUMBER NOT NULL
      `],
    ];

    const name = dbName(gardenId);
    for (const [tableName, schema] of tables) {
      await new Promise<void>((resolve) => {
        alasql(`CREATE TABLE IF NOT EXISTS ${name}.${tableName} (${schema})`, [], () => resolve());
      });
    }
  }

  // ─── Context prefix helper ────────────────────────────────────────────────

  private static q(gardenId: string, sql: string): string {
    const db = `\`${dbName(gardenId)}\``;
    return sql.replace(/\bFROM (\w)/g, `FROM ${db}.$1`)
              .replace(/\bINTO (\w)/g, `INTO ${db}.$1`)
              .replace(/\bUPDATE (\w)/g, `UPDATE ${db}.$1`)
              .replace(/\bDELETE FROM (\w)/g, `DELETE FROM ${db}.$1`)
              .replace(/\bINSERT INTO (\w)/g, `INSERT INTO ${db}.$1`)
              .replace(/\bJOIN (\w)/g, `JOIN ${db}.$1`);
  }

  static run<T = unknown>(gardenId: string, sql: string, params: unknown[] = []): T {
    return alasql(this.q(gardenId, sql), params) as T;
  }

  // ─── Change log ───────────────────────────────────────────────────────────

  static logChange(
    gardenId: string,
    actorUuid: string,
    actorDisplayName: string,
    actionType: string,
    targetTable: string,
    targetId: string,
    targetLabel: string
  ): void {
    const entry: GardenChangeLogEntry = {
      id: uuidv4(),
      actor_uuid: actorUuid,
      actor_display_name: actorDisplayName,
      action_type: actionType,
      target_table: targetTable,
      target_id: targetId,
      target_label: targetLabel,
      occurred_at: Date.now(),
    };
    this.run(gardenId,
      'INSERT INTO garden_change_log (id, actor_uuid, actor_display_name, action_type, target_table, target_id, target_label, occurred_at) VALUES (?,?,?,?,?,?,?,?)',
      [entry.id, entry.actor_uuid, entry.actor_display_name, entry.action_type, entry.target_table, entry.target_id, entry.target_label, entry.occurred_at]
    );
  }

  static getChangeLog(gardenId: string, limit = 10, offset = 0): GardenChangeLogEntry[] {
    return this.run<GardenChangeLogEntry[]>(gardenId,
      `SELECT * FROM garden_change_log ORDER BY occurred_at DESC LIMIT ${limit} OFFSET ${offset}`,
      []
    );
  }

  static getChangeLogByRange(gardenId: string, fromMs: number, toMs: number): GardenChangeLogEntry[] {
    return this.run<GardenChangeLogEntry[]>(gardenId,
      'SELECT * FROM garden_change_log WHERE occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at ASC',
      [fromMs, toMs]
    );
  }

  static getChangeLogCount(gardenId: string): number {
    const result = this.run<Array<{ cnt: number }>>(gardenId,
      'SELECT COUNT(*) as cnt FROM garden_change_log', []
    );
    return result[0]?.cnt ?? 0;
  }

  // ─── Tombstones ───────────────────────────────────────────────────────────

  static recordTombstone(gardenId: string, recordId: string, tableName: string): void {
    const existing = this.run<unknown[]>(gardenId,
      'SELECT id FROM garden_tombstones WHERE record_id = ?', [recordId]
    );
    if ((existing as unknown[]).length > 0) return;
    this.run(gardenId,
      'INSERT INTO garden_tombstones (id, record_id, table_name, deleted_at) VALUES (?,?,?,?)',
      [uuidv4(), recordId, tableName, Date.now()]
    );
  }

  static hasTombstone(gardenId: string, recordId: string): boolean {
    const res = this.run<unknown[]>(gardenId,
      'SELECT id FROM garden_tombstones WHERE record_id = ?', [recordId]
    );
    return (res as unknown[]).length > 0;
  }

  static getTombstones(gardenId: string): SharedGardenTombstone[] {
    return this.run<SharedGardenTombstone[]>(gardenId,
      'SELECT * FROM garden_tombstones', []
    );
  }

  static purgeTombstones(gardenId: string): void {
    this.run(gardenId, 'DELETE FROM garden_tombstones', []);
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  static getMembers(gardenId: string): GardenMember[] {
    return this.run<GardenMember[]>(gardenId,
      'SELECT * FROM garden_members ORDER BY joined_at ASC', []
    );
  }

  static getMember(gardenId: string, userUuid: string): GardenMember | null {
    const res = this.run<GardenMember[]>(gardenId,
      'SELECT * FROM garden_members WHERE user_uuid = ?', [userUuid]
    );
    return res[0] ?? null;
  }

  static upsertMember(gardenId: string, member: GardenMember): void {
    const now = Date.now();
    const existing = this.getMember(gardenId, member.user_uuid);
    if (existing) {
      this.run(gardenId,
        'UPDATE garden_members SET display_name = ?, updated_at = ? WHERE user_uuid = ?',
        [member.display_name, now, member.user_uuid]
      );
    } else {
      this.run(gardenId,
        'INSERT INTO garden_members (id, user_uuid, display_name, joined_at, added_by_uuid, updated_at) VALUES (?,?,?,?,?,?)',
        [member.id, member.user_uuid, member.display_name, member.joined_at, member.added_by_uuid, now]
      );
    }
  }

  static removeMember(gardenId: string, userUuid: string): void {
    this.run(gardenId, 'DELETE FROM garden_members WHERE user_uuid = ?', [userUuid]);
  }

  static clearGarden(gardenId: string): void {
    const name = dbName(gardenId);
    const tables = [
      'plants','tendings','waterings','sunlight','fruits','prunings',
      'companions','scheduled_events','plots','plot_memberships',
      'buds','notchings','capabilities','garden_members','garden_change_log','garden_tombstones',
    ];
    for (const table of tables) {
      try { alasql(`DELETE FROM ${name}.${table}`); } catch { /* table may not exist */ }
    }
    initializedGardens.delete(gardenId);
  }

  // ─── Plants ───────────────────────────────────────────────────────────────

  static getAllPlants(gardenId: string): Plant[] {
    return this.run<Plant[]>(gardenId,
      'SELECT * FROM plants ORDER BY next_scheduled_care ASC', []
    );
  }

  static getPlant(gardenId: string, plantId: string): Plant | null {
    const res = this.run<Plant[]>(gardenId, 'SELECT * FROM plants WHERE id = ?', [plantId]);
    return res[0] ?? null;
  }

  static addPlant(
    gardenId: string,
    plant: Omit<Plant, 'id' | 'created_at' | 'updated_at'>,
    authorUuid: string,
    authorDisplayName: string
  ): Plant {
    const now = Date.now();
    const hoursInUnit = plant.care_frequency_unit === 'weeks' ? 168 : 24;
    const nextCare = now + (plant.care_frequency_multiplier * hoursInUnit * 3600000);
    const newPlant: Plant & { authored_by_uuid: string; authored_by_display_name: string } = {
      id: uuidv4(),
      created_at: now,
      updated_at: now,
      last_interaction: now,
      last_cared_for: plant.last_cared_for || now,
      next_scheduled_care: plant.next_scheduled_care || nextCare,
      ...plant,
      authored_by_uuid: authorUuid,
      authored_by_display_name: authorDisplayName,
    };

    this.run(gardenId,
      'INSERT INTO plants (id,name,email,phone,last_interaction,created_at,updated_at,care_frequency_multiplier,care_frequency_unit,next_scheduled_care,last_cared_for,description,additional_info,authored_by_uuid,authored_by_display_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [newPlant.id, newPlant.name, newPlant.email||null, newPlant.phone||null, newPlant.last_interaction, newPlant.created_at, newPlant.updated_at, newPlant.care_frequency_multiplier, newPlant.care_frequency_unit, newPlant.next_scheduled_care, newPlant.last_cared_for, newPlant.description||null, newPlant.additional_info||null, authorUuid, authorDisplayName]
    );

    this.logChange(gardenId, authorUuid, authorDisplayName, 'add_plant', 'plants', newPlant.id, newPlant.name);
    return newPlant;
  }

  static updatePlant(gardenId: string, plantId: string, updates: Partial<Omit<Plant, 'id'|'created_at'>>, actorUuid: string, actorDisplayName: string): void {
    const now = Date.now();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    this.run(gardenId, `UPDATE plants SET ${fields}, updated_at = ? WHERE id = ?`, [...values, now, plantId]);

    const plant = this.getPlant(gardenId, plantId);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_plant', 'plants', plantId, plant?.name ?? plantId);
  }

  static updatePlantCare(gardenId: string, plantId: string, timestamp: number): void {
    const plant = this.getPlant(gardenId, plantId);
    if (!plant) return;
    const hoursInUnit = plant.care_frequency_unit === 'weeks' ? 168 : 24;
    const nextCare = timestamp + (plant.care_frequency_multiplier * hoursInUnit * 3600000);
    this.run(gardenId,
      'UPDATE plants SET last_cared_for = ?, next_scheduled_care = ?, updated_at = ? WHERE id = ?',
      [timestamp, nextCare, Date.now(), plantId]
    );
  }

  static removePlant(gardenId: string, plantId: string, actorUuid: string, actorDisplayName: string): void {
    const plant = this.getPlant(gardenId, plantId);
    const plantName = plant?.name ?? plantId;

    // Tombstone the plant and all related records
    const relatedTables = ['tendings','waterings','sunlight','fruits','prunings','scheduled_events','buds','notchings','capabilities'];
    for (const table of relatedTables) {
      const rows = this.run<Array<{ id: string }>>(gardenId, `SELECT id FROM ${table} WHERE plant_id = ?`, [plantId]);
      for (const row of rows) this.recordTombstone(gardenId, row.id, table);
      this.run(gardenId, `DELETE FROM ${table} WHERE plant_id = ?`, [plantId]);
    }
    this.recordTombstone(gardenId, plantId, 'plants');
    this.run(gardenId, 'DELETE FROM plants WHERE id = ?', [plantId]);
    this.run(gardenId, 'DELETE FROM companions WHERE plant_a_id = ? OR plant_b_id = ?', [plantId, plantId]);
    this.run(gardenId, 'DELETE FROM plot_memberships WHERE plant_id = ?', [plantId]);

    this.logChange(gardenId, actorUuid, actorDisplayName, 'remove_plant', 'plants', plantId, plantName);
  }

  // ─── Activity helpers (generic for all activity tables) ───────────────────

  private static _addActivity(
    gardenId: string,
    table: string,
    record: Record<string, unknown>,
    authorUuid: string,
    authorDisplayName: string,
    actionType: string,
    targetLabel: string
  ): void {
    const cols = Object.keys(record).join(', ');
    const placeholders = Object.keys(record).map(() => '?').join(', ');
    this.run(gardenId, `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, Object.values(record));
    this.logChange(gardenId, authorUuid, authorDisplayName, actionType, table, record.id as string, targetLabel);
  }

  private static _deleteActivity(
    gardenId: string,
    table: string,
    recordId: string,
    actorUuid: string,
    actorDisplayName: string,
    actionType: string,
    targetLabel: string
  ): void {
    this.recordTombstone(gardenId, recordId, table);
    this.run(gardenId, `DELETE FROM ${table} WHERE id = ?`, [recordId]);
    this.logChange(gardenId, actorUuid, actorDisplayName, actionType, table, recordId, targetLabel);
  }

  // ─── Tendings ─────────────────────────────────────────────────────────────

  static addTending(gardenId: string, tending: Omit<Tending,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Tending {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...tending, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    const plantName = this.getPlant(gardenId, tending.plant_id)?.name ?? tending.plant_id;
    this._addActivity(gardenId, 'tendings', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_tending', plantName);
    this.updatePlantCare(gardenId, tending.plant_id, tending.datetime);
    return rec;
  }

  static getTendingsForPlant(gardenId: string, plantId: string): Tending[] {
    return this.run<Tending[]>(gardenId, 'SELECT * FROM tendings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static updateTending(gardenId: string, id: string, updates: Partial<Tending>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE tendings SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_tending', 'tendings', id, 'tending');
  }

  static deleteTending(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'tendings', id, actorUuid, actorDisplayName, 'delete_tending', 'tending');
  }

  // ─── Waterings ────────────────────────────────────────────────────────────

  static addWatering(gardenId: string, watering: Omit<Watering,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Watering {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...watering, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    const plantName = this.getPlant(gardenId, watering.plant_id)?.name ?? watering.plant_id;
    this._addActivity(gardenId, 'waterings', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_watering', plantName);
    this.updatePlantCare(gardenId, watering.plant_id, watering.datetime);
    return rec;
  }

  static getWateringsForPlant(gardenId: string, plantId: string): Watering[] {
    return this.run<Watering[]>(gardenId, 'SELECT * FROM waterings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static updateWatering(gardenId: string, id: string, updates: Partial<Watering>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE waterings SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_watering', 'waterings', id, 'watering');
  }

  static deleteWatering(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'waterings', id, actorUuid, actorDisplayName, 'delete_watering', 'watering');
  }

  // ─── Sunlight ─────────────────────────────────────────────────────────────

  static addSunlight(gardenId: string, sunlight: Omit<Sunlight,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Sunlight {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...sunlight, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    const plantName = this.getPlant(gardenId, sunlight.plant_id)?.name ?? sunlight.plant_id;
    this._addActivity(gardenId, 'sunlight', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_sunlight', plantName);
    return rec;
  }

  static getSunlightForPlant(gardenId: string, plantId: string): Sunlight[] {
    return this.run<Sunlight[]>(gardenId, 'SELECT * FROM sunlight WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static updateSunlight(gardenId: string, id: string, updates: Partial<Sunlight>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE sunlight SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_sunlight', 'sunlight', id, 'sunlight');
  }

  static deleteSunlight(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'sunlight', id, actorUuid, actorDisplayName, 'delete_sunlight', 'sunlight');
  }

  // ─── Fruits ───────────────────────────────────────────────────────────────

  static addFruit(gardenId: string, fruit: Omit<Fruit,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Fruit {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...fruit, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    this._addActivity(gardenId, 'fruits', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_fruit', fruit.description);
    return rec;
  }

  static getFruitsForPlant(gardenId: string, plantId: string): Fruit[] {
    return this.run<Fruit[]>(gardenId, 'SELECT * FROM fruits WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static updateFruit(gardenId: string, id: string, updates: Partial<Fruit>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE fruits SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_fruit', 'fruits', id, 'fruit');
  }

  static deleteFruit(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'fruits', id, actorUuid, actorDisplayName, 'delete_fruit', 'fruit');
  }

  // ─── Prunings ─────────────────────────────────────────────────────────────

  static addPruning(gardenId: string, pruning: Omit<Pruning,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Pruning {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...pruning, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    this._addActivity(gardenId, 'prunings', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_pruning', pruning.description || 'pruning');
    return rec;
  }

  static getPruningsForPlant(gardenId: string, plantId: string): Pruning[] {
    return this.run<Pruning[]>(gardenId, 'SELECT * FROM prunings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static updatePruning(gardenId: string, id: string, updates: Partial<Pruning>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE prunings SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_pruning', 'prunings', id, 'pruning');
  }

  static deletePruning(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'prunings', id, actorUuid, actorDisplayName, 'delete_pruning', 'pruning');
  }

  // ─── Buds ─────────────────────────────────────────────────────────────────

  static addBud(gardenId: string, bud: Omit<Bud,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Bud {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...bud, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    this._addActivity(gardenId, 'buds', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_bud', bud.text);
    return rec;
  }

  static getBudsForPlant(gardenId: string, plantId: string): Bud[] {
    return this.run<Bud[]>(gardenId, 'SELECT * FROM buds WHERE plant_id = ? ORDER BY created_at ASC', [plantId]);
  }

  static updateBud(gardenId: string, id: string, updates: Partial<Bud>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE buds SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_bud', 'buds', id, updates.text ?? 'bud');
  }

  static deleteBud(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'buds', id, actorUuid, actorDisplayName, 'delete_bud', 'bud');
  }

  // ─── Notchings ────────────────────────────────────────────────────────────

  static addNotching(gardenId: string, notching: Omit<Notching,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Notching {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...notching, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    this._addActivity(gardenId, 'notchings', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_notching', notching.book);
    this.updatePlantCare(gardenId, notching.plant_id, notching.datetime);
    return rec;
  }

  static getNotchingsForPlant(gardenId: string, plantId: string): Notching[] {
    return this.run<Notching[]>(gardenId, 'SELECT * FROM notchings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static updateNotching(gardenId: string, id: string, updates: Partial<Notching>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE notchings SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_notching', 'notchings', id, 'notching');
  }

  static deleteNotching(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'notchings', id, actorUuid, actorDisplayName, 'delete_notching', 'notching');
  }

  // ─── Capabilities ─────────────────────────────────────────────────────────

  static addCapability(gardenId: string, capability: Omit<Capability,'id'|'updated_at'>, authorUuid: string, authorDisplayName: string): Capability {
    const now = Date.now();
    const rec = { id: uuidv4(), updated_at: now, ...capability, authored_by_uuid: authorUuid, authored_by_display_name: authorDisplayName };
    this._addActivity(gardenId, 'capabilities', rec as unknown as Record<string, unknown>, authorUuid, authorDisplayName, 'add_capability', capability.text);
    return rec;
  }

  static getCapabilitiesForPlant(gardenId: string, plantId: string): Capability[] {
    return this.run<Capability[]>(gardenId, 'SELECT * FROM capabilities WHERE plant_id = ? ORDER BY created_at ASC', [plantId]);
  }

  static updateCapability(gardenId: string, id: string, updates: Partial<Capability>, actorUuid: string, actorDisplayName: string): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    this.run(gardenId, `UPDATE capabilities SET ${fields}, updated_at = ? WHERE id = ?`, [...Object.values(updates), Date.now(), id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_capability', 'capabilities', id, updates.text ?? 'capability');
  }

  static deleteCapability(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this._deleteActivity(gardenId, 'capabilities', id, actorUuid, actorDisplayName, 'delete_capability', 'capability');
  }

  // ─── Scheduled events ─────────────────────────────────────────────────────

  static addScheduledEvent(gardenId: string, event: Omit<ScheduledEvent,'id'|'updated_at'>): ScheduledEvent {
    const now = Date.now();
    const rec: ScheduledEvent = { id: uuidv4(), updated_at: now, ...event };
    this.run(gardenId,
      'INSERT INTO scheduled_events (id,plant_id,event_type,scheduled_date,updated_at,description,additional_info) VALUES (?,?,?,?,?,?,?)',
      [rec.id, rec.plant_id, rec.event_type, rec.scheduled_date, rec.updated_at, rec.description||null, rec.additional_info||null]
    );
    return rec;
  }

  static getScheduledEventsForPlant(gardenId: string, plantId: string): ScheduledEvent[] {
    return this.run<ScheduledEvent[]>(gardenId, 'SELECT * FROM scheduled_events WHERE plant_id = ? ORDER BY scheduled_date ASC', [plantId]);
  }

  static deleteScheduledEvent(gardenId: string, id: string): void {
    this.recordTombstone(gardenId, id, 'scheduled_events');
    this.run(gardenId, 'DELETE FROM scheduled_events WHERE id = ?', [id]);
  }

  // ─── Companions ───────────────────────────────────────────────────────────

  static addCompanion(gardenId: string, companion: Omit<Companion,'id'|'updated_at'>, actorUuid: string, actorDisplayName: string): Companion {
    const now = Date.now();
    const rec: Companion = { id: uuidv4(), updated_at: now, ...companion };
    this.run(gardenId,
      'INSERT INTO companions (id,plant_a_id,relationship_descriptor,plant_b_id,updated_at,additional_info) VALUES (?,?,?,?,?,?)',
      [rec.id, rec.plant_a_id, rec.relationship_descriptor, rec.plant_b_id, rec.updated_at, rec.additional_info||null]
    );
    this.logChange(gardenId, actorUuid, actorDisplayName, 'add_companion', 'companions', rec.id, companion.relationship_descriptor);
    return rec;
  }

  static getCompanionsForPlant(gardenId: string, plantId: string): Companion[] {
    return this.run<Companion[]>(gardenId, 'SELECT * FROM companions WHERE plant_a_id = ? OR plant_b_id = ?', [plantId, plantId]);
  }

  static deleteCompanion(gardenId: string, id: string, actorUuid: string, actorDisplayName: string): void {
    this.recordTombstone(gardenId, id, 'companions');
    this.run(gardenId, 'DELETE FROM companions WHERE id = ?', [id]);
    this.logChange(gardenId, actorUuid, actorDisplayName, 'delete_companion', 'companions', id, 'companion');
  }

  // ─── Plots ────────────────────────────────────────────────────────────────

  static getPlots(gardenId: string): Plot[] {
    return this.run<Plot[]>(gardenId, 'SELECT * FROM plots ORDER BY created_at DESC', []);
  }

  static getPlot(gardenId: string, plotId: string): Plot | null {
    const res = this.run<Plot[]>(gardenId, 'SELECT * FROM plots WHERE id = ?', [plotId]);
    return res[0] ?? null;
  }

  static getPlotMembers(gardenId: string, plotId: string): Plant[] {
    return this.run<Plant[]>(gardenId,
      'SELECT p.* FROM plants p JOIN plot_memberships pm ON pm.plant_id = p.id WHERE pm.plot_id = ?',
      [plotId]
    );
  }

  static createPlot(
    gardenId: string,
    plot: Omit<Plot,'id'|'created_at'|'updated_at'>,
    actorUuid: string,
    actorDisplayName: string
  ): Plot {
    const now = Date.now();
    const rec: Plot = { id: uuidv4(), created_at: now, updated_at: now, ...plot };
    this.run(gardenId,
      'INSERT INTO plots (id,name,description,created_at,updated_at,additional_info) VALUES (?,?,?,?,?,?)',
      [rec.id, rec.name, rec.description||null, rec.created_at, rec.updated_at, rec.additional_info||null]
    );
    this.logChange(gardenId, actorUuid, actorDisplayName, 'create_plot', 'plots', rec.id, rec.name);
    return rec;
  }

  static updatePlot(
    gardenId: string,
    plotId: string,
    changes: { name?: string; description?: string; additional_info?: string },
    actorUuid: string,
    actorDisplayName: string
  ): void {
    const now = Date.now();
    const existing = this.getPlot(gardenId, plotId);
    if (!existing) return;
    const updated = { ...existing, ...changes, updated_at: now };
    this.run(gardenId,
      'UPDATE plots SET name=?,description=?,additional_info=?,updated_at=? WHERE id=?',
      [updated.name, updated.description||null, updated.additional_info||null, now, plotId]
    );
    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_plot', 'plots', plotId, updated.name);
  }

  static deletePlot(
    gardenId: string,
    plotId: string,
    actorUuid: string,
    actorDisplayName: string,
    plotName: string
  ): void {
    this.run(gardenId, 'DELETE FROM plot_memberships WHERE plot_id = ?', [plotId]);
    this.run(gardenId, 'DELETE FROM plots WHERE id = ?', [plotId]);
    this.recordTombstone(gardenId, plotId, 'plots');
    this.logChange(gardenId, actorUuid, actorDisplayName, 'delete_plot', 'plots', plotId, plotName);
  }

  static updatePlotMemberships(
    gardenId: string,
    plotId: string,
    plantIds: string[],
    actorUuid: string,
    actorDisplayName: string,
    plotName: string
  ): void {
    const now = Date.now();

    const existing = this.run<Array<{ id: string; plant_id: string }>>(gardenId,
      'SELECT id, plant_id FROM plot_memberships WHERE plot_id = ?', [plotId]
    );
    const existingByPlantId = new Map<string, { id: string; plant_id: string }>();
    for (const row of existing) {
      if (!existingByPlantId.has(row.plant_id)) existingByPlantId.set(row.plant_id, row);
    }

    const desiredSet = new Set(plantIds);

    for (const [plantId, row] of existingByPlantId) {
      if (!desiredSet.has(plantId)) {
        this.run(gardenId, 'DELETE FROM plot_memberships WHERE id = ?', [row.id]);
        this.recordTombstone(gardenId, row.id, 'plot_memberships');
      }
    }

    for (const plantId of plantIds) {
      const existingRow = existingByPlantId.get(plantId);
      if (existingRow) {
        this.run(gardenId,
          'UPDATE plot_memberships SET updated_at = ? WHERE id = ?',
          [now, existingRow.id]
        );
      } else {
        this.run(gardenId,
          'INSERT INTO plot_memberships (id,plot_id,plant_id,updated_at) VALUES (?,?,?,?)',
          [uuidv4(), plotId, plantId, now]
        );
      }
    }

    this.logChange(gardenId, actorUuid, actorDisplayName, 'edit_plot_members', 'plots', plotId, plotName);
  }

  private static _cleanupDuplicatePlotMemberships(gardenId: string): void {
    let done: Record<string, boolean> = {};
    try {
      const raw = localStorage.getItem(PLOT_MEMBERSHIP_CLEANUP_KEY);
      done = raw ? JSON.parse(raw) : {};
    } catch { done = {}; }
    if (done[gardenId]) return;

    try {
      const all = this.run<Array<{ id: string; plot_id: string; plant_id: string; updated_at: number }>>(gardenId,
        'SELECT id, plot_id, plant_id, updated_at FROM plot_memberships', []
      );
      const byKey = new Map<string, Array<{ id: string; plot_id: string; plant_id: string; updated_at: number }>>();
      for (const row of all) {
        const key = `${row.plot_id}|${row.plant_id}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(row);
      }
      for (const [, rows] of byKey) {
        if (rows.length <= 1) continue;
        rows.sort((a, b) => a.updated_at - b.updated_at);
        const keep = rows[0];
        for (let i = 1; i < rows.length; i++) {
          this.run(gardenId, 'DELETE FROM plot_memberships WHERE id = ?', [rows[i].id]);
          this.recordTombstone(gardenId, rows[i].id, 'plot_memberships');
        }
        void keep;
      }
    } catch {
      // table might not exist yet — skip
    }

    done[gardenId] = true;
    localStorage.setItem(PLOT_MEMBERSHIP_CLEANUP_KEY, JSON.stringify(done));
  }

  static logPlotBulkActivity(
    gardenId: string,
    actorUuid: string,
    actorDisplayName: string,
    activityType: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'notching',
    plotId: string,
    plotName: string
  ): void {
    this.logChange(gardenId, actorUuid, actorDisplayName, `bulk_${activityType}`, 'plots', plotId, plotName);
  }

  // ─── Date-range activity queries (for report generation) ─────────────────

  static getAllTendingsByRange(gardenId: string, fromMs: number, toMs: number): (Tending & { authored_by_display_name: string; authored_by_uuid: string })[] {
    return this.run(gardenId,
      'SELECT * FROM tendings WHERE datetime >= ? AND datetime <= ? ORDER BY datetime ASC',
      [fromMs, toMs]
    );
  }

  static getAllWateringsByRange(gardenId: string, fromMs: number, toMs: number): (Watering & { authored_by_display_name: string; authored_by_uuid: string })[] {
    return this.run(gardenId,
      'SELECT * FROM waterings WHERE datetime >= ? AND datetime <= ? ORDER BY datetime ASC',
      [fromMs, toMs]
    );
  }

  static getAllSunlightByRange(gardenId: string, fromMs: number, toMs: number): (Sunlight & { authored_by_display_name: string; authored_by_uuid: string })[] {
    return this.run(gardenId,
      'SELECT * FROM sunlight WHERE datetime >= ? AND datetime <= ? ORDER BY datetime ASC',
      [fromMs, toMs]
    );
  }

  static getAllFruitsByRange(gardenId: string, fromMs: number, toMs: number): (Fruit & { authored_by_display_name: string; authored_by_uuid: string })[] {
    return this.run(gardenId,
      'SELECT * FROM fruits WHERE datetime >= ? AND datetime <= ? ORDER BY datetime ASC',
      [fromMs, toMs]
    );
  }

  static getAllPruningsByRange(gardenId: string, fromMs: number, toMs: number): (Pruning & { authored_by_display_name: string; authored_by_uuid: string })[] {
    return this.run(gardenId,
      'SELECT * FROM prunings WHERE datetime >= ? AND datetime <= ? ORDER BY datetime ASC',
      [fromMs, toMs]
    );
  }

  static getAllNotchingsByRange(gardenId: string, fromMs: number, toMs: number): (Notching & { authored_by_display_name: string; authored_by_uuid: string })[] {
    return this.run(gardenId,
      'SELECT * FROM notchings WHERE datetime >= ? AND datetime <= ? ORDER BY datetime ASC',
      [fromMs, toMs]
    );
  }

  static getAllPlotMemberships(gardenId: string): PlotMembership[] {
    return this.run<PlotMembership[]>(gardenId, 'SELECT * FROM plot_memberships', []);
  }

  // ─── Full snapshot ────────────────────────────────────────────────────────

  static getFullSnapshot(gardenId: string): SharedGardenSnapshot {
    return {
      plants: this.run<Plant[]>(gardenId, 'SELECT * FROM plants', []),
      tendings: this.run<Tending[]>(gardenId, 'SELECT * FROM tendings', []),
      waterings: this.run<Watering[]>(gardenId, 'SELECT * FROM waterings', []),
      sunlight: this.run<Sunlight[]>(gardenId, 'SELECT * FROM sunlight', []),
      fruits: this.run<Fruit[]>(gardenId, 'SELECT * FROM fruits', []),
      prunings: this.run<Pruning[]>(gardenId, 'SELECT * FROM prunings', []),
      companions: this.run<Companion[]>(gardenId, 'SELECT * FROM companions', []),
      scheduled_events: this.run<ScheduledEvent[]>(gardenId, 'SELECT * FROM scheduled_events', []),
      plots: this.run<Plot[]>(gardenId, 'SELECT * FROM plots', []),
      plot_memberships: this.run<PlotMembership[]>(gardenId, 'SELECT * FROM plot_memberships', []),
      buds: this.run<Bud[]>(gardenId, 'SELECT * FROM buds', []),
      notchings: this.run<Notching[]>(gardenId, 'SELECT * FROM notchings', []),
      capabilities: this.run<Capability[]>(gardenId, 'SELECT * FROM capabilities', []),
      members: this.getMembers(gardenId),
      change_log: this.run<GardenChangeLogEntry[]>(gardenId, 'SELECT * FROM garden_change_log ORDER BY occurred_at DESC', []),
      snapshot_at: Date.now(),
    };
  }

  // ─── Delta collection ─────────────────────────────────────────────────────

  static getDeltasSince(gardenId: string, sinceTs: number, authorUuid: string, authorDisplayName: string): SharedGardenDelta[] {
    const deltas: SharedGardenDelta[] = [];
    const tables = [
      'plants','tendings','waterings','sunlight','fruits','prunings',
      'companions','scheduled_events','plots','plot_memberships',
      'buds','notchings','capabilities',
      'garden_members'
    ];

    for (const table of tables) {
      let rows: Array<Record<string, unknown>>;
      try {
        rows = this.run<Array<Record<string, unknown>>>(gardenId, `SELECT * FROM ${table} WHERE updated_at >= ?`, [sinceTs]);
      } catch {
        // table might not have updated_at — skip
        continue;
      }
      for (const row of rows) {
        deltas.push({
          id: uuidv4(),
          type: 'UPDATE',
          table,
          record_id: row.id as string,
          data: row,
          ts: (row.updated_at as number) ?? (row.occurred_at as number) ?? (row.joined_at as number) ?? sinceTs,
          authored_by_uuid: (row.authored_by_uuid as string) ?? authorUuid,
          authored_by_display_name: (row.authored_by_display_name as string) ?? authorDisplayName,
        });
      }
    }

    // garden_change_log uses occurred_at instead of updated_at
    try {
      const logRows = this.run<Array<Record<string, unknown>>>(gardenId, `SELECT * FROM garden_change_log WHERE occurred_at >= ?`, [sinceTs]);
      for (const row of logRows) {
        deltas.push({
          id: uuidv4(),
          type: 'UPDATE',
          table: 'garden_change_log',
          record_id: row.id as string,
          data: row,
          ts: row.occurred_at as number,
          authored_by_uuid: (row.actor_uuid as string) ?? authorUuid,
          authored_by_display_name: (row.actor_display_name as string) ?? authorDisplayName,
        });
      }
    } catch {
      // garden_change_log not yet initialised — skip
    }

    // Tombstones
    const tombstones = this.run<Array<{ id: string; record_id: string; table_name: string; deleted_at: number }>>(
      gardenId, 'SELECT * FROM garden_tombstones WHERE deleted_at > ?', [sinceTs]
    );
    for (const t of tombstones) {
      deltas.push({
        id: uuidv4(),
        type: 'DELETE',
        table: t.table_name,
        record_id: t.record_id,
        ts: t.deleted_at,
        authored_by_uuid: authorUuid,
        authored_by_display_name: authorDisplayName,
      });
    }

    return deltas.sort((a, b) => a.ts - b.ts);
  }

  // ─── Apply incoming deltas ────────────────────────────────────────────────

  static applyDeltas(
    gardenId: string,
    deltas: SharedGardenDelta[]
  ): Array<{ delta: SharedGardenDelta; reason: string }> {
    const conflicts: Array<{ delta: SharedGardenDelta; reason: string }> = [];

    for (const delta of [...deltas].sort((a, b) => a.ts - b.ts)) {
      if (delta.type === 'DELETE') {
        // Conflict: if anyone tries to write to a record we don't have (already deleted)
        // — but we only need to prevent re-insertion from stale snapshots
        this.run(gardenId, `DELETE FROM ${delta.table} WHERE id = ?`, [delta.record_id]);
        this.recordTombstone(gardenId, delta.record_id, delta.table);
        continue;
      }

      if (!delta.data) continue;

      // Check tombstone — if we deleted this record and incoming tries to INSERT it, that's a conflict
      if (this.hasTombstone(gardenId, delta.record_id)) {
        conflicts.push({ delta, reason: 'Activity added to a deleted record' });
        continue;
      }

      let existing: Array<Record<string, unknown>>;
      try {
        existing = this.run<Array<Record<string, unknown>>>(gardenId, `SELECT * FROM ${delta.table} WHERE id = ?`, [delta.record_id]);
      } catch {
        existing = [];
      }

      if (delta.table === 'plot_memberships' && existing.length === 0 && delta.data) {
        const plotId = delta.data.plot_id as string;
        const plantId = delta.data.plant_id as string;
        if (plotId && plantId) {
          try {
            const byKey = this.run<Array<Record<string, unknown>>>(gardenId,
              'SELECT * FROM plot_memberships WHERE plot_id = ? AND plant_id = ?',
              [plotId, plantId]
            );
            if (byKey.length > 0) existing = byKey;
          } catch { /* table might not exist */ }
        }
      }

      if (existing.length === 0) {
        // Insert new record
        const cols = Object.keys(delta.data).join(', ');
        const placeholders = Object.keys(delta.data).map(() => '?').join(', ');
        try {
          this.run(gardenId, `INSERT INTO ${delta.table} (${cols}) VALUES (${placeholders})`, Object.values(delta.data));
        } catch {
          // duplicate — silently skip
        }
      } else {
        // Last-write-wins by individual record timestamp
        const localTs: number = (existing[0].updated_at as number) ?? (existing[0].occurred_at as number) ?? 0;
        if (delta.ts >= localTs) {
          const fields = Object.keys(delta.data).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
          const values = Object.keys(delta.data).filter(k => k !== 'id').map(k => delta.data![k]);
          if (fields) {
            try {
              this.run(gardenId, `UPDATE ${delta.table} SET ${fields} WHERE id = ?`, [...values, delta.record_id]);
            } catch {
              // silently skip
            }
          }
        }
        // if local is newer, keep local — do nothing
      }
    }

    return conflicts;
  }

  // ─── Apply full snapshot (first join) ─────────────────────────────────────

  static applySnapshot(gardenId: string, snapshot: SharedGardenSnapshot): void {
    const tables: Array<[string, Array<Record<string, unknown>>]> = [
      ['plants', snapshot.plants as unknown as Array<Record<string, unknown>>],
      ['tendings', snapshot.tendings as unknown as Array<Record<string, unknown>>],
      ['waterings', snapshot.waterings as unknown as Array<Record<string, unknown>>],
      ['sunlight', snapshot.sunlight as unknown as Array<Record<string, unknown>>],
      ['fruits', snapshot.fruits as unknown as Array<Record<string, unknown>>],
      ['prunings', snapshot.prunings as unknown as Array<Record<string, unknown>>],
      ['companions', snapshot.companions as unknown as Array<Record<string, unknown>>],
      ['scheduled_events', snapshot.scheduled_events as unknown as Array<Record<string, unknown>>],
      ['plots', snapshot.plots as unknown as Array<Record<string, unknown>>],
      ['plot_memberships', snapshot.plot_memberships as unknown as Array<Record<string, unknown>>],
      ['buds', snapshot.buds as unknown as Array<Record<string, unknown>>],
      ['notchings', snapshot.notchings as unknown as Array<Record<string, unknown>>],
      ['capabilities', snapshot.capabilities as unknown as Array<Record<string, unknown>>],
      ['garden_members', snapshot.members as unknown as Array<Record<string, unknown>>],
      ['garden_change_log', snapshot.change_log as unknown as Array<Record<string, unknown>>],
    ];

    for (const [table, rows] of tables) {
      for (const row of rows) {
        if (this.hasTombstone(gardenId, row.id as string)) continue;
        let existing = this.run<Array<Record<string, unknown>>>(gardenId, `SELECT * FROM ${table} WHERE id = ?`, [row.id]);
        if (table === 'plot_memberships' && (existing as unknown[]).length === 0) {
          const plotId = (row as Record<string, unknown>).plot_id as string;
          const plantId = (row as Record<string, unknown>).plant_id as string;
          if (plotId && plantId) {
            try {
              const byKey = this.run<Array<Record<string, unknown>>>(gardenId,
                'SELECT * FROM plot_memberships WHERE plot_id = ? AND plant_id = ?',
                [plotId, plantId]
              );
              if (byKey.length > 0) existing = byKey;
            } catch { /* table might not exist */ }
          }
        }
        if ((existing as unknown[]).length === 0) {
          const cols = Object.keys(row).join(', ');
          const placeholders = Object.keys(row).map(() => '?').join(', ');
          try {
            this.run(gardenId, `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, Object.values(row));
          } catch {
            // silently skip
          }
        } else {
          // Last-write-wins: update if incoming row is newer
          const localTs: number = (existing[0].updated_at as number) ?? (existing[0].occurred_at as number) ?? 0;
          const incomingTs: number = (row.updated_at as number) ?? (row.occurred_at as number) ?? 0;
          if (incomingTs >= localTs) {
            const fields = Object.keys(row).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
            const values = Object.keys(row).filter(k => k !== 'id').map(k => row[k]);
            if (fields) {
              try {
                this.run(gardenId, `UPDATE ${table} SET ${fields} WHERE id = ?`, [...values, row.id]);
              } catch {
                // silently skip
              }
            }
          }
        }
      }
    }
  }

  // ─── Garden name management ───────────────────────────────────────────────

  static getGardenStats(gardenId: string): { plantCount: number; memberCount: number } {
    const plants = this.run<unknown[]>(gardenId, 'SELECT id FROM plants', []);
    const members = this.run<unknown[]>(gardenId, 'SELECT id FROM garden_members', []);
    return { plantCount: (plants as unknown[]).length, memberCount: (members as unknown[]).length };
  }
}
