import { expect, test } from 'vitest';
import { settingsFromLegacy, storageKey } from './state';

test('every key lives under the app prefix', () => {
  expect(storageKey('settings')).toBe('rib.settings');
  expect(storageKey('library.tab')).toBe('rib.library.tab');
});

test('settings that only the rib maker saved come through whole', () => {
  expect(settingsFromLegacy({ shrink: 10, thick: 4, above: 8 })).toEqual({ shrink: 10, thick: 4, above: 8 });
});

test("settings mixed with the stencil maker's drop its fields and the two that both apps name", () => {
  expect(settingsFromLegacy({ shrink: 10, thick: 0.6, above: 5, piece: { name: 'x', profile: [] }, coverage: 0.5 }))
    .toEqual({ shrink: 10 });
});
