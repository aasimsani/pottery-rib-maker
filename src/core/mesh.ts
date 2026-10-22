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

type Pt = [number, number];

// insetLoop() moves a closed loop, wound anticlockwise, d mm inwards. It steps 0.1 mm at a time.
// When a step would turn an edge back on itself, the edge comes out first and its two neighbours
// meet where their lines cross, so a sharp corner closes up into one point instead of folding over.
// map[i] is the inset point that the loop's point i became.
export function insetLoop(loop: Pt[], d: number): { pts: Pt[]; map: number[] } {
  let pts = loop.map((p): Pt => [p[0], p[1]]), map = loop.map((_, i) => i);
  const normal = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  // Each point moves to where its two edges meet once both move step mm in.
  const move = (step: number) => pts.map((p, i): Pt => {
    const n = pts.length, n1 = normal(pts[(i + n - 1) % n], p), n2 = normal(p, pts[(i + 1) % n]);
    const k = step / Math.max(1e-9, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
  // cross() is where the line through a and b meets the line through c and e, or null when they run parallel.
  const cross = (a: Pt, b: Pt, c: Pt, e: Pt): Pt | null => {
    const r = [b[0] - a[0], b[1] - a[1]], s = [e[0] - c[0], e[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  };
  for (let done = 0; done < d - 1e-9;) {
    const step = Math.min(0.1, d - done);
    done += step;
    for (;;) {
      const next = move(step), n = pts.length;
      const i = n > 3 ? next.findIndex((q, i) => {
        const j = (i + 1) % n;
        return (pts[j][0] - pts[i][0]) * (next[j][0] - q[0]) + (pts[j][1] - pts[i][1]) * (next[j][1] - q[1]) <= 1e-12;
      }) : -1;
      if (i < 0) { pts = next; break; }
      const j = (i + 1) % n, keep = i > j ? i - 1 : i;
      const mid: Pt = [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
      const x = cross(pts[(i + n - 1) % n], pts[i], pts[j], pts[(j + 1) % n]);
      // Lines that cross far away are nearly parallel, and the middle of the edge is the better point.
      pts[i] = x && Math.hypot(x[0] - mid[0], x[1] - mid[1]) < 10 * step + Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) ? x : mid;
      pts.splice(j, 1);
      map = map.map((v) => (v === j ? keep : v > j ? v - 1 : v));
    }
  }
  return { pts, map };
}

// ribBody() builds the rib's body, with the edge profile that rib.bevel sets all round the outline.
// The body is a stack of layers, each the outline inset by a set amount. From the bed up they are the
// round at the foot, the straight land, and the top face with the bevel in from the edge. The finger
// hole goes straight through.
function ribBody(rib: Rib, thick: number): number[] {
  const out: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c);
  let loop = rib.outline.filter((p, i, o) => Math.hypot(p[0] - o[(i + 1) % o.length][0], p[1] - o[(i + 1) % o.length][1]) > 1e-6);
  if (THREE.ShapeUtils.isClockWise(loop.map(([x, y]) => new THREE.Vector2(x, y)))) loop = [...loop].reverse();
  const { fillet, land, run } = rib.bevel;
  const rows = [
    ...[0, 30, 60, 90].map((a) => { const t = (a * Math.PI) / 180; return { z: fillet * (1 - Math.cos(t)), d: fillet * (1 - Math.sin(t)) }; }),
    { z: land, d: 0 }, { z: thick, d: run },
  ].filter((r, i, rs) => i === 0 || r.z > rs[i - 1].z + 1e-6);
  const layers = rows.map((r) => ({ z: r.z, ...insetLoop(loop, r.d) }));
  const at = (l: (typeof layers)[number], k: number) => [l.pts[k][0], l.pts[k][1], l.z];
  // Walls join each layer to the next. Where corners merged, a wall quad narrows to a triangle.
  for (let li = 1; li < layers.length; li++) {
    const A = layers[li - 1], B = layers[li];
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length, a0 = A.map[i], a1 = A.map[j], b0 = B.map[i], b1 = B.map[j];
      if (a0 !== a1) tri(at(A, a0), at(A, a1), at(B, b1));
      if (b0 !== b1) tri(at(A, a0), at(B, b1), at(B, b0));
    }
  }
  // The hole runs clockwise, so the plastic is on its left like the outline's.
  const n = 64, hole: Pt[] = rib.hole ? Array.from({ length: n }, (_, i) => {
    const t = (-2 * Math.PI * i) / n;
    return [rib.hole!.x + rib.hole!.r * Math.cos(t), rib.hole!.y + rib.hole!.r * Math.sin(t)];
  }) : [];
  hole.forEach((p, i) => { const q = hole[(i + 1) % n]; tri([...p, 0], [...q, 0], [...q, thick]); tri([...p, 0], [...q, thick], [...p, thick]); });
  // The bottom face points down and the top face points up. Earcut winds every triangle the same way,
  // so the whole face flips by its total area, which a nearly flat triangle can't get wrong.
  for (const [layer, up] of [[layers[0], false], [layers[layers.length - 1], true]] as const) {
    const all = [...layer.pts, ...hole];
    const faces = THREE.ShapeUtils.triangulateShape(layer.pts.map(([x, y]) => new THREE.Vector2(x, y)), hole.length ? [hole.map(([x, y]) => new THREE.Vector2(x, y))] : [])
      .map((f) => f.map((k) => [all[k][0], all[k][1], layer.z]));
    const area = faces.reduce((s, [a, b, c]) => s + (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), 0);
    for (const [a, b, c] of faces) if (area > 0 === up) tri(a, b, c); else tri(a, c, b);
  }
  return out;
}

// ribParts() builds the rib as two sets of triangles, 9 numbers each. The body has the edge profile
// and the finger hole. Each mark is a box that stands emboss mm proud of the top face and sinks
// 0.2 mm into it, so the slicer merges it with the body instead of balancing it on top. The marks
// come apart from the body so a slicer can print them in a second filament.
export function ribParts(rib: Rib, thick: number, emboss: number): { body: Float32Array; marks: Float32Array } {
  const marks = emboss > 0 ? rib.marks.flatMap((m) => [
    ...m.rects.flatMap(([x0, y0, x1, y1]) => box(x0, y0, thick - 0.2, x1, y1, thick + emboss)),
    ...(m.polys ?? []).flatMap((p) => prism(p, thick - 0.2, thick + emboss)),
  ]) : [];
  return { body: new Float32Array(ribBody(rib, thick)), marks: new Float32Array(marks) };
}

// ribTris() builds the whole rib, the body and its marks, as one set of triangles.
export function ribTris(rib: Rib, thick: number, emboss: number): Float32Array {
  const { body, marks } = ribParts(rib, thick, emboss);
  const out = new Float32Array(body.length + marks.length);
  out.set(body); out.set(marks, body.length);
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
