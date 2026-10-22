import type { Settings } from './state';
import type { Rib } from './core/rib';
import { ribParts, ribSTL, ribTris } from './core/mesh';
import type { PlatePart } from './core/plate';

/** The file name for this rib's exports, without an extension. */
export const exportName = (s: Settings, rib: Rib) => `rib_${s.name.replace(/\W+/g, '-').toLowerCase()}_${Math.round(rib.rim)}mm`;

// exportSTL() builds the exact file that Download STL saves, turned to fit the bed. The rib lies
// flat with its marks facing up. With splitMarks set, the rib also comes as two parts, the body and
// the marks, and the download becomes a 3MF, because an STL holds one solid with no names.
export function exportSTL(s: Settings, rib: Rib): PlatePart | null {
  if (rib.rot === null) return null;
  const stl = ribSTL(ribTris(rib, s.thick, s.emboss), rib.rot), name = exportName(s, rib);
  const { body, marks } = ribParts(rib, s.thick, s.emboss);
  if (!s.splitMarks || !marks.length) return { stl, name: `${name}.stl` };
  return { stl, name: `${name}.3mf`, parts: [{ name: 'Rib', stl: ribSTL(body, rib.rot) }, { name: 'Scale marks', stl: ribSTL(marks, rib.rot) }] };
}
