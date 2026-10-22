import { expect, test } from 'vitest';
import { buildRib, sevenSeg, textWidth, type Rib } from './rib';
import { ribParts, ribSTL, ribTris } from './mesh';
import { stlSize } from './plate';
import { checkStl } from '../test/stl';
import { DEFAULTS, type Settings } from '../state';
import { PRESETS } from '../presets';

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...over });
const mug = settings({ profile: [{ z: 0, d: 80 }, { z: 90, d: 80 }], shrink: 0, above: 10, body: 60 });

// inside() is an even-odd point-in-polygon test on the rib's outline.
function inside(rib: Rib, x: number, y: number): boolean {
  let c = false;
  const o = rib.outline;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const [xi, yi] = o[i], [xj, yj] = o[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// edgeDist() is how far a point is from the rib's outline, in mm.
function edgeDist(rib: Rib, x: number, y: number): number {
  let best = Infinity;
  const o = rib.outline;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const [ax, ay] = o[j], [bx, by] = o[i], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

test('the working edge is the pot, so the rib meets the clay along the whole profile', () => {
  for (const shape of PRESETS) {
    const rib = buildRib(settings(shape));
    for (const p of rib.pot) expect(rib.outline.some(([x, y]) => Math.abs(x - (p.r - rib.rmin)) < 1e-6 && Math.abs(y - p.z) < 1e-6)).toBe(true);
  }
});

test('the rib is the pot you throw, so the height you enter is the rim mark on the rib', () => {
  const rib = buildRib({ ...mug, shrink: 12 });
  expect(rib.rim).toBe(90);
  expect(Math.max(...rib.pot.map((p) => p.r))).toBe(40);
});

// labelAt() finds the number printed in one column of the scale: 0 is wet, then dry, then fired.
const labelAt = (rib: Rib, col: number, text: string) => rib.marks.find((m) => m.kind === 'label' && m.col === col && m.text?.[0] === text);
const tall = { profile: [{ z: 0, d: 80 }, { z: 100, d: 80 }], shrink: 12, dryShrink: 6, units: 'mm' as const };

test('throwing to 100 mm puts 94 at 94 mm and 88 at 88 mm, so each number sits at the height it names', () => {
  const rib = buildRib({ ...mug, ...tall, scaleNumbers: 'wet-dry-fired' });
  expect(labelAt(rib, 0, '100')?.y).toBe(100);
  expect(labelAt(rib, 1, '94')?.y).toBeCloseTo(94, 6);
  expect(labelAt(rib, 2, '88')?.y).toBeCloseTo(88, 6);
});

test('a sloped line joins each wet height to the dry and fired heights it shrinks to', () => {
  const rib = buildRib({ ...mug, ...tall, scaleNumbers: 'wet-dry-fired' });
  const links = rib.marks.filter((m) => m.kind === 'link' && m.y === 100);
  // Each link runs from one column's number down to the next column's tick.
  expect(links.map((m) => m.to!.map((v) => +v.toFixed(3)))).toEqual([[100, 94], [94, 88]]);
  const two = buildRib({ ...mug, ...tall, scaleNumbers: 'wet-fired' });
  expect(two.marks.filter((m) => m.kind === 'link' && m.y === 100).map((m) => m.to)).toEqual([[100, 88]]);
});

test('ticks mark every 10 mm of wet height, like a ruler held to the thrown pot', () => {
  const rib = buildRib({ ...mug, shrink: 12, units: 'mm' });
  // The 90 mm tick is the rim, where the rim line and its numbers take its place.
  expect(rib.marks.filter((m) => m.kind === 'major').map((m) => m.y)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  expect(rib.marks.filter((m) => m.kind === 'line').map((m) => m.y)).toEqual([90]);
});

test('each column lines up, and no two numbers in a column touch', () => {
  for (const scaleNumbers of ['wet-fired', 'wet-dry-fired'] as const) for (const units of ['mm', 'cm', 'in'] as const) {
    const rib = buildRib({ ...mug, ...tall, units, scaleNumbers, body: 80 });
    for (let c = 0; c < (scaleNumbers === 'wet-fired' ? 2 : 3); c++) {
      const col = rib.marks.filter((m) => m.kind === 'label' && m.col === c);
      expect(col.length, `${units} column ${c}`).toBeGreaterThan(2);
      const rights = col.map((m) => Math.max(...m.rects.map((r) => r[2])));
      for (const r of rights) expect(r).toBeCloseTo(rights[0], 6);
      const ys = col.map((m) => m.y).sort((a, b) => a - b);
      const h = Math.max(...col[0].rects.map((r) => r[3])) - Math.min(...col[0].rects.map((r) => r[1]));
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1], `${units} column ${c}`).toBeGreaterThan(h);
    }
  }
});

test('turning the scale off leaves a plain rib, with the rim line kept unless that is off too', () => {
  const off = buildRib({ ...mug, scale: false });
  expect(off.marks.map((m) => m.kind)).toEqual(['line']);
  expect(buildRib({ ...mug, scale: false, rimLine: false }).marks).toEqual([]);
});

test('extra marks sit at the wet height you enter, like the ticks', () => {
  const rib = buildRib({ ...mug, shrink: 12, extraMarks: '35' });
  expect(rib.marks.find((m) => m.kind === 'line')!.y).toBe(35);
});

test('inch ticks fall every quarter inch', () => {
  const rib = buildRib({ ...mug, units: 'in' });
  const ys = rib.marks.filter((m) => m.kind === 'minor' || m.kind === 'major').map((m) => m.y);
  expect(ys.slice(0, 4).map((y) => +y.toFixed(3))).toEqual([6.35, 12.7, 19.05, 25.4]);
});

test('the rim gets its own long mark, and extra marks land at the heights you list', () => {
  const rib = buildRib({ ...mug, extraMarks: '35, 70' });
  expect(rib.marks.filter((m) => m.kind === 'line').map((m) => m.y)).toEqual([35, 70, 90]);
});

test('every mark sits on the flat top, clear of the bevel and the finger hole', () => {
  for (const shape of PRESETS) {
    const rib = buildRib(settings(shape));
    const corners = (m: Rib['marks'][number]) => [...m.rects.flatMap((r) => [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]), ...(m.polys ?? []).flat()];
    for (const m of rib.marks) for (const [x, y] of corners(m)) {
      expect(inside(rib, x, y), `${shape.name} mark at ${m.y}`).toBe(true);
      expect(edgeDist(rib, x, y), `${shape.name} mark at ${m.y}`).toBeGreaterThanOrEqual(rib.bevel.run);
      if (rib.hole) expect(Math.hypot(x - rib.hole.x, y - rib.hole.y)).toBeGreaterThan(rib.hole.r);
    }
  }
});

test('the finger hole sits on the flat top, with at least 1.5 mm of it round the hole', () => {
  const rib = buildRib(mug);
  expect(rib.hole).not.toBeNull();
  const { x, y, r } = rib.hole!;
  expect(inside(rib, x, y)).toBe(true);
  expect(edgeDist(rib, x, y)).toBeGreaterThanOrEqual(r + rib.bevel.run + 1.5 - 1e-6);
});

test('the edge has the profile of the MakerWorld set: a rounded foot, a straight land, and a bevel up to the top face', () => {
  const { fillet: f, land: l, run: r } = buildRib(mug).bevel;
  expect([f, r]).toEqual([0.55, 3.75]);
  expect(l).toBeCloseTo(4.5 - 3.75 * Math.tan((39 * Math.PI) / 180), 6);
  for (const shape of PRESETS) {
    const s = settings(shape), rib = buildRib(s), { body } = ribParts(rib, s.thick, s.emboss), { fillet, land, run } = rib.bevel;
    let onEdge = 0;
    for (let k = 0; k < body.length; k += 3) {
      const [x, y, z] = [body[k], body[k + 1], body[k + 2]], d = edgeDist(rib, x, y);
      if (Math.abs(z - s.thick) < 1e-4) expect(d, `${shape.name} top`).toBeGreaterThanOrEqual(run - 0.05);
      if (Math.abs(z) < 1e-4) expect(d, `${shape.name} bottom`).toBeGreaterThanOrEqual(fillet - 0.05);
      if (Math.abs(z - land) < 1e-4 && d < 1e-3) onEdge++;
    }
    // The land is the full outline, so the rib meets the clay along the exact pot.
    expect(onEdge, shape.name).toBeGreaterThan(rib.outline.length);
  }
});

test('every preset prints as closed solids, as thick as the rib plus its raised marks', () => {
  for (const shape of PRESETS) {
    const s = settings(shape), rib = buildRib(s);
    const stats = checkStl(ribSTL(ribTris(rib, s.thick, s.emboss), 0));
    expect(stats.volume, shape.name).toBeGreaterThan(0);
    expect(stats.max[2] - stats.min[2]).toBeCloseTo(s.thick + s.emboss, 4);
  }
});

test('the rib and its marks split into two closed parts that make up the whole rib', () => {
  const s = settings(), rib = buildRib(s), { body, marks } = ribParts(rib, s.thick, s.emboss);
  expect(body.length + marks.length).toBe(ribTris(rib, s.thick, s.emboss).length);
  const b = checkStl(ribSTL(body, 0)), m = checkStl(ribSTL(marks, 0));
  expect(b.volume).toBeGreaterThan(0); expect(m.volume).toBeGreaterThan(0);
  expect(b.max[2]).toBeCloseTo(s.thick, 4);
  expect(m.max[2]).toBeCloseTo(s.thick + s.emboss, 4);
});

test('the bevel reaches as far in as you set, at the angle you set, and the rest is the straight land', () => {
  const steep = buildRib({ ...mug, bevelWidth: 2, bevelAngle: 60 }).bevel;
  expect(steep.run).toBe(2);
  expect(steep.land).toBeCloseTo(4.5 - 2 * Math.tan(Math.PI / 3), 6);
  // A bevel can't eat the whole edge, so at least 1 mm of land stays to meet the clay.
  const wide = buildRib({ ...mug, bevelWidth: 10 }).bevel;
  expect(wide.land).toBeCloseTo(1, 6);
  expect(wide.run).toBeCloseTo(3.5 / Math.tan((39 * Math.PI) / 180), 6);
  const square = buildRib({ ...mug, bevelWidth: 0 });
  expect(square.bevel.run).toBe(0);
  expect(square.bevel.land).toBe(4.5);
  for (const s of [{ ...mug, bevelWidth: 0 }, { ...mug, bevelWidth: 2, bevelAngle: 60 }, { ...mug, bevelWidth: 10 }]) {
    const rib = buildRib(s);
    expect(checkStl(ribSTL(ribTris(rib, s.thick, s.emboss), 0)).max[2]).toBeCloseTo(s.thick + s.emboss, 4);
  }
});

test('a rib too tall for the bed turns until it fits, and one far too big is refused', () => {
  const tall = buildRib({ ...mug, profile: [{ z: 0, d: 80 }, { z: 280, d: 80 }], above: 0 });
  expect(tall.rot).not.toBeNull();
  const [w, d] = stlSize(ribSTL(ribTris(tall, 3, 0.6), tall.rot!));
  expect(w).toBeLessThanOrEqual(DEFAULTS.bedW - 6);
  expect(d).toBeLessThanOrEqual(DEFAULTS.bedD - 6);
  const huge = buildRib({ ...mug, profile: [{ z: 0, d: 80 }, { z: 500, d: 80 }] });
  expect(huge.rot).toBeNull();
  expect(huge.checks.some((c) => c.level === 'error')).toBe(true);
});

test('a broken profile gives an error instead of a crash', () => {
  const rib = buildRib({ ...mug, profile: [{ z: 0, d: 80 }] });
  expect(rib.checks[0].level).toBe('error');
  expect(rib.outline).toEqual([]);
});

test('a number never runs into a line mark, so the rim line stays readable', () => {
  const overlap = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const shape of PRESETS) for (const extraMarks of ['', '25, 48']) {
    const rib = buildRib(settings({ ...shape, extraMarks }));
    const lines = rib.marks.filter((m) => m.kind === 'line').flatMap((m) => m.rects);
    for (const m of rib.marks.filter((x) => x.kind === 'label')) for (const r of m.rects) for (const l of lines) expect(overlap(r, l), `${shape.name} label at ${m.y}`).toBe(false);
  }
});

test('a decimal point prints as one small square after its digit', () => {
  expect(sevenSeg('4.7', 0, 0, 4)).toHaveLength(4 + 1 + 3);
  expect(textWidth('4.7', 4)).toBeLessThan(textWidth('477', 4));
});
