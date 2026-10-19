import type { Settings } from './state';
import type { Rib } from './core/rib';
import { ribSTL, ribTris } from './core/mesh';

/** The file name for this rib's exports, without an extension. */
export const exportName = (s: Settings, rib: Rib) => `rib_${s.name.replace(/\W+/g, '-').toLowerCase()}_${Math.round(rib.rim)}mm`;

// exportSTL() builds the exact file that Download STL saves, turned to fit the bed. The rib lies
// flat with its marks facing up.
export function exportSTL(s: Settings, rib: Rib): { stl: ArrayBuffer; name: string } | null {
  if (rib.rot === null) return null;
  return { stl: ribSTL(ribTris(rib, s.thick, s.emboss), rib.rot), name: `${exportName(s, rib)}.stl` };
}
