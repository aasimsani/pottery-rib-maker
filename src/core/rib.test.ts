import { expect, test } from 'vitest';
import { buildRib, sevenSeg, textWidth, type Rib } from './rib';
import { ribSTL, ribTris } from './mesh';
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

test('throwing to 100 mm reads 94 dry and 88 fired, with 6% drying and 12% total shrinkage', () => {
  const rib = buildRib({ ...mug, profile: [{ z: 0, d: 80 }, { z: 100, d: 80 }], shrink: 12, dryShrink: 6, units: 'mm', scaleNumbers: 'wet-dry-fired' });
  expect(rib.marks.find((m) => m.kind === 'label' && m.y === 100)?.text).toEqual(['100', '94', '88']);
});

test('ticks mark every 10 mm of wet height, like a ruler held to the thrown pot', () => {
  const rib = buildRib({ ...mug, shrink: 12, units: 'mm' });
  // The 90 mm tick is the rim, where the rim line and its numbers take its place.
  expect(rib.marks.filter((m) => m.kind === 'major').map((m) => m.y)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  expect(rib.marks.filter((m) => m.kind === 'line').map((m) => m.y)).toEqual([90]);
});

test('each long tick reads its wet, dry, and fired height, left to right', () => {
  const rib = buildRib({ ...mug, shrink: 12, dryShrink: 6, units: 'mm', scaleNumbers: 'wet-dry-fired' });
  expect(rib.marks.find((m) => m.kind === 'label' && m.y === 50)?.text).toEqual(['50', '47', '44']);
  const cm = buildRib({ ...mug, shrink: 12, dryShrink: 6, units: 'cm', scaleNumbers: 'wet-dry-fired' });
  expect(cm.marks.find((m) => m.kind === 'label' && m.y === 50)?.text).toEqual(['5', '4.7', '4.4']);
  const two = buildRib({ ...mug, shrink: 12, units: 'cm', scaleNumbers: 'wet-fired' });
  expect(two.marks.find((m) => m.kind === 'label' && m.y === 50)?.text).toEqual(['5', '4.4']);
});

test('the number columns line up and never overlap, so they read like a table', () => {
  const rib = buildRib({ ...mug, shrink: 12, dryShrink: 6, units: 'cm', scaleNumbers: 'wet-dry-fired', body: 60 });
  const labels = rib.marks.filter((m) => m.kind === 'label');
  expect(labels.length).toBeGreaterThan(3);
  for (let c = 0; c < 3; c++) {
    // Each column's right edge is the same on every row.
    const rights = labels.map((m) => Math.max(...m.groups![c].map((r) => r[2])));
    for (const r of rights) expect(r).toBeCloseTo(rights[0], 6);
  }
  for (const m of labels) for (let c = 0; c < 2; c++) {
    expect(Math.max(...m.groups![c].map((r) => r[2]))).toBeLessThan(Math.min(...m.groups![c + 1].map((r) => r[0])));
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

test('every mark sits on the rib and clear of the finger hole', () => {
  for (const shape of PRESETS) {
    const rib = buildRib(settings(shape));
    for (const m of rib.marks) for (const r of m.rects) for (const [x, y] of [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]) {
      expect(inside(rib, x, y), `${shape.name} mark at ${m.y}`).toBe(true);
      if (rib.hole) expect(Math.hypot(x - rib.hole.x, y - rib.hole.y)).toBeGreaterThan(rib.hole.r);
    }
  }
});

test('the finger hole keeps at least 3 mm of plastic round it', () => {
  const rib = buildRib(mug);
  expect(rib.hole).not.toBeNull();
  const { x, y, r } = rib.hole!;
  for (let a = 0; a < 360; a += 10) {
    const t = (a * Math.PI) / 180;
    expect(inside(rib, x + (r + 3) * Math.cos(t), y + (r + 3) * Math.sin(t))).toBe(true);
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
