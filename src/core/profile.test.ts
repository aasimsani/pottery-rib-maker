import { expect, test } from 'vitest';
import { profileError, sampleProfile, scaleProfile, widestD } from './profile';
import { PRESETS } from '../presets';

test('the sampled curve passes through every measured point, from the base up', () => {
  for (const { profile } of PRESETS) {
    const pts = sampleProfile(profile), z0 = profile[0].z;
    expect(pts[0].z).toBe(0);
    for (const q of profile) expect(pts.some((p) => Math.abs(p.z - (q.z - z0)) < 1e-9 && Math.abs(p.r - q.d / 2) < 1e-9)).toBe(true);
  }
});

test('a sharp point stays a corner, so an angled pot keeps its crisp carination', () => {
  const pts = sampleProfile([{ z: 0, d: 70 }, { z: 35, d: 100, sharp: true }, { z: 90, d: 86 }]);
  const k = pts.findIndex((p) => p.z === 35);
  // Both neighbours of the corner lie on the straight lines to the next measured points.
  expect(pts[k - 1].r).toBeCloseTo(35 + (15 * pts[k - 1].z) / 35, 6);
  expect(pts[k + 1].r).toBeCloseTo(50 - (7 * (pts[k + 1].z - 35)) / 55, 6);
});

test('a broken profile is reported instead of drawn', () => {
  expect(profileError([{ z: 0, d: 80 }])).toBeTruthy();
  expect(profileError([{ z: 0, d: 80 }, { z: 0, d: 90 }])).toBeTruthy();
  expect(profileError([{ z: 0, d: 0 }, { z: 90, d: 90 }])).toBeTruthy();
  expect(profileError([{ z: 0, d: 80 }, { z: 90, d: 90 }])).toBeNull();
});

test('scaling stretches height and width on their own', () => {
  const p = scaleProfile([{ z: 0, d: 80 }, { z: 50, d: 100, sharp: true }], 2, 0.5);
  expect(p).toEqual([{ z: 0, d: 40 }, { z: 100, d: 50, sharp: true }]);
  expect(widestD(p)).toBe(50);
});
