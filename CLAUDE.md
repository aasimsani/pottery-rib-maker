# Pottery Rib Maker

Run `npm test` (Vitest) and `npm run build` before you commit. See README.md for how the pieces fit together.

## Design Context

The app is a sibling of `../pottery-stencil-maker` (Pottery Stencil Maker). It shares that app's users, voice, palette, and
layout, so follow the Design Context in that repo's CLAUDE.md. The users are potters who own a 3D printer. They want a
rib that throws the same pot every time, and an STL file they trust to print the first time.

## Sister apps

Three apps share one layout, one set of field components and one palette. Each one lives in its own repo:

| App | Repo | Makes |
|---|---|---|
| Pottery Stencil Maker | `../pottery-stencil-maker` | flat or curved underglaze stencils |
| Pottery Rib Maker | `../pottery-rib-maker` | profile ribs with a height scale |
| Pottery Roller Maker | `../pottery-roller-maker` | texture and underglaze rollers, forked from the stencil maker |

When you change something the apps share, such as `src/ui/fields.tsx`, the tokens at the top of `src/styles.css`, the
library drawer or the preview layout, make the same change in the sibling repos, so the three stay one family. A new
tool forks the closest existing app rather than starting fresh.

## Code map

- `src/core/profile.ts` draws a smooth curve through the pot measurements.
- `src/core/rib.ts` turns the curve into the rib outline, the height marks, the finger hole, and the print check.
- `src/core/photo.ts` traces a pot's outline from a photo and flags photos that trace badly. `src/ui/PhotoRib.tsx` is the step-by-step modal around it.
- `src/core/mesh.ts` extrudes the rib and writes the STL. `src/core/plate.ts` writes the 3MF plate.
- `src/presets.ts` holds the library shapes, including the five ribs of the MakerWorld Ceramic Rib Tool Set.
- `src/ui/` holds the React panels and the three.js views.
