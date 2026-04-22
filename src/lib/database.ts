import alasql from 'alasql';
import { v4 as uuidv4 } from 'uuid';

// Configure AlaSQL to use IndexedDB for persistence
alasql.options.autocommit = true;

export interface Plant {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  last_interaction: number;
  created_at: number;
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
  type: string;
  summary: string;
  additional_info?: string; // JSON string
}

export interface Watering {
  id: string;
  plant_id: string;
  datetime: number;
  source: string;
  progress_description: string;
  additional_info?: string; // JSON string
}

export interface Sunlight {
  id: string;
  plant_id: string;
  datetime: number;
  topic: string;
  additional_info?: string; // JSON string
}

export interface Fruit {
  id: string;
  plant_id: string;
  datetime: number;
  description: string;
  additional_info?: string; // JSON string
}

export interface Pruning {
  id: string;
  plant_id: string;
  datetime: number;
  difficulty: string;
  description: string;
  additional_info?: string; // JSON string
}

export interface Companion {
  id: string;
  plant_a_id: string;
  relationship_descriptor: string;
  plant_b_id: string;
  additional_info?: string; // JSON string
}

export interface ScheduledEvent {
  id: string;
  plant_id: string;
  event_type: 'tending' | 'watering';
  scheduled_date: number;
  description?: string;
  additional_info?: string; // JSON string
}

export interface Plot {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  additional_info?: string; // JSON string
}

export interface PlotMembership {
  id: string;
  plot_id: string;
  plant_id: string;
}

export interface Bud {
  id: string;
  plant_id: string;
  text: string;
  created_at: number;
}

export interface Notching {
  id: string;
  plant_id: string;
  datetime: number;
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
}

export interface PlotWithMembers extends Plot {
  members: Plant[];
}

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

export class DatabaseService {
  private static initialized = false;
  private static dbName = 'GardenDB';

  /**
   * Initialize the AlaSQL database with IndexedDB persistence
   */
  static async init(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('Initializing database with localStorage...');
      
      // Create localStorage database if it doesn't exist
      await new Promise<void>((resolve, reject) => {
        alasql(`CREATE LOCALSTORAGE DATABASE IF NOT EXISTS ${this.dbName}`, [], (res: any) => {
          if (res === 1 || res === 0) {
            console.log('localStorage database created/verified');
            resolve();
          } else {
            console.error('Failed to create localStorage database:', res);
            reject(new Error('Failed to create localStorage database'));
          }
        });
      });

      // Attach to localStorage
      await new Promise<void>((resolve, reject) => {
        alasql(`ATTACH LOCALSTORAGE DATABASE ${this.dbName}`, [], (res: any) => {
          if (res === 1) {
            console.log('Successfully attached to localStorage');
            resolve();
          } else {
            console.error('Failed to attach to localStorage:', res);
            reject(new Error('Failed to attach to localStorage'));
          }
        });
      });

      // Use the localStorage database
      await new Promise<void>((resolve, reject) => {
        alasql(`USE ${this.dbName}`, [], (res: any) => {
          if (res === 1 || res === 0) {
            console.log('Using localStorage database');var lala = alasql;console.log(lala);
            resolve();
          } else {
            console.error('Failed to use localStorage database:', res);
            reject(new Error('Failed to use localStorage database'));
          }
        });
      });

    } catch (error) {
      console.warn('localStorage not available, falling back to memory storage:', error);
      // Continue with in-memory storage if IndexedDB fails
    }

    // Create tables
    await this.createTable('plants', `
      id STRING PRIMARY KEY,
      name STRING NOT NULL,
      email STRING,
      phone STRING,
      last_interaction NUMBER DEFAULT 0,
      created_at NUMBER NOT NULL,
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
      type STRING NOT NULL,
      summary STRING,
      additional_info STRING
    `);

    await this.createTable('waterings', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      source STRING NOT NULL,
      progress_description STRING,
      additional_info STRING
    `);

    await this.createTable('sunlight', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      topic STRING NOT NULL,
      additional_info STRING
    `);

    await this.createTable('fruits', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      description STRING NOT NULL,
      additional_info STRING
    `);

    await this.createTable('prunings', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
      difficulty STRING NOT NULL,
      description STRING,
      additional_info STRING
    `);

    await this.createTable('companions', `
      id STRING PRIMARY KEY,
      plant_a_id STRING NOT NULL,
      relationship_descriptor STRING NOT NULL,
      plant_b_id STRING NOT NULL,
      additional_info STRING
    `);

    await this.createTable('scheduled_events', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      event_type STRING NOT NULL,
      scheduled_date NUMBER NOT NULL,
      description STRING,
      additional_info STRING
    `);

    await this.createTable('plots', `
      id STRING PRIMARY KEY,
      name STRING NOT NULL,
      description STRING,
      created_at NUMBER NOT NULL,
      additional_info STRING
    `);

    await this.createTable('plot_memberships', `
      id STRING PRIMARY KEY,
      plot_id STRING NOT NULL,
      plant_id STRING NOT NULL
    `);

    await this.createTable('buds', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      text STRING NOT NULL,
      created_at NUMBER NOT NULL
    `);

    await this.createTable('notchings', `
      id STRING PRIMARY KEY,
      plant_id STRING NOT NULL,
      datetime NUMBER NOT NULL,
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
      created_at NUMBER NOT NULL
    `);

    this.initialized = true;
    console.log('Database initialization complete');
    
    // Debug mode: expose alasql to global scope in development
    if (import.meta.env.DEV) {
      (window as any).alasql = alasql;
      console.log('🐛 Debug mode: alasql is now available in the global scope');
    }
  }

  /**
   * Helper method to create tables with proper error handling
   */
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

  /**
   * Force save data to localStorage
   */
  static async saveToStorage(): Promise<void> {
    try {
      markPendingChanges();
      console.log('Data saved to localStorage');
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  // Plant operations
  static async getPlant(id: string): Promise<Plant | null> {
    const results = alasql('SELECT * FROM plants WHERE id = ?', [id]);
    return results.length > 0 ? results[0] : null;
  }

  static async getAllPlants(): Promise<Plant[]> {
    try {
      const results = alasql('SELECT * FROM plants ORDER BY next_scheduled_care ASC');
      const fields = alasql('show columns from plants');
      console.log("240",fields,results)
      return Array.isArray(results) ? results : [];
    } catch (error) {
      console.error('Failed to get plants:', error);
      return [];
    }
  }

  static async addPlant(plant: Omit<Plant, 'id' | 'created_at'>): Promise<Plant> {
    const now = Date.now();
    const hoursInUnit = plant.care_frequency_unit === 'weeks' ? 168 : 24;
    const nextCareTimestamp = now + (plant.care_frequency_multiplier * hoursInUnit * 60 * 60 * 1000);
    console.log("next care",nextCareTimestamp);
    const newPlant: Plant = {
      id: uuidv4(),
      created_at: now,
      last_interaction: now,
      last_cared_for: plant.last_cared_for || now,
      next_scheduled_care: plant.next_scheduled_care || nextCareTimestamp,
      ...plant
    };
    console.log("new plant",newPlant)

    alasql('INSERT INTO plants VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      newPlant.id,
      newPlant.name,
      newPlant.email || null,
      newPlant.phone || null,
      newPlant.last_interaction,
      newPlant.created_at,
      newPlant.care_frequency_multiplier,
      newPlant.care_frequency_unit,
      newPlant.next_scheduled_care,
      newPlant.last_cared_for,
      newPlant.description || null,
      newPlant.additional_info || null
    ]);

    await this.saveToStorage();

    // Trigger notification scheduling
    if (typeof window !== 'undefined' && 'dispatchEvent' in window) {
      window.dispatchEvent(new CustomEvent('plant-care-updated', {
        detail: { plantId: newPlant.id, nextCareTimestamp: newPlant.next_scheduled_care, plantName: newPlant.name }
      }));
    }

    return newPlant;
  }

  static async updatePlantInteraction(plantId: string, timestamp: number): Promise<void> {
    alasql('UPDATE plants SET last_interaction = ? WHERE id = ?', [timestamp, plantId]);
    markPendingChanges();
  }

  static async updatePlantCare(plantId: string, timestamp: number): Promise<void> {
    // Get the plant's care frequency settings
    const plant = await this.getPlant(plantId);
    if (!plant) return;

    const hoursInUnit = plant.care_frequency_unit === 'weeks' ? 168 : 24;
    const nextCareTimestamp = timestamp + (plant.care_frequency_multiplier * hoursInUnit * 60 * 60 * 1000);

    alasql('UPDATE plants SET last_cared_for = ?, next_scheduled_care = ? WHERE id = ?', [
      timestamp,
      nextCareTimestamp,
      plantId
    ]);
    markPendingChanges();

    // Trigger notification scheduling
    if (typeof window !== 'undefined' && 'dispatchEvent' in window) {
      window.dispatchEvent(new CustomEvent('plant-care-updated', {
        detail: { plantId, nextCareTimestamp, plantName: plant.name }
      }));
    }
  }

  static async updatePlantNextScheduledCare(plantId: string, timestamp: number): Promise<void> {
    const plant = await this.getPlant(plantId);
    alasql('UPDATE plants SET next_scheduled_care = ? WHERE id = ?', [timestamp, plantId]);
    await this.saveToStorage();

    // Trigger notification scheduling
    if (plant && typeof window !== 'undefined' && 'dispatchEvent' in window) {
      window.dispatchEvent(new CustomEvent('plant-care-updated', {
        detail: { plantId, nextCareTimestamp: timestamp, plantName: plant.name }
      }));
    }
  }

  static async updatePlant(plantId: string, updates: Partial<Omit<Plant, 'id' | 'created_at' | 'last_interaction' | 'last_cared_for'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE plants SET ${fields} WHERE id = ?`, [...values, plantId]);
    await this.saveToStorage();
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
    alasql('UPDATE plants SET additional_info = ? WHERE id = ?', [serialized, plantId]);
    markPendingChanges();
  }

  static async removePlant(plantId: string): Promise<void> {
    // Remove the plant and all related data
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

  // Tending operations
  static async addTending(tending: Omit<Tending, 'id'>): Promise<Tending> {
    const newTending: Tending = {
      id: uuidv4(),
      ...tending
    };
    
    alasql('INSERT INTO tendings VALUES (?, ?, ?, ?, ?, ?)', [
      newTending.id,
      newTending.plant_id,
      newTending.datetime,
      newTending.type,
      newTending.summary || null,
      newTending.additional_info || null
    ]);
    
    // Update plant's last interaction
    await this.updatePlantInteraction(newTending.plant_id, newTending.datetime);
    
    // Update plant's care schedule
    await this.updatePlantCare(newTending.plant_id, newTending.datetime);
    
    await this.saveToStorage();
    return newTending;
  }

  static async getTendingsForPlant(plantId: string): Promise<Tending[]> {
    return alasql('SELECT * FROM tendings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  // Watering operations
  static async addWatering(watering: Omit<Watering, 'id'>): Promise<Watering> {
    const newWatering: Watering = {
      id: uuidv4(),
      ...watering
    };
    
    alasql('INSERT INTO waterings VALUES (?, ?, ?, ?, ?, ?)', [
      newWatering.id,
      newWatering.plant_id,
      newWatering.datetime,
      newWatering.source,
      newWatering.progress_description || null,
      newWatering.additional_info || null
    ]);
    
    // Update plant's last interaction
    await this.updatePlantInteraction(newWatering.plant_id, newWatering.datetime);
    
    // Update plant's care schedule
    await this.updatePlantCare(newWatering.plant_id, newWatering.datetime);
    
    await this.saveToStorage();
    return newWatering;
  }

  static async getWateringsForPlant(plantId: string): Promise<Watering[]> {
    return alasql('SELECT * FROM waterings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  // Sunlight operations
  static async addSunlight(sunlight: Omit<Sunlight, 'id'>): Promise<Sunlight> {
    const newSunlight: Sunlight = {
      id: uuidv4(),
      ...sunlight
    };
    
    alasql('INSERT INTO sunlight VALUES (?, ?, ?, ?, ?)', [
      newSunlight.id,
      newSunlight.plant_id,
      newSunlight.datetime,
      newSunlight.topic,
      newSunlight.additional_info || null
    ]);
    
    await this.saveToStorage();
    return newSunlight;
  }

  static async getSunlightForPlant(plantId: string): Promise<Sunlight[]> {
    return alasql('SELECT * FROM sunlight WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  // Fruit operations
  static async addFruit(fruit: Omit<Fruit, 'id'>): Promise<Fruit> {
    const newFruit: Fruit = {
      id: uuidv4(),
      ...fruit
    };
    
    alasql('INSERT INTO fruits VALUES (?, ?, ?, ?, ?)', [
      newFruit.id,
      newFruit.plant_id,
      newFruit.datetime,
      newFruit.description,
      newFruit.additional_info || null
    ]);
    
    await this.saveToStorage();
    return newFruit;
  }

  static async getFruitsForPlant(plantId: string): Promise<Fruit[]> {
    return alasql('SELECT * FROM fruits WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  // Pruning operations
  static async addPruning(pruning: Omit<Pruning, 'id'>): Promise<Pruning> {
    const newPruning: Pruning = {
      id: uuidv4(),
      ...pruning
    };
    
    alasql('INSERT INTO prunings VALUES (?, ?, ?, ?, ?, ?)', [
      newPruning.id,
      newPruning.plant_id,
      newPruning.datetime,
      newPruning.difficulty,
      newPruning.description || null,
      newPruning.additional_info || null
    ]);
    
    await this.saveToStorage();
    return newPruning;
  }

  // Plot operations
  static async createPlot(plot: Omit<Plot, 'id' | 'created_at'>): Promise<Plot> {
    const newPlot: Plot = {
      id: uuidv4(),
      created_at: Date.now(),
      ...plot
    };
    
    alasql('INSERT INTO plots VALUES (?, ?, ?, ?, ?)', [
      newPlot.id,
      newPlot.name,
      newPlot.description || null,
      newPlot.created_at,
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

  static async updatePlot(id: string, updates: Partial<Omit<Plot, 'id' | 'created_at'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE plots SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async deletePlot(id: string): Promise<void> {
    // Remove plot and all its memberships
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

    return {
      ...plot,
      members: membershipResults || []
    };
  }

  static async addPlantToPlot(plotId: string, plantId: string): Promise<void> {
    // Check if membership already exists
    const existing = alasql('SELECT * FROM plot_memberships WHERE plot_id = ? AND plant_id = ?', [plotId, plantId]);
    if (existing.length > 0) return;

    const membership: PlotMembership = {
      id: uuidv4(),
      plot_id: plotId,
      plant_id: plantId
    };

    alasql('INSERT INTO plot_memberships VALUES (?, ?, ?)', [
      membership.id,
      membership.plot_id,
      membership.plant_id
    ]);

    await this.saveToStorage();
  }

  static async removePlantFromPlot(plotId: string, plantId: string): Promise<void> {
    alasql('DELETE FROM plot_memberships WHERE plot_id = ? AND plant_id = ?', [plotId, plantId]);
    await this.saveToStorage();
  }

  static async updatePlotMemberships(plotId: string, plantIds: string[]): Promise<void> {
    // Remove all existing memberships for this plot
    alasql('DELETE FROM plot_memberships WHERE plot_id = ?', [plotId]);

    // Add new memberships
    for (const plantId of plantIds) {
      const membership: PlotMembership = {
        id: uuidv4(),
        plot_id: plotId,
        plant_id: plantId
      };

      alasql('INSERT INTO plot_memberships VALUES (?, ?, ?)', [
        membership.id,
        membership.plot_id,
        membership.plant_id
      ]);
    }

    await this.saveToStorage();
  }

  // Bulk activity logging
  static async logBulkActivity(
    activityType: 'tending' | 'watering' | 'sunlight' | 'fruit',
    activityData: any,
    plantIds: string[],
    customTimestamp?: number
  ): Promise<void> {
    if (plantIds.length === 0) return;

    const timestamp = customTimestamp || Date.now();
    const recordsToInsert: any[][] = [];
    let tableName: string;
    let columns: string[];
    
    // Determine table name and columns based on activity type
    switch (activityType) {
      case 'tending':
        tableName = 'tendings';
        columns = ['id', 'plant_id', 'datetime', 'type', 'summary', 'additional_info'];
        break;
      case 'watering':
        tableName = 'waterings';
        columns = ['id', 'plant_id', 'datetime', 'source', 'progress_description', 'additional_info'];
        break;
      case 'sunlight':
        tableName = 'sunlight';
        columns = ['id', 'plant_id', 'datetime', 'topic', 'additional_info'];
        break;
      case 'fruit':
        tableName = 'fruits';
        columns = ['id', 'plant_id', 'datetime', 'description', 'additional_info'];
        break;
      default:
        throw new Error(`Unsupported activity type: ${activityType}`);
    }
    
    // Build records for bulk insert
    for (const plantId of plantIds) {
      const id = uuidv4();
      let record: any[];
      
      switch (activityType) {
        case 'tending':
          record = [
            id,
            plantId,
            timestamp,
            activityData.type,
            activityData.summary || null,
            activityData.additional_info || null
          ];
          break;
        case 'watering':
          record = [
            id,
            plantId,
            timestamp,
            activityData.source,
            activityData.progress_description || null,
            activityData.additional_info || null
          ];
          break;
        case 'sunlight':
          record = [
            id,
            plantId,
            timestamp,
            activityData.topic,
            activityData.additional_info || null
          ];
          break;
        case 'fruit':
          record = [
            id,
            plantId,
            timestamp,
            activityData.description,
            activityData.additional_info || null
          ];
          break;
        default:
          throw new Error(`Unsupported activity type: ${activityType}`);
      }
      
      recordsToInsert.push(record);
    }
    
    // Construct single INSERT statement with multiple VALUES
    const columnsStr = columns.join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const valuesClause = recordsToInsert.map(() => `(${placeholders})`).join(', ');
    const sql = `INSERT INTO ${tableName} (${columnsStr}) VALUES ${valuesClause}`;
    
    // Flatten all values for the query
    const flattenedValues = recordsToInsert.flat();
    
    // Execute single bulk insert
    alasql(sql, flattenedValues);
    
    // Update plant interactions and care schedules for tending and watering
    if (activityType === 'tending' || activityType === 'watering') {
      for (const plantId of plantIds) {
        await this.updatePlantInteraction(plantId, timestamp);
        await this.updatePlantCare(plantId, timestamp);
      }
    }
    
    await this.saveToStorage();
  }

  static async getPruningsForPlant(plantId: string): Promise<Pruning[]> {
    return alasql('SELECT * FROM prunings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  // Scheduled events operations
  static async addScheduledEvent(event: Omit<ScheduledEvent, 'id'>): Promise<ScheduledEvent> {
    const newEvent: ScheduledEvent = {
      id: uuidv4(),
      ...event
    };
    
    alasql('INSERT INTO scheduled_events VALUES (?, ?, ?, ?, ?, ?)', [
      newEvent.id,
      newEvent.plant_id,
      newEvent.event_type,
      newEvent.scheduled_date,
      newEvent.description || null,
      newEvent.additional_info || null
    ]);
    
    await this.saveToStorage();
    return newEvent;
  }

  static async getScheduledEventsForPlant(plantId: string): Promise<ScheduledEvent[]> {
    return alasql('SELECT * FROM scheduled_events WHERE plant_id = ? ORDER BY scheduled_date ASC', [plantId]);
  }

  static async deleteScheduledEvent(eventId: string): Promise<void> {
    alasql('DELETE FROM scheduled_events WHERE id = ?', [eventId]);
    await this.saveToStorage();
  }

  // Companion operations
  static async addCompanion(companion: Omit<Companion, 'id'>): Promise<Companion> {
    const newCompanion: Companion = {
      id: uuidv4(),
      ...companion
    };
    
    alasql('INSERT INTO companions VALUES (?, ?, ?, ?, ?)', [
      newCompanion.id,
      newCompanion.plant_a_id,
      newCompanion.relationship_descriptor,
      newCompanion.plant_b_id,
      newCompanion.additional_info || null
    ]);
    
    await this.saveToStorage();
    return newCompanion;
  }

  static async getCompanionsForPlant(plantId: string): Promise<Companion[]> {
    return alasql('SELECT * FROM companions WHERE plant_a_id = ? OR plant_b_id = ?', [plantId, plantId]);
  }

  static async deleteCompanion(companionId: string): Promise<void> {
    alasql('DELETE FROM companions WHERE id = ?', [companionId]);
    await this.saveToStorage();
  }

  static async deleteTending(tendingId: string): Promise<void> {
    alasql('DELETE FROM tendings WHERE id = ?', [tendingId]);
    await this.saveToStorage();
  }

  static async deleteWatering(wateringId: string): Promise<void> {
    alasql('DELETE FROM waterings WHERE id = ?', [wateringId]);
    await this.saveToStorage();
  }

  static async deleteSunlight(sunlightId: string): Promise<void> {
    alasql('DELETE FROM sunlight WHERE id = ?', [sunlightId]);
    await this.saveToStorage();
  }

  static async deleteFruit(fruitId: string): Promise<void> {
    alasql('DELETE FROM fruits WHERE id = ?', [fruitId]);
    await this.saveToStorage();
  }

  static async deletePruning(pruningId: string): Promise<void> {
    alasql('DELETE FROM prunings WHERE id = ?', [pruningId]);
    await this.saveToStorage();
  }

  static async updateTending(id: string, updates: Partial<Omit<Tending, 'id' | 'plant_id' | 'datetime'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE tendings SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async updateWatering(id: string, updates: Partial<Omit<Watering, 'id' | 'plant_id' | 'datetime'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE waterings SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async updateSunlight(id: string, updates: Partial<Omit<Sunlight, 'id' | 'plant_id' | 'datetime'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE sunlight SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async updateFruit(id: string, updates: Partial<Omit<Fruit, 'id' | 'plant_id' | 'datetime'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE fruits SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async updatePruning(id: string, updates: Partial<Omit<Pruning, 'id' | 'plant_id' | 'datetime'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE prunings SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async updateCompanion(id: string, updates: Partial<Omit<Companion, 'id' | 'plant_a_id'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE companions SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  // Get latest activity timestamps for urgency calculation
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

  // Get all activities for a plant (for timeline)
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

  /**
   * Clear all data from the database
   */
  static async clearAllData(): Promise<void> {
    try {
      // Clear all tables
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

      await this.saveToStorage();
      clearPendingChanges();
      console.log('All database data cleared');
    } catch (error) {
      console.error('Failed to clear database data:', error);
      throw error;
    }
  }

  // Bud operations
  static async addBud(bud: Omit<Bud, 'id'>): Promise<Bud> {
    const newBud: Bud = { id: uuidv4(), ...bud };
    alasql('INSERT INTO buds VALUES (?, ?, ?, ?)', [
      newBud.id, newBud.plant_id, newBud.text, newBud.created_at
    ]);
    await this.saveToStorage();
    return newBud;
  }

  static async getBudsForPlant(plantId: string): Promise<Bud[]> {
    return alasql('SELECT * FROM buds WHERE plant_id = ? ORDER BY created_at ASC', [plantId]);
  }

  static async updateBud(id: string, updates: Partial<Omit<Bud, 'id' | 'plant_id' | 'created_at'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE buds SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async deleteBud(budId: string): Promise<void> {
    alasql('DELETE FROM buds WHERE id = ?', [budId]);
    await this.saveToStorage();
  }

  // Notching operations
  static async addNotching(notching: Omit<Notching, 'id'>): Promise<Notching> {
    const newNotching: Notching = { id: uuidv4(), ...notching };
    alasql('INSERT INTO notchings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      newNotching.id,
      newNotching.plant_id,
      newNotching.datetime,
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
    return newNotching;
  }

  static async getNotchingsForPlant(plantId: string): Promise<Notching[]> {
    return alasql('SELECT * FROM notchings WHERE plant_id = ? ORDER BY datetime DESC', [plantId]);
  }

  static async updateNotching(id: string, updates: Partial<Omit<Notching, 'id' | 'plant_id'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE notchings SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async deleteNotching(notchingId: string): Promise<void> {
    alasql('DELETE FROM notchings WHERE id = ?', [notchingId]);
    await this.saveToStorage();
  }

  // Capability operations
  static async addCapability(capability: Omit<Capability, 'id'>): Promise<Capability> {
    const newCapability: Capability = { id: uuidv4(), ...capability };
    alasql('INSERT INTO capabilities VALUES (?, ?, ?, ?)', [
      newCapability.id, newCapability.plant_id, newCapability.text, newCapability.created_at
    ]);
    await this.saveToStorage();
    return newCapability;
  }

  static async getCapabilitiesForPlant(plantId: string): Promise<Capability[]> {
    return alasql('SELECT * FROM capabilities WHERE plant_id = ? ORDER BY created_at ASC', [plantId]);
  }

  static async updateCapability(id: string, updates: Partial<Omit<Capability, 'id' | 'plant_id' | 'created_at'>>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    alasql(`UPDATE capabilities SET ${fields} WHERE id = ?`, [...values, id]);
    await this.saveToStorage();
  }

  static async deleteCapability(capabilityId: string): Promise<void> {
    alasql('DELETE FROM capabilities WHERE id = ?', [capabilityId]);
    await this.saveToStorage();
  }

  // Backup operations
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
    // Clear existing data
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

    // Restore data
    if (backup.plants) {
      backup.plants.forEach((plant: Plant) => {
        alasql('INSERT INTO plants VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          plant.id,
          plant.name,
          plant.email || null,
          plant.phone || null,
          plant.last_interaction,
          plant.created_at,
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
        alasql('INSERT INTO tendings VALUES (?, ?, ?, ?, ?, ?)', [
          tending.id, tending.plant_id, tending.datetime, tending.type, tending.summary, tending.additional_info || null
        ]);
      });
    }

    if (backup.waterings) {
      backup.waterings.forEach((watering: Watering) => {
        alasql('INSERT INTO waterings VALUES (?, ?, ?, ?, ?, ?)', [
          watering.id, watering.plant_id, watering.datetime, watering.source, watering.progress_description, watering.additional_info || null
        ]);
      });
    }

    if (backup.sunlight) {
      backup.sunlight.forEach((sunlight: Sunlight) => {
        alasql('INSERT INTO sunlight VALUES (?, ?, ?, ?, ?)', [
          sunlight.id, sunlight.plant_id, sunlight.datetime, sunlight.topic, sunlight.additional_info || null
        ]);
      });
    }

    if (backup.fruits) {
      backup.fruits.forEach((fruit: Fruit) => {
        alasql('INSERT INTO fruits VALUES (?, ?, ?, ?, ?)', [
          fruit.id, fruit.plant_id, fruit.datetime, fruit.description, fruit.additional_info || null
        ]);
      });
    }

    if (backup.prunings) {
      backup.prunings.forEach((pruning: Pruning) => {
        alasql('INSERT INTO prunings VALUES (?, ?, ?, ?, ?, ?)', [
          pruning.id, pruning.plant_id, pruning.datetime, pruning.difficulty, pruning.description, pruning.additional_info || null
        ]);
      });
    }

    if (backup.companions) {
      backup.companions.forEach((companion: Companion) => {
        alasql('INSERT INTO companions VALUES (?, ?, ?, ?, ?)', [
          companion.id, companion.plant_a_id, companion.relationship_descriptor, companion.plant_b_id, companion.additional_info || null
        ]);
      });
    }

    if (backup.scheduled_events) {
      backup.scheduled_events.forEach((event: ScheduledEvent) => {
        alasql('INSERT INTO scheduled_events VALUES (?, ?, ?, ?, ?, ?)', [
          event.id, event.plant_id, event.event_type, event.scheduled_date, event.description, event.additional_info || null
        ]);
      });
    }

    if (backup.plots) {
      backup.plots.forEach((plot: Plot) => {
        alasql('INSERT INTO plots VALUES (?, ?, ?, ?, ?)', [
          plot.id, plot.name, plot.description, plot.created_at, plot.additional_info || null
        ]);
      });
    }

    if (backup.plot_memberships) {
      backup.plot_memberships.forEach((membership: PlotMembership) => {
        alasql('INSERT INTO plot_memberships VALUES (?, ?, ?)', [
          membership.id, membership.plot_id, membership.plant_id
        ]);
      });
    }

    if (backup.buds) {
      backup.buds.forEach((bud: Bud) => {
        alasql('INSERT INTO buds VALUES (?, ?, ?, ?)', [
          bud.id, bud.plant_id, bud.text, bud.created_at
        ]);
      });
    }

    if (backup.notchings) {
      backup.notchings.forEach((n: Notching) => {
        alasql('INSERT INTO notchings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          n.id, n.plant_id, n.datetime, n.book, n.start_unit, n.start_section,
          n.end_unit, n.end_section, n.sections_studied, n.progress_description || null, n.additional_info || null
        ]);
      });
    }

    if (backup.capabilities) {
      backup.capabilities.forEach((cap: Capability) => {
        alasql('INSERT INTO capabilities VALUES (?, ?, ?, ?)', [
          cap.id, cap.plant_id, cap.text, cap.created_at
        ]);
      });
    }

    await this.saveToStorage();
    clearPendingChanges();
    console.log('Backup restoration complete');
  }

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

    if (!privateKey || !publicKey || !userId) {
      return null;
    }

    return {
      id: userId,
      signature_private_key: privateKey,
      signature_public_key: publicKey
    };
  }
}