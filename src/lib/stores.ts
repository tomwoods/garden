import { writable } from 'svelte/store';
import type { Plant } from './database';

export interface User {
  userId: string;
  privateKey: string;
  publicKey: string;
}

export interface GardenState {
  plants: Plant[];
  isLoading: boolean;
}

export type SyncState = 'idle' | 'syncing' | 'dirty' | 'error';

// Create stores using a React-compatible pattern
export const createStore = <T>(initialValue: T) => {
  const { subscribe, set, update } = writable(initialValue);
  
  return {
    subscribe,
    set,
    update,
    get: () => {
      let value: T;
      subscribe((v) => value = v)();
      return value!;
    }
  };
};

export const userStore = createStore<User | null>(null);
export const gardenStore = createStore<GardenState>({ plants: [], isLoading: true });
export const syncStateStore = createStore<SyncState>('idle');