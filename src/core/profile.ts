/**
 * One measurement of the pot's outside, from the base up. z is the height above the wheel head and
 * d the outside diameter there, both in mm. A sharp point is a corner, such as an angled pot's
 * carination, and the curve runs into it in straight lines.
 */
export interface ProfilePoint { z: number; d: number; sharp?: boolean }

/** A point on the sampled curve. r is the radius and z the height above the base, in mm. */
export interface CurvePoint { r: number; z: number }

/** Explains what is wrong with a profile, or returns null when it can be drawn. */
export function profileError(p: ProfilePoint[]): string | null {
  if (p.length < 2) return 'The pot needs at least a base and a rim measurement.';
  if (p.some((q) => !(q.d > 0) || !Number.isFinite(q.z))) return 'Every diameter must be above 0 mm.';
  for (let i = 1; i < p.length; i++) if (!(p[i].z > p[i - 1].z)) return 'Each measurement must sit higher than the one below it.';
  return null;
}

export const widestD = (p: ProfilePoint[]) => Math.max(...p.map((q) => q.d));

/** Stretches the heights by kz and the diameters by kd. */
export const scaleProfile = (p: ProfilePoint[], kz: number, kd: number): ProfilePoint[] =>
  p.map((q) => ({ ...q, z: q.z * kz, d: q.d * kd }));

// sampleProfile() draws a smooth curve through the measurements, with a point about every step mm.
// It uses a centripetal Catmull-Rom spline, which passes through every point and never loops.
// A sharp point splits the curve, and a run of two points is a straight line.
export function sampleProfile(p: ProfilePoint[], step = 1): CurvePoint[] {
  const pts = p.map((q) => ({ r: q.d / 2, z: q.z - p[0].z }));
  const out: CurvePoint[] = [pts[0]];
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (i < pts.length - 1 && !p[i].sharp) continue;
    const run = pts.slice(start, i + 1);
    for (let k = 0; k < run.length - 1; k++) {
      const a = run[k], b = run[k + 1];
      // A run's ends have no neighbour, so a mirrored point stands in and keeps the end tangent straight.
      const before = run[k - 1] ?? { r: 2 * a.r - b.r, z: 2 * a.z - b.z };
      const after = run[k + 2] ?? { r: 2 * b.r - a.r, z: 2 * b.z - a.z };
      const n = Math.max(1, Math.ceil(Math.hypot(b.r - a.r, b.z - a.z) / step));
      for (let j = 1; j < n; j++) out.push(catmullRom(before, a, b, after, j / n));
      out.push(b);
    }
    start = i;
  }
  return out;
}

// catmullRom() is the Barry-Goldman form of the centripetal spline from p1 to p2, at t from 0 to 1.
function catmullRom(p0: CurvePoint, p1: CurvePoint, p2: CurvePoint, p3: CurvePoint, t: number): CurvePoint {
  const knot = (a: CurvePoint, b: CurvePoint) => Math.max(1e-6, Math.sqrt(Math.hypot(b.r - a.r, b.z - a.z)));
  const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3), u = t1 + t * (t2 - t1);
  const lerp = (a: CurvePoint, b: CurvePoint, ta: number, tb: number) => {
    const w = (u - ta) / (tb - ta);
    return { r: a.r + (b.r - a.r) * w, z: a.z + (b.z - a.z) * w };
  };
  const a1 = lerp(p0, p1, 0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  return lerp(lerp(a1, a2, 0, t2), lerp(a2, a3, t1, t3), t1, t2);
}
