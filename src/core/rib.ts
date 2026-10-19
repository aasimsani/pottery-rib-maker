import { profileError, sampleProfile, type CurvePoint } from './profile';
import type { Settings } from '../state';

export interface Check { id: string; level: 'error' | 'warn' | 'note'; message: string }
/** A rectangle on the rib, as [x0, y0, x1, y1] in mm. */
export type Rect = [number, number, number, number];
/** One raised mark. y is its height on the rib, in mm above the wheel head. */
export interface Mark { kind: 'minor' | 'major' | 'line' | 'label'; y: number; rects: Rect[] }

export interface Rib {
  /** The rib's outline in mm. x runs from the working edge to the back, and y up from the wheel head. */
  outline: [number, number][];
  hole: { x: number; y: number; r: number } | null;
  marks: Mark[];
  /** The thrown pot's outside, which the working edge follows. */
  pot: CurvePoint[];
  /** The pot's narrowest radius. A point at radius r on the pot sits at x = r - rmin on the rib. */
  rmin: number;
  width: number; height: number; rim: number; narrowest: number;
  /** The rotation that fits the rib on the bed, in degrees, or null when it does not fit. */
  rot: number | null;
  checks: Check[];
}

/** The fit check keeps this many mm clear of each bed edge. */
export const BED_MARGIN = 3;
const STROKE = 0.8; // two nozzle widths, the thinnest line that prints solid
const INSET = 0.8; // marks stop this far short of the rib's edge

// edgeAt() reads an edge's x at height y, between the edge points on either side of it.
function edgeAt(edge: [number, number][], y: number): number {
  if (y <= edge[0][1]) return edge[0][0];
  for (let i = 1; i < edge.length; i++) {
    const [x0, y0] = edge[i - 1], [x1, y1] = edge[i];
    if (y <= y1) return y1 === y0 ? Math.max(x0, x1) : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return edge[edge.length - 1][0];
}

// buildRib() turns the pot into the rib that throws it. The working edge is the thrown pot's outside,
// and the rib runs from there to a straight back, or to a mirrored second working edge.
export function buildRib(s: Settings): Rib {
  const empty = { outline: [], hole: null, marks: [], pot: [], rmin: 0, width: 0, height: 0, rim: 0, narrowest: 0, rot: null };
  const err = profileError(s.profile);
  if (err) return { ...empty, checks: [{ id: 'profile', level: 'error', message: `${err} Check the pot measurements.` }] };

  const k = 1 / (1 - s.shrink / 100);
  const pot = sampleProfile(s.profile).map((p) => ({ r: p.r * k, z: p.z * k }));
  const rmin = Math.min(...pot.map((p) => p.r)), maxLeft = Math.max(...pot.map((p) => p.r)) - rmin;
  const rim = pot[pot.length - 1].z, top = rim + s.above;
  const W = s.mirror ? 2 * maxLeft + s.body : maxLeft + s.body;
  const leftEdge: [number, number][] = pot.map((p) => [p.r - rmin, p.z]);
  if (s.above > 0) leftEdge.push([leftEdge[leftEdge.length - 1][0], top]);
  const rightEdge: [number, number][] = s.mirror ? leftEdge.map(([x, y]) => [W - x, y]) : [[W, 0], [W, top]];
  const outline = [...leftEdge, ...[...rightEdge].reverse()];

  // The extremes of each edge over a span of height, sampled every half mm.
  const span = (y0: number, y1: number, f: (y: number) => number, pick: (a: number, b: number) => number) => {
    let v = f(y0);
    for (let y = y0; y < y1; y += 0.5) v = pick(v, f(y));
    return pick(v, f(y1));
  };
  const leftIn = (y0: number, y1: number) => span(y0, y1, (y) => edgeAt(leftEdge, y), Math.max);
  const rightIn = (y0: number, y1: number) => span(y0, y1, (y) => edgeAt(rightEdge, y), Math.min);
  const narrowest = span(0, top, (y) => edgeAt(rightEdge, y) - edgeAt(leftEdge, y), Math.min);
  const checks: Check[] = [];

  // Height scale. The ticks follow the back edge like a ruler, with numbers beside the long ones.
  const { minor, major, unit } = { mm: { minor: 5, major: 10, unit: 1 }, cm: { minor: 5, major: 10, unit: 10 }, in: { minor: 6.35, major: 25.4, unit: 25.4 } }[s.units];
  const toRib = (v: number) => (s.labelAs === 'fired' ? v * k : v);
  const marks: Mark[] = [];
  // bar() is a mark that runs in from the back edge, cut short where it would reach the working edge.
  const bar = (y: number, len: number, w: number): Rect | null => {
    const x1 = rightIn(y - w / 2, y + w / 2) - INSET, x0 = Math.max(x1 - len, leftIn(y - w / 2, y + w / 2) + 2);
    return x1 - x0 >= 1 && y - w / 2 > INSET ? [x0, y - w / 2, x1, y + w / 2] : null;
  };
  const digitH = Math.min(6, Math.max(3, (major * Math.min(1, s.labelAs === 'fired' ? k : 1)) / 2));
  const labelW = s.numbers ? textWidth(String(Math.floor(rim / unit)), digitH) + 1.5 : 0;
  const lineLen = 8 + labelW + 4;
  const lineYs = [...s.extraMarks.split(/[,;\s]+/).map(Number).filter((v) => v > 0).map(toRib), ...(s.above > 0 ? [rim] : [])]
    .filter((y) => y < top - 1).sort((a, b) => a - b);
  for (const y of lineYs) { const r = bar(y, lineLen, 1.2); if (r) marks.push({ kind: 'line', y, rects: [r] }); }
  let skipped = 0;
  if (s.ticks) {
    for (let i = 1; toRib(i * minor) <= rim + 1e-9; i++) {
      const v = i * minor, y = toRib(v), isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-9;
      if (lineYs.some((l) => Math.abs(l - y) < 1.5)) continue;
      const tick = bar(y, isMajor ? 8 : 4, STROKE);
      if (!tick) continue;
      marks.push({ kind: isMajor ? 'major' : 'minor', y, rects: [tick] });
      if (!isMajor || !s.numbers) continue;
      const text = String(Math.round(v / unit)), w = textWidth(text, digitH), x1 = tick[0] - 1.5;
      const y0 = y - digitH / 2, y1 = y + digitH / 2;
      // A number beside a line mark is left off quietly, because the line already marks that height.
      if (lineYs.some((l) => l + 0.6 > y0 - 0.4 && l - 0.6 < y1 + 0.4)) continue;
      if (y0 > INSET && y1 < top - INSET && x1 - w > leftIn(y0, y1) + 1.5 && x1 < rightIn(y0, y1) - INSET) {
        marks.push({ kind: 'label', y, rects: sevenSeg(text, x1 - w, y, digitH) });
      } else skipped++;
    }
  }
  if (skipped) checks.push({ id: 'labels', level: 'note', message: `${skipped} number${skipped > 1 ? 's' : ''} had no room and ${skipped > 1 ? 'were' : 'was'} left off.` });

  // The finger hole goes where the rib is widest, as near half height as it can, clear of every mark.
  let hole: Rib['hole'] = null;
  if (s.hole) {
    const R = s.holeD / 2;
    let best = -Infinity;
    for (let d = 0; d <= top / 2; d += 0.5) for (const y of [top / 2 - d, top / 2 + d]) {
      if (y - R < 3 || y + R > top - 3) continue;
      const y0 = y - R - 3, y1 = y + R + 3;
      let hi = rightIn(y0, y1) - R - 3;
      for (const m of marks) for (const [mx0, my0, , my1] of m.rects) if (my1 > y0 && my0 < y1) hi = Math.min(hi, mx0 - R - 1.5);
      const lo = leftIn(y0, y1) + R + 3, slack = hi - lo;
      if (slack >= 0 && slack > best + 0.5) { best = slack; hole = { x: (lo + hi) / 2, y, r: R }; }
    }
    if (!hole) checks.push({ id: 'hole', level: 'warn', message: `The ${s.holeD} mm finger hole has no room. Make the rib wider, make the hole smaller, or turn it off.` });
  }

  const rot = fitAngle(outline, s.bedW - 2 * BED_MARGIN, s.bedD - 2 * BED_MARGIN);
  if (rot === null) checks.unshift({ id: 'bed', level: 'error', message: `The rib is ${W.toFixed(0)} × ${top.toFixed(0)} mm, which doesn't fit the ${s.bedW} × ${s.bedD} mm bed. Make the pot smaller, or use a printer with a bigger bed.` });
  if (narrowest < 10) checks.push({ id: 'narrow', level: 'warn', message: `The rib is only ${narrowest.toFixed(1)} mm wide at its narrowest, so it flexes there. Raise Narrowest width if you want it stiffer.` });
  if (s.thick < 2) checks.push({ id: 'thin', level: 'warn', message: `A ${s.thick} mm rib bends under the clay. Use 3 mm or more for a rib that holds its shape.` });
  return { outline, hole, marks, pot, rmin, width: W, height: top, rim, narrowest, rot, checks };
}

const SEGMENTS: Record<string, string> = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd',
};
const digitW = (h: number) => 0.6 * h, GAP = 0.8;
export const textWidth = (text: string, h: number) => text.length * (digitW(h) + GAP) - GAP;

// sevenSeg() draws digits as seven-segment bars, left edge at x and centred on height yc. Each
// vertical bar overlaps its horizontal neighbours, and no two bars share a corner, so every bar is
// its own closed solid and the slicer merges the overlaps.
export function sevenSeg(text: string, x: number, yc: number, h: number): Rect[] {
  const w = digitW(h), s = STROKE, top = yc + h / 2, bot = yc - h / 2, out: Rect[] = [];
  [...text].forEach((ch, i) => {
    const l = x + i * (w + GAP), r = l + w;
    const seg: Record<string, Rect> = {
      a: [l, top - s, r, top], g: [l, yc - s / 2, r, yc + s / 2], d: [l, bot, r, bot + s],
      f: [l, yc + s / 4, l + s, top - s / 4], b: [r - s, yc + s / 4, r, top - s / 4],
      e: [l, bot + s / 4, l + s, yc - s / 4], c: [r - s, bot + s / 4, r, yc - s / 4],
    };
    for (const c of SEGMENTS[ch] ?? '') out.push(seg[c]);
  });
  return out;
}

// fitAngle() returns the smallest whole-degree rotation that fits the points in a w × d box, or null.
export function fitAngle(pts: [number, number][], w: number, d: number): number | null {
  for (let deg = 0; deg < 90; deg++) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of pts) {
      const u = x * c - y * sn, v = x * sn + y * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    if (u1 - u0 <= w && v1 - v0 <= d) return deg;
    if (u1 - u0 <= d && v1 - v0 <= w) return deg + 90;
  }
  return null;
}
