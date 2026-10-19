import { foldsAt, sampleProfile, type ProfilePoint } from './profile';

/**
 * The limits that drawing keeps to. minGap is the least height between two neighbouring points,
 * minD the smallest diameter, and snap the step that every move rounds to, all in mm.
 */
export interface Guards { minGap: number; minD: number; snap: number }

export const GUARDS: Guards = { minGap: 2, minD: 20, snap: 0.5 };

const folds = (p: ProfilePoint[]) => foldsAt(sampleProfile(p)) > 0;
const snapTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);

// movePoint() moves point i towards (z, d) as far as the guards allow. The base stays on the wheel
// head, and every other point stays minGap clear of the points above and below it, so the heights
// keep their order. When the full move would still fold the curve back, the point stops at the
// furthest spot along the way that doesn't, so a drag slides up to the limit instead of freezing.
export function movePoint(p: ProfilePoint[], i: number, z: number, d: number, g: Guards): ProfilePoint[] {
  const lo = i === 0 ? p[0].z : p[i - 1].z + g.minGap, hi = i === 0 ? p[0].z : i < p.length - 1 ? p[i + 1].z - g.minGap : Infinity;
  const nz = Math.min(hi, Math.max(lo, snapTo(z, g.snap))), nd = Math.max(g.minD, snapTo(d, g.snap));
  const at = (t: number) => p.map((q, k) => (k === i ? { ...q, z: q.z + (nz - q.z) * t, d: q.d + (nd - q.d) * t } : q));
  if (!folds(at(1))) return at(1);
  if (folds(p)) return p;
  // ponytail: 12 halvings find the limit to 1/4096 of the move, which is finer than any snap step.
  let ok = 0, bad = 1;
  for (let n = 0; n < 12; n++) { const t = (ok + bad) / 2; if (folds(at(t))) bad = t; else ok = t; }
  return at(ok);
}

// insertPoint() adds a point between the base and the rim, in height order. It returns null when
// the point sits outside that range, closer than minGap to another point, or where it would fold the curve.
export function insertPoint(p: ProfilePoint[], z: number, d: number, g: Guards): { profile: ProfilePoint[]; index: number } | null {
  const nz = snapTo(z, g.snap);
  if (nz <= p[0].z || nz >= p[p.length - 1].z || p.some((q) => Math.abs(q.z - nz) < g.minGap)) return null;
  const index = p.findIndex((q) => q.z > nz);
  const profile = [...p.slice(0, index), { z: nz, d: Math.max(g.minD, snapTo(d, g.snap)) }, ...p.slice(index)];
  return folds(profile) ? null : { profile, index };
}

/** Removes point i. The base and the last two points stay, so the pot always has a base and a rim. */
export const removePoint = (p: ProfilePoint[], i: number): ProfilePoint[] => (i === 0 || p.length <= 2 ? p : p.filter((_, k) => k !== i));
