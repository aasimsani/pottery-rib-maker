import { expect, it } from 'vitest';
import { makeHandlers, type TabApi } from './tab';
import { DEFAULTS } from '../state';
import { buildRib } from '../core/rib';

// fakeApp() renders a change 120 ms after the bridge commits it, the way a busy page might.
function fakeApp() {
  let s = DEFAULTS, rendered = 0, edits = 0;
  const api: TabApi = {
    get: () => ({ s, rib: buildRib(s), renderedEdit: rendered, shapes: [] }),
    commit: (next) => { const e = ++edits; setTimeout(() => { s = next; rendered = e; }, 120); return e; },
    exportFile: async () => 'rib.stl',
  };
  return api;
}

it('replies with the rib built from the change, not the one before it', async () => {
  const h = makeHandlers(fakeApp());
  const reply = (await h.apply({ ops: [{ op: 'settings', patch: { thick: 6 } }] } as never)) as { settings: { thick: number } };
  expect(reply.settings.thick).toBe(6);
});
