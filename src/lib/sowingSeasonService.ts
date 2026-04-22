export interface SowingWindow {
  label: string;
  month: number;
  day: number;
  durationDays: number;
}

export interface SowingSeasonStatus {
  state: 'dormant' | 'approaching' | 'active';
  daysUntilStart: number;
  daysRemaining: number;
  window: SowingWindow;
}

export interface SowingWindowOverlap {
  label: string;
  windowStart: Date;
  windowEnd: Date;
  overlapStart: Date;
  overlapEnd: Date;
  overlapDays: number;
  seedsPlanted: number;
}

const SOWING_WINDOWS: SowingWindow[] = [
  { label: 'Spring', month: 2, day: 21, durationDays: 14 },
  { label: 'Early Summer', month: 5, day: 21, durationDays: 14 },
  { label: 'Autumn', month: 8, day: 21, durationDays: 14 },
  { label: 'Winter', month: 11, day: 21, durationDays: 14 },
];

function getWindowStartMs(year: number, w: SowingWindow): number {
  return new Date(year, w.month, w.day, 0, 0, 0, 0).getTime();
}

function getWindowEndMs(year: number, w: SowingWindow): number {
  const start = new Date(year, w.month, w.day, 0, 0, 0, 0);
  start.setDate(start.getDate() + w.durationDays);
  return start.getTime();
}

export function getSowingSeasonStatus(now: Date = new Date()): SowingSeasonStatus {
  const nowMs = now.getTime();
  const year = now.getFullYear();

  const candidates: { window: SowingWindow; startMs: number; endMs: number }[] = [];

  for (const y of [year - 1, year, year + 1]) {
    for (const w of SOWING_WINDOWS) {
      candidates.push({
        window: w,
        startMs: getWindowStartMs(y, w),
        endMs: getWindowEndMs(y, w),
      });
    }
  }

  candidates.sort((a, b) => a.startMs - b.startMs);

  const active = candidates.find(c => nowMs >= c.startMs && nowMs < c.endMs);
  if (active) {
    const daysRemaining = Math.ceil((active.endMs - nowMs) / (1000 * 60 * 60 * 24));
    return {
      state: 'active',
      daysUntilStart: 0,
      daysRemaining,
      window: active.window,
    };
  }

  const upcoming = candidates.find(c => c.startMs > nowMs);
  if (upcoming) {
    const daysUntilStart = Math.ceil((upcoming.startMs - nowMs) / (1000 * 60 * 60 * 24));
    if (daysUntilStart <= 14) {
      return {
        state: 'approaching',
        daysUntilStart,
        daysRemaining: upcoming.window.durationDays,
        window: upcoming.window,
      };
    }
  }

  return {
    state: 'dormant',
    daysUntilStart: upcoming ? Math.ceil((upcoming.startMs - nowMs) / (1000 * 60 * 60 * 24)) : 0,
    daysRemaining: 0,
    window: upcoming ? upcoming.window : SOWING_WINDOWS[0],
  };
}

export function getSowingWindowOverlaps(
  from: Date,
  to: Date,
  plantCreatedAts: number[]
): SowingWindowOverlap[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const fromYear = from.getFullYear();
  const toYear = to.getFullYear();
  const results: SowingWindowOverlap[] = [];

  for (let y = fromYear - 1; y <= toYear + 1; y++) {
    for (const w of SOWING_WINDOWS) {
      const wStartMs = getWindowStartMs(y, w);
      const wEndMs = getWindowEndMs(y, w);

      const overlapStart = Math.max(fromMs, wStartMs);
      const overlapEnd = Math.min(toMs, wEndMs);

      if (overlapEnd <= overlapStart) continue;

      const overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));
      const seedsPlanted = plantCreatedAts.filter(
        ts => ts >= overlapStart && ts < overlapEnd
      ).length;

      results.push({
        label: w.label,
        windowStart: new Date(wStartMs),
        windowEnd: new Date(wEndMs),
        overlapStart: new Date(overlapStart),
        overlapEnd: new Date(overlapEnd),
        overlapDays,
        seedsPlanted,
      });
    }
  }

  results.sort((a, b) => a.overlapStart.getTime() - b.overlapStart.getTime());
  return results;
}
