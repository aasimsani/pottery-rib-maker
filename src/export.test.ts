import { expect, test } from 'vitest';
import { exportSTL } from './export';
import { buildRib } from './core/rib';
import { DEFAULTS } from './state';

test('the rib exports as one solid unless the marks are a separate part', () => {
  expect(exportSTL(DEFAULTS, buildRib(DEFAULTS))!.parts).toBeUndefined();
  const s = { ...DEFAULTS, splitMarks: true }, out = exportSTL(s, buildRib(s))!;
  expect(out.parts!.map((p) => p.name)).toEqual(['Rib', 'Scale marks']);
  expect(out.name).toMatch(/\.3mf$/);
});

test('a rib with no marks has nothing to split', () => {
  const s = { ...DEFAULTS, splitMarks: true, emboss: 0 };
  expect(exportSTL(s, buildRib(s))!.parts).toBeUndefined();
});
