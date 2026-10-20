import { describe, expect, test } from 'vitest';
import { autoTolerance, photoIssues, segment, traceProfile } from './photo';
import { foldsAt, sampleProfile } from './profile';

// photo() paints a synthetic RGBA image with a light background and the shapes that fill(x, y) draws.
function photo(w: number, h: number, fill: (x: number, y: number) => [number, number, number] | null) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fill(x, y) ?? [235, 232, 228];
    d.set([...c, 255], (y * w + x) * 4);
  }
  return d;
}
const POT: [number, number, number] = [70, 90, 140];
const opts = { detail: 0.6, minGap: 2 };

// A straight mug body 40 px wide and 90 px tall, with a handle loop on its right and a glaze highlight inside.
const mugPhoto = photo(120, 130, (x, y) => {
  const body = x >= 30 && x < 70 && y >= 20 && y < 110;
  const handle = x >= 70 && x < 88 && y >= 40 && y < 85 && !(x >= 74 && x < 84 && y >= 48 && y < 77);
  if (body && x >= 45 && x < 50 && y >= 50 && y < 60) return [240, 238, 236]; // highlight, close to the background colour
  if (body || handle) return POT;
  if (x >= 5 && x < 7 && y >= 5 && y < 7) return [20, 20, 20]; // a speck of dust
  return null;
});

// An angled pot 150 px tall: the wall flares out from the base to a sharp carination a third of the way up,
// then leans back in to the rim. It stands on a plain background with room all round.
const angled = (w = 220, h = 200, top = 25, bottom = 175) => photo(w, h, (x, y) => {
  if (y < top || y >= bottom) return null;
  const z = bottom - y, kink = 50, r = z < kink ? 40 + (z / kink) * 25 : 65 - ((z - kink) / (bottom - top - kink)) * 10;
  return Math.abs(x - w / 2 + 0.5) < r ? POT : null;
});

describe('segment', () => {
  test('keeps the piece and its handle, and drops specks', () => {
    const m = segment(mugPhoto, 120, 130, 60);
    expect(m[60 * 120 + 50]).toBe(1); // body
    expect(m[60 * 120 + 85]).toBe(1); // handle
    expect(m[6 * 120 + 6]).toBe(0); // dust
    expect(m[60 * 120 + 79]).toBe(0); // the hole through the handle stays background
  });
});

describe('traceProfile', () => {
  test('measures the body, ignoring the handle, scaled to the height you throw', () => {
    const { profile } = traceProfile(segment(mugPhoto, 120, 130, 60), 120, 130, 90, opts);
    expect(profile[0].z).toBe(0);
    expect(profile.at(-1)!.z).toBeCloseTo(90, 6);
    for (const p of profile) expect(Math.abs(p.d - 40)).toBeLessThanOrEqual(1.5);
  });

  test('a straight wall needs only a base and a rim', () => {
    expect(traceProfile(segment(mugPhoto, 120, 130, 60), 120, 130, 90, opts).profile.length).toBeLessThanOrEqual(3);
  });

  test('keeps a sharp carination as a corner, where it is', () => {
    const { profile } = traceProfile(segment(angled(), 220, 200, 60), 220, 200, 150, opts);
    const kink = profile.find((p) => Math.abs(p.z - 50) < 3);
    expect(kink, JSON.stringify(profile)).toBeDefined();
    expect(Math.abs(kink!.d - 130)).toBeLessThan(3);
    expect(kink!.sharp).toBe(true);
  });

  test('points rise at least the minimum gap apart, and the curve never folds', () => {
    for (const minGap of [2, 8]) {
      const { profile } = traceProfile(segment(angled(), 220, 200, 60), 220, 200, 150, { detail: 0.2, minGap });
      for (let i = 1; i < profile.length; i++) expect(profile[i].z - profile[i - 1].z).toBeGreaterThanOrEqual(minGap);
      expect(foldsAt(sampleProfile(profile))).toBe(-1);
    }
  });

  test('follows a flared wall from a narrow base to a wide rim', () => {
    const flare = photo(140, 120, (x, y) => (y >= 10 && y < 110 && Math.abs(x - 70) < 20 + (110 - y) * 0.15 ? [60, 60, 60] : null));
    const { profile } = traceProfile(segment(flare, 140, 120, 60), 140, 120, 100, opts);
    expect(profile[0].d).toBeLessThan(profile.at(-1)!.d - 20);
  });

  test('an empty photo finds nothing', () => {
    expect(() => traceProfile(new Uint8Array(100), 10, 10, 50, opts)).toThrow(/No pot/);
  });
});

describe('autoTolerance', () => {
  // A 78 → 86 mm flared mug, 95 px tall at 1 px/mm, with a soft grey shadow spreading under its base.
  const shadowed = photo(160, 140, (x, y) => {
    const half = 39 + ((110 - y) / 95) * 4;
    if (y >= 15 && y < 110 && Math.abs(x - 80) < half) return [52, 70, 110];
    if (Math.abs(x - 80) < 50 && y >= 105 && y < 116) return [200, 198, 194];
    return null;
  });

  test('picks a cutoff between the shadow and the pot', () => {
    const t = autoTolerance(shadowed, 160, 140);
    const shadowDist = Math.hypot(235 - 200, 232 - 198, 228 - 194), potDist = Math.hypot(235 - 52, 232 - 70, 228 - 110);
    expect(t).toBeGreaterThan(shadowDist);
    expect(t).toBeLessThan(potDist);
  });

  test('so the traced base ignores the shadow', () => {
    const m = segment(shadowed, 160, 140, autoTolerance(shadowed, 160, 140));
    const { profile } = traceProfile(m, 160, 140, 95, opts);
    expect(Math.abs(profile[0].d - 78)).toBeLessThan(2);
    expect(Math.abs(profile.at(-1)!.d - 86)).toBeLessThan(2);
  });
});

describe('photoIssues', () => {
  const issues = (rgba: Uint8ClampedArray, w: number, h: number) => {
    const mask = segment(rgba, w, h, 60);
    return photoIssues(mask, w, h, traceProfile(mask, w, h, 100, opts)).map((i) => i.id);
  };

  test('a clean side-on photo raises nothing', () => {
    expect(issues(angled(), 220, 200)).toEqual([]);
  });

  test('a pot that runs off the edge of the photo is flagged', () => {
    expect(issues(angled(220, 200, 25, 200), 220, 200)).toContain('edge');
  });

  test('a rim seen as an oval means the photo was taken from above', () => {
    const above = photo(220, 200, (x, y) => {
      const body = Math.abs(x - 110) < 50 && y >= 40 && y < 175;
      const rim = ((x - 110) / 50) ** 2 + ((y - 40) / 18) ** 2 <= 1;
      return body || rim ? POT : null;
    });
    expect(issues(above, 220, 200)).toContain('above');
  });

  test('a small pot is flagged, because each pixel is then more than a millimetre', () => {
    expect(issues(mugPhoto, 120, 130)).toContain('small');
  });

  test('sides that lean the same way mean the pot or the camera was tilted', () => {
    const leaning = photo(240, 200, (x, y) => (y >= 25 && y < 175 && Math.abs(x - 120 - (175 - y) * 0.3) < 45 ? POT : null));
    expect(issues(leaning, 240, 200)).toContain('tilted');
  });

  test('a pot that fills most of the frame leaves too little background to read', () => {
    const full = photo(120, 160, (x, y) => (y >= 4 && y < 156 && x >= 4 && x < 116 ? POT : null));
    expect(issues(full, 120, 160)).toContain('background');
  });
});
