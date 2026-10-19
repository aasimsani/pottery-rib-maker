import type { Settings } from './state';

/** A rib in the library: the pot it throws, and the shape of the rib round it. */
export type Shape = Pick<Settings, 'name' | 'profile' | 'body' | 'above' | 'mirror'> & { group: 'pots' | 'set' };

// zigzag() is a textured wall: diameters that step in and out by depth every pitch mm.
const zigzag = (height: number, d: number, depth: number, pitch: number) =>
  Array.from({ length: Math.floor(height / (pitch / 2)) + 1 }, (_, i) => ({ z: (i * pitch) / 2, d: d + (i % 2 ? depth * 2 : 0), sharp: true }));

// Pot profiles are the size you throw them, wet. Shrinkage only changes the dry and fired numbers.
// The "set" shapes follow the outlines of the five ribs in the MakerWorld Ceramic Rib Tool Set (model 1963257).
export const PRESETS: Shape[] = [
  { group: 'pots', name: 'Rounded-base mug', body: 60, above: 10, mirror: false,
    profile: [{ z: 0, d: 62 }, { z: 4, d: 72 }, { z: 14, d: 80 }, { z: 90, d: 80 }] },
  { group: 'pots', name: 'Belly mug', body: 60, above: 10, mirror: false,
    profile: [{ z: 0, d: 70 }, { z: 35, d: 88 }, { z: 95, d: 78 }] },
  { group: 'pots', name: 'Angled pot', body: 60, above: 10, mirror: false,
    profile: [{ z: 0, d: 74 }, { z: 32, d: 104, sharp: true }, { z: 90, d: 92 }] },
  { group: 'pots', name: 'Flared tumbler', body: 60, above: 10, mirror: false,
    profile: [{ z: 0, d: 66 }, { z: 110, d: 84 }] },
  { group: 'pots', name: 'Footed bowl', body: 55, above: 0, mirror: false,
    profile: [{ z: 0, d: 62 }, { z: 4, d: 68, sharp: true }, { z: 8, d: 62, sharp: true }, { z: 12, d: 70, sharp: true },
      { z: 30, d: 112 }, { z: 60, d: 150 }, { z: 80, d: 160 }] },
  { group: 'pots', name: 'Moon jar', body: 55, above: 10, mirror: false,
    profile: [{ z: 0, d: 70 }, { z: 20, d: 120 }, { z: 60, d: 150 }, { z: 110, d: 110 }, { z: 125, d: 80, sharp: true }, { z: 135, d: 84 }] },
  { group: 'set', name: 'Curved side', body: 36, above: 0, mirror: false,
    profile: [{ z: 0, d: 80 }, { z: 50, d: 92 }, { z: 100, d: 80 }] },
  { group: 'set', name: 'Curved sides', body: 44, above: 0, mirror: true,
    profile: [{ z: 0, d: 80 }, { z: 50, d: 104 }, { z: 100, d: 80 }] },
  { group: 'set', name: 'Triangle', body: 6, above: 0, mirror: false,
    profile: [{ z: 0, d: 60 }, { z: 55, d: 74 }, { z: 100, d: 112 }] },
  { group: 'set', name: 'Pot bottom', body: 50, above: 0, mirror: false,
    profile: [{ z: 0, d: 100 }, { z: 6, d: 132 }, { z: 18, d: 156 }, { z: 32, d: 160, sharp: true }, { z: 127, d: 160 }] },
  { group: 'set', name: 'Textured sides', body: 48, above: 0, mirror: true, profile: zigzag(127, 80, 5, 18) },
];
