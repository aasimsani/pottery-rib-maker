import { useEffect, useState } from 'react';
import type { ProfilePoint } from './core/profile';
import { GUARDS } from './core/edit';

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
  /** How far in the edge bevel reaches on the top face, in mm, and how steep it is, in degrees from the face. 0 mm gives a square edge. */
  bevelWidth: number; bevelAngle: number;
  hole: boolean; holeD: number;
  /** The trim line's height in mm, where trimming stops, or 0 for no trimming. Below it, the rib leaves a heel of clay whose outside runs down at heel° from vertical. */
  trimLine: number; heel: number;
  /** The thrown pot's wall and floor thickness, in mm, for the clay estimate and the 3D pot. */
  wall: number;
  /** The clay you throw with, or 0 to skip the clay check. */
  clay: number; clayUnit: 'lb' | 'kg';
  // Height scale
  units: 'mm' | 'cm' | 'in';
  /** Puts the ticks and numbers on the rib. The ticks always count wet height, like a ruler. */
  scale: boolean;
  /** Which heights each long tick's numbers give, left to right. */
  scaleNumbers: 'none' | 'wet' | 'wet-fired' | 'wet-dry-fired';
  /** How much the clay shrinks from wet to bone dry, in %. It is part of the total shrinkage. */
  dryShrink: number;
  rimLine: boolean;
  /** More fired heights to mark, in mm, such as where a handle goes. */
  extraMarks: string;
  /** How far the marks stand up from the rib, in mm. */
  emboss: number;
  /** Save the marks as a separate part of the rib, so the slicer can print them in a second filament. */
  splitMarks: boolean;
  /** Drawing limits: the least height between points, the smallest Ø, and the snap step, in mm. */
  minGap: number; minD: number; snap: number;
  // Printer (Bambu Lab P2S defaults)
  bedW: number; bedD: number;
}

export const DEFAULTS: Settings = {
  name: 'Rounded-base mug', profile: [{ z: 0, d: 62 }, { z: 4, d: 72 }, { z: 14, d: 80 }, { z: 90, d: 80 }],
  shrink: 12, body: 60, above: 10, mirror: false, thick: 4.5, bevelWidth: 3.75, bevelAngle: 39, hole: true, holeD: 18,
  trimLine: 25, heel: 15, wall: 6, clay: 0, clayUnit: 'lb',
  units: 'cm', scale: true, scaleNumbers: 'wet-fired', dryShrink: 6, rimLine: true, extraMarks: '', emboss: 0.6, splitMarks: true,
  ...GUARDS,
  bedW: 256, bedD: 256,
};

// All three pottery apps run on aasimsani.net and share one localStorage, so each app keeps its keys under its own
// prefix. Nothing is shared, because the rib maker saves its own kind of shape.
const APP = 'rib.';
const SHARED = new Set<string>([]);
export const storageKey = (key: string) => (SHARED.has(key) ? key : APP + key);

// settingsFromLegacy() keeps this app's fields from settings saved under the bare "settings" key. The stencil maker
// saved its settings under that key too, and each app wrote the other's fields back. When the object holds the
// stencil maker's fields, it also drops thick and above, because both apps use those names for different things.
const OWN = new Set([...Object.keys(DEFAULTS)]);
export function settingsFromLegacy(saved: Record<string, unknown>): Record<string, unknown> {
  const mixed = ['piece', 'coverage', 'bandFrom'].some((k) => k in saved);
  return Object.fromEntries(Object.entries(saved).filter(([k]) => OWN.has(k) && !(mixed && (k === 'thick' || k === 'above'))));
}
const identity = (v: unknown) => v;
const LEGACY: Record<string, (v: unknown) => unknown> = {
  settings: (v) => (v && typeof v === 'object' ? settingsFromLegacy(v as Record<string, unknown>) : {}),
  shapes: identity,
  keepProportions: identity,
};

// usePersistent() is useState backed by localStorage. Storage can be missing or full
// (private windows, large uploaded images), so failures fall back to in-memory state.
// The first load reads what an older version saved under the bare key, through LEGACY, and saves it under the prefix.
export function usePersistent<T>(key: string, initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const full = storageKey(key);
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(full);
      if (raw) return JSON.parse(raw) as T;
      const old = full !== key && LEGACY[key] ? localStorage.getItem(key) : null;
      if (old) return LEGACY[key](JSON.parse(old)) as T;
    } catch { /* fall through to the initial value */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    try { localStorage.setItem(full, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [full, value]);
  return [value, setValue];
}
