import { expect, test } from 'vitest';
import { tabInfo } from './Library';

// All three apps run on aasimsani.net and share one localStorage, so a saved tab can come from a sister app.
test("a saved tab this library doesn't have falls back to the first tab instead of crashing", () => {
  expect(tabInfo('builtin').id).toBe('pots');
  expect(tabInfo('pots').id).toBe('pots');
});
