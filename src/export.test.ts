import { expect, test } from 'vitest';
import { exportSTL } from './export';
import { buildRib } from './core/rib';
import { DEFAULTS } from './state';

test('by default the rib exports as two parts, the rib and its marks', () => {
  const out = exportSTL(DEFAULTS, buildRib(DEFAULTS))!;
  expect(out.parts!.map((p) => p.name)).toEqual(['Rib', 'Scale marks']);
  expect(out.name).toMatch(/^rib_.*mm$/);
});

test('with the option off, or with no marks, the rib is one solid', () => {
  for (const s of [{ ...DEFAULTS, splitMarks: false }, { ...DEFAULTS, emboss: 0 }]) expect(exportSTL(s, buildRib(s))!.parts).toBeUndefined();
});
