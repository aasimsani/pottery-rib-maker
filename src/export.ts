import type { Settings } from './state';
import type { Rib } from './core/rib';
import { ribParts, ribSTL, ribTris } from './core/mesh';
import type { PlatePart } from './core/plate';

/** The file name for this rib's exports, without an extension. */
export const exportName = (s: Settings, rib: Rib) => `rib_${s.name.replace(/\W+/g, '-').toLowerCase()}_${Math.round(rib.rim)}mm`;

// exportSTL() builds the rib that the downloads save, turned to fit the bed, and names it without an
// extension. The rib lies flat with its marks facing up. With splitMarks set, it also comes as two
// parts, the body and the marks, so the slicer can print the marks in a second filament.
export function exportSTL(s: Settings, rib: Rib): PlatePart | null {
  if (rib.rot === null) return null;
  const stl = ribSTL(ribTris(rib, s.thick, s.emboss), rib.rot), name = exportName(s, rib);
  const { body, marks } = ribParts(rib, s.thick, s.emboss);
  if (!s.splitMarks || !marks.length) return { stl, name };
  return { stl, name, parts: [{ name: 'Rib', stl: ribSTL(body, rib.rot) }, { name: 'Scale marks', stl: ribSTL(marks, rib.rot) }] };
}
