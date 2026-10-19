import { expect, test } from 'vitest';
import { insertPoint, movePoint, removePoint, GUARDS } from './edit';
import { buildRib } from './rib';
import { DEFAULTS } from '../state';
import { PRESETS } from '../presets';
import { foldsAt, sampleProfile, type ProfilePoint } from './profile';

const mug: ProfilePoint[] = [{ z: 0, d: 70 }, { z: 40, d: 90 }, { z: 90, d: 80 }];

test('a dragged point stays at least the minimum gap from its neighbours, so the edge never folds over', () => {
  const p = movePoint(mug, 1, 89.5, 80, GUARDS);
  expect(p[1].z).toBe(90 - GUARDS.minGap);
  expect(movePoint(mug, 1, -20, 70, GUARDS)[1].z).toBe(GUARDS.minGap);
});

test('the base stays on the wheel head, and the rim can only go up from the point below it', () => {
  expect(movePoint(mug, 0, 15, 70, GUARDS)[0].z).toBe(0);
  expect(movePoint(mug, 2, 10, 80, GUARDS)[2].z).toBe(40 + GUARDS.minGap);
});

test('no point gets narrower than the smallest diameter', () => {
  expect(movePoint(mug, 1, 40, 3, GUARDS)[1].d).toBe(GUARDS.minD);
});

test('moves snap to the snap step', () => {
  const p = movePoint(mug, 1, 41.26, 92.74, { ...GUARDS, snap: 0.5 });
  expect([p[1].z, p[1].d]).toEqual([41.5, 92.5]);
});

test('a new point lands in height order, and one too close to a neighbour is refused', () => {
  const added = insertPoint(mug, 60, 86, GUARDS)!;
  expect(added.profile.map((q) => q.z)).toEqual([0, 40, 60, 90]);
  expect(added.index).toBe(2);
  expect(insertPoint(mug, 40.5, 86, GUARDS)).toBeNull();
  expect(insertPoint(mug, 95, 86, GUARDS)).toBeNull(); // above the rim: drag the rim up instead
});

test('a pot keeps at least a base and a rim', () => {
  expect(removePoint(mug, 1)).toHaveLength(2);
  expect(removePoint(mug.slice(0, 2), 0)).toHaveLength(2);
});

test('a curve that folds back on itself is an error, because the rib could not pull away from the clay', () => {
  const fold = buildRib({ ...DEFAULTS, profile: [{ z: 0, d: 40 }, { z: 2, d: 200 }, { z: 4, d: 40 }, { z: 6, d: 200 }, { z: 60, d: 80 }] });
  expect(fold.checks.find((c) => c.id === 'fold')?.level).toBe('error');
  for (const shape of PRESETS) expect(buildRib({ ...DEFAULTS, ...shape }).checks.some((c) => c.id === 'fold'), shape.name).toBe(false);
});

test('a move that would fold the wall stops short, and a new point that would fold it is refused', () => {
  const tight: ProfilePoint[] = [{ z: 0, d: 40 }, { z: 4, d: 44 }, { z: 8, d: 40 }, { z: 60, d: 80 }];
  expect(foldsAt(sampleProfile(tight))).toBe(-1);
  const moved = movePoint(tight, 1, 2, 200, GUARDS);
  expect(foldsAt(sampleProfile(moved))).toBe(-1);
  expect(moved[1].d).toBeGreaterThan(44);
  expect(moved[1].d).toBeLessThan(200);
  expect(insertPoint(tight, 6, 220, GUARDS)).toBeNull();
});
