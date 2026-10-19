import { expect, test } from 'vitest';
import { buildRib, type Rib } from './rib';
import { ribSTL, ribTris } from './mesh';
import { stlSize } from './plate';
import { checkStl } from '../test/stl';
import { DEFAULTS, type Settings } from '../state';
import { PRESETS } from '../presets';

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...over });
const mug = settings({ profile: [{ z: 0, d: 80 }, { z: 90, d: 80 }], shrink: 0, above: 10, body: 45 });

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

test('shrinkage grows the rib, so the pot comes out of the kiln at the size you entered', () => {
  const rib = buildRib({ ...mug, shrink: 12 });
  expect(rib.rim).toBeCloseTo(90 / 0.88, 6);
  expect(Math.max(...rib.pot.map((p) => p.r))).toBeCloseTo(40 / 0.88, 6);
});

test('ticks mark every 10 mm of thrown height, or of fired height when the labels say fired', () => {
  const thrown = buildRib({ ...mug, shrink: 12, units: 'mm', labelAs: 'thrown' });
  expect(thrown.marks.filter((m) => m.kind === 'major').map((m) => m.y)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  const fired = buildRib({ ...mug, shrink: 12, units: 'mm', labelAs: 'fired' });
  const ys = fired.marks.filter((m) => m.kind === 'major').map((m) => m.y);
  // The fired 90 mm tick lands on the rim, where the rim line takes its place.
  expect(ys).toHaveLength(8);
  expect(ys[0]).toBeCloseTo(10 / 0.88, 6);
  expect(fired.marks.find((m) => m.kind === 'line')!.y).toBeCloseTo(fired.rim, 6);
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
