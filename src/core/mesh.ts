import * as THREE from 'three';
import type { Rib } from './rib';

// box() returns the 12 triangles of a closed box, wound so every normal points out.
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const c = (i: number) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  return faces.flatMap(([a, b, cc, d]) => [...c(a), ...c(b), ...c(cc), ...c(a), ...c(cc), ...c(d)]);
}

// prism() returns the triangles of a convex polygon, wound anticlockwise, raised from z0 to z1.
export function prism(poly: [number, number][], z0: number, z1: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < poly.length - 1; i++) {
    const [a, b, c] = [poly[0], poly[i], poly[i + 1]];
    out.push(a[0], a[1], z1, b[0], b[1], z1, c[0], c[1], z1, a[0], a[1], z0, c[0], c[1], z0, b[0], b[1], z0);
  }
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    out.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z0, b[0], b[1], z1, a[0], a[1], z1);
  });
  return out;
}

// ribTris() builds the rib as triangles, 9 numbers each. The body is the outline extruded thick mm,
// with the finger hole cut through. Each mark is a box that stands emboss mm proud of the top face
// and sinks 0.2 mm into it, so the slicer merges it with the body instead of balancing it on top.
export function ribTris(rib: Rib, thick: number, emboss: number): Float32Array {
  const shape = new THREE.Shape(rib.outline.map(([x, y]) => new THREE.Vector2(x, y)));
  if (rib.hole) {
    const { x, y, r } = rib.hole, n = 64;
    shape.holes.push(new THREE.Path(Array.from({ length: n }, (_, i) => new THREE.Vector2(x + r * Math.cos((2 * Math.PI * i) / n), y + r * Math.sin((2 * Math.PI * i) / n)))));
  }
  const body = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  const pos = body.attributes.position.array as Float32Array;
  body.dispose();
  const marks = emboss > 0 ? rib.marks.flatMap((m) => [
    ...m.rects.flatMap(([x0, y0, x1, y1]) => box(x0, y0, thick - 0.2, x1, y1, thick + emboss)),
    ...(m.polys ?? []).flatMap((p) => prism(p, thick - 0.2, thick + emboss)),
  ]) : [];
  const out = new Float32Array(pos.length + marks.length);
  out.set(pos); out.set(marks, pos.length);
  return out;
}

// ribSTL() writes the triangles as a binary STL, turned rot degrees about z to fit the bed.
export function ribSTL(tris: Float32Array, rot: number): ArrayBuffer {
  const nt = tris.length / 9, out = new DataView(new ArrayBuffer(84 + nt * 50));
  const t = (rot * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  out.setUint32(80, nt, true);
  for (let i = 0, o = 84; i < nt; i++, o += 50) {
    const v = Array.from(tris.subarray(i * 9, i * 9 + 9));
    for (let k = 0; k < 9; k += 3) { const x = v[k], y = v[k + 1]; v[k] = x * c - y * s; v[k + 1] = x * s + y * c; }
    const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2], vx = v[6] - v[0], vy = v[7] - v[1], vz = v[8] - v[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
    out.setFloat32(o, nx / nl, true); out.setFloat32(o + 4, ny / nl, true); out.setFloat32(o + 8, nz / nl, true);
    for (let k = 0; k < 9; k++) out.setFloat32(o + 12 + k * 4, v[k], true);
  }
  return out.buffer;
}
