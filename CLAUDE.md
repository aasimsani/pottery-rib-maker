# Pottery Rib Maker

Run `npm test` (Vitest) and `npm run build` before you commit. See README.md for how the pieces fit together.

## Design Context

The app is a sibling of `../pottery-stencil-maker` (Pottery Stencil Maker). It shares that app's users, voice, palette, and
layout, so follow the Design Context in that repo's CLAUDE.md. The users are potters who own a 3D printer. They want a
rib that throws the same pot every time, and an STL file they trust to print the first time.

## Code map

- `src/core/profile.ts` draws a smooth curve through the pot measurements.
- `src/core/rib.ts` turns the curve into the rib outline, the height marks, the finger hole, and the print check.
- `src/core/photo.ts` traces a pot's outline from a photo and flags photos that trace badly. `src/ui/PhotoRib.tsx` is the step-by-step modal around it.
- `src/core/mesh.ts` extrudes the rib and writes the STL. `src/core/plate.ts` writes the 3MF plate.
- `src/presets.ts` holds the library shapes, including the five ribs of the MakerWorld Ceramic Rib Tool Set.
- `src/ui/` holds the React panels and the three.js views.
