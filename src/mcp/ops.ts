import { DEFAULTS, type Settings } from '../state';
import type { Shape } from '../presets';
import { insertPoint, movePoint, removePoint } from '../core/edit';
import { foldsAt, profileError, sampleProfile, type ProfilePoint } from '../core/profile';

export type Op =
  | { op: 'settings'; patch: Record<string, unknown> }
  | { op: 'setProfile'; profile: ProfilePoint[] }
  | { op: 'insertPoint'; z: number; d: number }
  | { op: 'movePoint'; index: number; z: number; d: number }
  | { op: 'removePoint'; index: number }
  | { op: 'setCorner'; index: number; sharp: boolean }
  | { op: 'pickShape'; name: string };

export class OpError extends Error {}

// Fields whose strings must be one of a few values. The type check alone would let a typo through.
const ENUMS: Record<string, string[]> = {
  clayUnit: ['lb', 'kg'], units: ['mm', 'cm', 'in'], scaleNumbers: ['none', 'wet', 'wet-fired', 'wet-dry-fired'],
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// closest() finds the known name a typo most likely meant, within 3 edits.
function closest(word: string, names: string[]): string | undefined {
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const best = names.map((n) => [n, dist(word.toLowerCase(), n.toLowerCase())] as const).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= 3 ? best[0] : undefined;
}

// checkProfile() runs the guards that drawing keeps to, and throws the first one a profile breaks.
// Points must rise, stay minGap apart and minD wide, and the curve through them must not fold back down.
function checkProfile(p: unknown, s: Settings): ProfilePoint[] {
  if (!Array.isArray(p) || p.some((q) => !isObject(q) || typeof q.z !== 'number' || typeof q.d !== 'number' || ('sharp' in q && typeof q.sharp !== 'boolean')))
    throw new OpError('A profile is a list of points like {"z": 0, "d": 80}, with an optional "sharp": true for a corner.');
  const pts = p as ProfilePoint[], err = profileError(pts);
  if (err) throw new OpError(err);
  for (let i = 1; i < pts.length; i++) if (pts[i].z - pts[i - 1].z < s.minGap)
    throw new OpError(`Points ${i} and ${i + 1} are ${(pts[i].z - pts[i - 1].z).toFixed(1)} mm apart, closer than the ${s.minGap} mm minimum gap.`);
  const thin = pts.findIndex((q) => q.d < s.minD);
  if (thin >= 0) throw new OpError(`Point ${thin + 1}'s Ø ${pts[thin].d} mm is below the ${s.minD} mm smallest Ø.`);
  if (foldsAt(sampleProfile(pts)) > 0) throw new OpError('The curve through these points folds back down on itself. Move the points further apart, or make one a corner.');
  return pts;
}

// merge() checks a settings patch against the defaults' types and folds it in. The profile goes through checkProfile().
function merge(s: Settings, patch: Record<string, unknown>): Settings {
  if (!isObject(patch)) throw new OpError('The patch must be an object.');
  const out: Record<string, unknown> = { ...s };
  for (const [k, v] of Object.entries(patch)) {
    const shape = (DEFAULTS as unknown as Record<string, unknown>)[k];
    if (!(k in DEFAULTS)) {
      const guess = closest(k, Object.keys(DEFAULTS));
      throw new OpError(`Unknown setting: ${k}.${guess ? ` Did you mean ${guess}?` : ''}`);
    }
    if (k === 'profile') continue;
    if (typeof shape === 'number' && !(typeof v === 'number' && Number.isFinite(v))) throw new OpError(`${k} must be a number.`);
    if (typeof v !== typeof shape) throw new OpError(`${k} must be a ${typeof shape}.`);
    if (ENUMS[k] && !ENUMS[k].includes(v as string)) throw new OpError(`${k} must be one of ${ENUMS[k].join(', ')}.`);
    out[k] = v;
  }
  const next = out as unknown as Settings;
  return 'profile' in patch ? { ...next, profile: checkProfile(patch.profile, next) } : next;
}

const at = (s: Settings, i: number) => {
  if (!Number.isInteger(i) || i < 0 || i >= s.profile.length) throw new OpError(`There's no point ${i}. Points run from 0 (the base) to ${s.profile.length - 1} (the rim).`);
  return i;
};

// applyOps() applies a batch of changes to a copy of the settings. It never touches the settings it was given,
// so when any change in the batch is bad, it throws and the rib stays exactly as it was.
export function applyOps(start: Settings, ops: Op[], ctx: { shapes: Shape[] }): Settings {
  let s = start;
  for (const o of ops) {
    switch (o.op) {
      case 'settings': s = merge(s, o.patch); break;
      case 'setProfile': s = { ...s, profile: checkProfile(o.profile, s) }; break;
      case 'insertPoint': {
        const added = insertPoint(s.profile, o.z, o.d, s), rim = s.profile[s.profile.length - 1].z;
        if (!added) throw new OpError(o.z >= rim ? 'No point added: it sits above the rim. Move the rim point up instead.'
          : o.z <= s.profile[0].z ? 'No point added: the base stays on the wheel head, so a new point has to go above it.'
            : s.profile.some((q) => Math.abs(q.z - o.z) < s.minGap) ? `No point added: that height is within ${s.minGap} mm of another point.`
              : 'No point added there, because the wall would fold back on itself. Try a spot closer to the curve.');
        s = { ...s, profile: added.profile };
        break;
      }
      case 'movePoint': s = { ...s, profile: movePoint(s.profile, at(s, o.index), o.z, o.d, s) }; break;
      case 'removePoint': {
        const i = at(s, o.index);
        if (i === 0 || s.profile.length <= 2) throw new OpError('The base stays, and so do the last two points, so the pot always has a base and a rim.');
        s = { ...s, profile: removePoint(s.profile, i) };
        break;
      }
      case 'setCorner': {
        const i = at(s, o.index);
        if (i === 0 || i === s.profile.length - 1) throw new OpError('Only a point between the base and the rim can be a corner.');
        s = { ...s, profile: s.profile.map((q, k) => (k === i ? { ...q, sharp: o.sharp || undefined } : q)) };
        break;
      }
      case 'pickShape': {
        const shape = ctx.shapes.find((x) => x.name === o.name);
        if (!shape) throw new OpError(`No shape is called ${o.name}. Call list_shapes to see them.`);
        const { name, profile, body, above, mirror } = shape;
        s = { ...s, name, profile, body, above, mirror };
        break;
      }
      default: throw new OpError(`Unknown change: ${(o as { op: string }).op}.`);
    }
  }
  return s;
}
