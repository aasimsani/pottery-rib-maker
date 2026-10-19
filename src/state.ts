import { useEffect, useState } from 'react';
import type { ProfilePoint } from './core/profile';

export interface Settings {
  /** The pot the rib throws, after firing, from the base up. */
  name: string; profile: ProfilePoint[];
  /** How much the clay shrinks from thrown to fired, in %. The rib is sized for the wet pot. */
  shrink: number;
  /** The rib's width at its narrowest, in mm, and how far it reaches above the rim. */
  body: number; above: number;
  /** Shapes the back edge like the working edge, so both long edges throw the pot. */
  mirror: boolean;
  thick: number;
  hole: boolean; holeD: number;
  // Height scale
  units: 'mm' | 'cm' | 'in';
  /** 'thrown' numbers the rib like a ruler. 'fired' numbers the heights the pot keeps after firing. */
  labelAs: 'thrown' | 'fired';
  ticks: boolean; numbers: boolean;
  /** More heights to mark, in mm, such as where a handle goes. */
  extraMarks: string;
  /** How far the marks stand up from the rib, in mm. */
  emboss: number;
  // Printer (Bambu Lab P2S defaults)
  bedW: number; bedD: number;
}

export const DEFAULTS: Settings = {
  name: 'Rounded-base mug', profile: [{ z: 0, d: 62 }, { z: 4, d: 72 }, { z: 14, d: 80 }, { z: 90, d: 80 }],
  shrink: 12, body: 45, above: 10, mirror: false, thick: 4.5, hole: true, holeD: 18,
  units: 'cm', labelAs: 'thrown', ticks: true, numbers: true, extraMarks: '', emboss: 0.6,
  bedW: 256, bedD: 256,
};

// usePersistent() is useState backed by localStorage. Storage can be missing or full
// (private windows), so failures fall back to in-memory state.
export function usePersistent<T>(key: string, initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch { /* fall through to the initial value */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [key, value]);
  return [value, setValue];
}
