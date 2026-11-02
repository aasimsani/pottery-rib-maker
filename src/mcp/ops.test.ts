import { describe, expect, it } from 'vitest';
import { applyOps } from './ops';
import { DEFAULTS } from '../state';
import { PRESETS } from '../presets';

const ctx = { shapes: PRESETS };
const p0 = DEFAULTS.profile; // base 0, then 4, 14 and 90 mm

describe('applyOps', () => {
  it('rejects an unknown setting and names the closest one', () => {
    expect(() => applyOps(DEFAULTS, [{ op: 'settings', patch: { thik: 4 } }], ctx)).toThrow(/thik.*thick/);
  });
  it('rejects wrong types and values outside a setting\'s choices', () => {
    expect(() => applyOps(DEFAULTS, [{ op: 'settings', patch: { shrink: '12' } }], ctx)).toThrow(/shrink/);
    expect(() => applyOps(DEFAULTS, [{ op: 'settings', patch: { units: 'ft' } }], ctx)).toThrow(/units/);
  });
  it('rejects a profile that folds back on itself, with the guard\'s reason', () => {
    const folded = [{ z: 0, d: 60 }, { z: 50, d: 80 }, { z: 40, d: 70 }];
    expect(() => applyOps(DEFAULTS, [{ op: 'setProfile', profile: folded }], ctx)).toThrow(/higher than the one below/);
  });
  it('rejects points closer than the minimum gap, or narrower than the smallest Ø', () => {
    expect(() => applyOps(DEFAULTS, [{ op: 'setProfile', profile: [{ z: 0, d: 60 }, { z: 1, d: 62 }, { z: 80, d: 70 }] }], ctx)).toThrow(/gap/);
    expect(() => applyOps(DEFAULTS, [{ op: 'setProfile', profile: [{ z: 0, d: 10 }, { z: 80, d: 70 }] }], ctx)).toThrow(/smallest Ø/);
  });
  it('rejects a curve that bulges back down between valid points', () => {
    // The heights rise, but the spline through a sharp in-and-out swings below the point before it.
    const swing = [{ z: 0, d: 60 }, { z: 3, d: 160 }, { z: 6, d: 60 }, { z: 9, d: 160 }, { z: 80, d: 60 }];
    expect(() => applyOps({ ...DEFAULTS, minGap: 2 }, [{ op: 'setProfile', profile: swing }], ctx)).toThrow(/folds/);
  });
  it('inserts, moves and removes points through the app\'s own guards', () => {
    let s = applyOps(DEFAULTS, [{ op: 'insertPoint', z: 50, d: 82 }], ctx);
    expect(s.profile.map((q) => q.z)).toEqual([0, 4, 14, 50, 90]);
    expect(() => applyOps(s, [{ op: 'insertPoint', z: 51, d: 82 }], ctx)).toThrow(/No point added/);
    s = applyOps(s, [{ op: 'movePoint', index: 3, z: 60, d: 84 }], ctx);
    expect(s.profile[3]).toMatchObject({ z: 60, d: 84 });
    expect(applyOps(s, [{ op: 'removePoint', index: 3 }], ctx).profile).toEqual(p0);
    expect(() => applyOps(s, [{ op: 'removePoint', index: 0 }], ctx)).toThrow(/base/);
  });
  it('picks a library shape the way the app does', () => {
    const s = applyOps(DEFAULTS, [{ op: 'pickShape', name: 'Belly mug' }], ctx), belly = PRESETS.find((x) => x.name === 'Belly mug')!;
    expect([s.name, s.profile, s.body, s.above, s.mirror]).toEqual([belly.name, belly.profile, belly.body, belly.above, belly.mirror]);
    expect(() => applyOps(DEFAULTS, [{ op: 'pickShape', name: 'Teapot' }], ctx)).toThrow(/list_shapes/);
  });
  it('applies a whole batch, or leaves the design as it was', () => {
    expect(() => applyOps(DEFAULTS, [{ op: 'settings', patch: { thick: 5 } }, { op: 'removePoint', index: 0 }], ctx)).toThrow();
    expect(DEFAULTS.thick).toBe(4.5);
    const s = applyOps(DEFAULTS, [{ op: 'settings', patch: { thick: 5 } }, { op: 'pickShape', name: 'Flared tumbler' }], ctx);
    expect([s.thick, s.name]).toEqual([5, 'Flared tumbler']);
  });
});
