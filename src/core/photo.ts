// This module traces a pot's profile from a side-on photo against a plain background, such as a product
// shot from a shop. It is ported from the Pottery Stencil Maker's photo tracer.
import { otsuThreshold } from './threshold';
import { foldsAt, sampleProfile, type ProfilePoint } from './profile';

// backgroundColor() is the median colour of the image's border pixels.
function backgroundColor(rgba: ArrayLike<number>, w: number, h: number): number[] {
  const border: number[][] = [[], [], []];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) for (let c = 0; c < 3; c++) border[c].push(rgba[(y * w + x) * 4 + c]);
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) for (let c = 0; c < 3; c++) border[c].push(rgba[(y * w + x) * 4 + c]);
  return border.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

// autoTolerance() picks the background tolerance with Otsu's method on each pixel's colour
// distance from the background. The background sits near 0 and the pot far out, and a soft
// shadow lands in between. The cutoff falls in the widest gap, which usually sits between
// the shadow and the pot.
export function autoTolerance(rgba: ArrayLike<number>, w: number, h: number): number {
  const bg = backgroundColor(rgba, w, h), hist = new Array(256).fill(0);
  for (let k = 0; k < w * h; k++) {
    hist[Math.min(255, Math.round(Math.hypot(rgba[k * 4] - bg[0], rgba[k * 4 + 1] - bg[1], rgba[k * 4 + 2] - bg[2])))]++;
  }
  return otsuThreshold(hist);
}

// segment() separates the pot from the background. Pixels further than tol from it (RGB distance) count as the pot.
// Only the largest connected region survives, which drops dust, shadows at the edges and other clutter.
export function segment(rgba: ArrayLike<number>, w: number, h: number, tol: number): Uint8Array {
  const bg = backgroundColor(rgba, w, h);
  const n = w * h, fg = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const dr = rgba[k * 4] - bg[0], dg = rgba[k * 4 + 1] - bg[1], db = rgba[k * 4 + 2] - bg[2];
    fg[k] = dr * dr + dg * dg + db * db > tol * tol ? 1 : 0;
  }
  const label = new Int32Array(n), queue = new Int32Array(n);
  let best = 0, bestSize = 0, next = 0;
  for (let k = 0; k < n; k++) {
    if (!fg[k] || label[k]) continue;
    const id = ++next;
    let tail = 0;
    label[k] = id; queue[tail++] = k;
    for (let hd = 0; hd < tail; hd++) {
      const p = queue[hd], x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < n && fg[q] && !label[q]) { label[q] = id; queue[tail++] = q; }
      }
    }
    if (tail > bestSize) { bestSize = tail; best = id; }
  }
  const out = new Uint8Array(n);
  for (let k = 0; k < n; k++) out[k] = label[k] === best && best ? 1 : 0;
  return out;
}

export interface Trace {
  /** The pot's outside, from base to rim, scaled so the rim sits at the height you throw. */
  profile: ProfilePoint[];
  /** The pot's centre line, top row and bottom row, in image pixels, and each row's left and right edge. */
  axis: number; top: number; bottom: number; left: Int32Array; right: Int32Array;
  /** mm per pixel. */
  scale: number;
}

// traceProfile() measures the pot row by row. The centre line comes from the bottom 15% of the pot,
// where a handle rarely reaches. Each row's radius is the smaller of its two half-widths, so a handle
// on one side doesn't count. height (mm) sets the scale, because a photo from the internet has none.
// It keeps only the rows where the outline bends by more than detail mm, so a straight wall becomes
// two points and a carination becomes a corner.
export function traceProfile(mask: Uint8Array, w: number, h: number, height: number, o: { detail: number; minGap: number }): Trace {
  const left = new Int32Array(h).fill(-1), right = new Int32Array(h).fill(-1);
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (left[y] < 0) left[y] = x; right[y] = x + 1; }
    if (left[y] >= 0) { if (top < 0) top = y; bottom = y; }
  }
  if (top < 0 || bottom - top < 4) throw new Error('No pot found in the photo. Try a photo with a plainer background, or change the tolerance.');

  const centres: number[] = [];
  for (let y = Math.round(bottom - 0.15 * (bottom - top)); y <= bottom; y++) if (left[y] >= 0) centres.push((left[y] + right[y]) / 2);
  const axis = centres.sort((a, b) => a - b)[centres.length >> 1];
  const radius = (y: number) => (left[y] < 0 ? 0 : Math.max(0, Math.min(axis - left[y], right[y] - axis)));
  // A 5-row median smooths out pixel noise and small glaze drips along the edge.
  const smooth = (y: number) => {
    const rs = [];
    for (let k = Math.max(top, y - 2); k <= Math.min(bottom, y + 2); k++) rs.push(radius(k));
    return rs.sort((a, b) => a - b)[rs.length >> 1];
  };
  const scale = height / (bottom - top);
  const dense = Array.from({ length: bottom - top + 1 }, (_, i) => ({ r: smooth(bottom - i) * scale, z: i * scale }));

  // A coarser detail drops more points. The loop widens it until the curve rises everywhere,
  // because the rib has to pull away from the pot sideways.
  for (let tol = o.detail; ; tol *= 1.5) {
    const kept = spaced(simplify(dense, tol), dense, o.minGap);
    const profile = kept.map((k, i): ProfilePoint => {
      const p = { z: Math.round(dense[k].z * 10) / 10, d: Math.round(dense[k].r * 20) / 10 };
      return i > 0 && i < kept.length - 1 && bend(dense, k, 3 / scale) > 15 ? { ...p, sharp: true } : p;
    });
    if (foldsAt(sampleProfile(profile)) < 0 || tol > height) return { profile, axis, top, bottom, left, right, scale };
  }
}

// simplify() is the Ramer–Douglas–Peucker line simplification. It returns the indices of the points
// to keep, so that no dropped point strays more than tol from the line through the kept ones.
function simplify(pts: { r: number; z: number }[], tol: number): number[] {
  const keep = new Set([0, pts.length - 1]);
  const walk = (a: number, b: number) => {
    let worst = -1, far = tol;
    const dz = pts[b].z - pts[a].z, dr = pts[b].r - pts[a].r, len = Math.hypot(dz, dr) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dr * (pts[i].z - pts[a].z) - dz * (pts[i].r - pts[a].r)) / len;
      if (d > far) { far = d; worst = i; }
    }
    if (worst > 0) { keep.add(worst); walk(a, worst); walk(worst, b); }
  };
  walk(0, pts.length - 1);
  return [...keep].sort((a, b) => a - b);
}

// spaced() drops kept points that sit closer than minGap mm above the last one, as the drawing
// guards do. The rim always stays, so a point just below it goes instead.
function spaced(kept: number[], pts: { z: number }[], minGap: number): number[] {
  const out = [kept[0]];
  for (const k of kept.slice(1)) if (pts[k].z - pts[out[out.length - 1]].z >= minGap) out.push(k);
  const rim = kept[kept.length - 1];
  if (out[out.length - 1] !== rim) { while (out.length > 1 && pts[rim].z - pts[out[out.length - 1]].z < minGap) out.pop(); out.push(rim); }
  return out;
}

// bend() is how far the outline turns at point k, in degrees, measured over span points either side.
// A smooth curve turns a few degrees over a few mm, and a corner turns by its full angle.
function bend(pts: { r: number; z: number }[], k: number, span: number): number {
  const s = Math.max(1, Math.round(span)), a = pts[Math.max(0, k - s)], b = pts[k], c = pts[Math.min(pts.length - 1, k + s)];
  const t1 = Math.atan2(b.z - a.z, b.r - a.r), t2 = Math.atan2(c.z - b.z, c.r - b.r);
  return Math.abs(((t2 - t1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
}

export interface PhotoIssue { id: 'edge' | 'above' | 'small' | 'tilted' | 'background'; message: string }

// photoIssues() looks for the problems that the photo guide warns about, and says what to do about each.
export function photoIssues(mask: Uint8Array, w: number, h: number, t: Trace): PhotoIssue[] {
  const out: PhotoIssue[] = [];
  let edge = false, area = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    area++;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
  }
  const rows = t.bottom - t.top + 1, width = (y: number) => (t.left[y] < 0 ? 0 : t.right[y] - t.left[y]);
  if (edge) out.push({ id: 'edge', message: 'The pot runs off the edge of the photo, so part of it is missing. Use a photo with space all round the pot.' });
  // Seen from above, the rim is an oval, so the outline's top rows start narrow and widen fast.
  let below = 0;
  for (let y = t.top; y <= t.top + Math.max(2, rows * 0.06); y++) below = Math.max(below, width(y));
  if (width(t.top + 1) < 0.6 * below) out.push({ id: 'above', message: 'The rim looks like an oval, so the photo was taken from above. The oval adds height and rounds the rim. Use a photo taken from the side, level with the middle of the pot.' });
  if (rows < 120) out.push({ id: 'small', message: `The pot is only ${rows} px tall in this photo, so each pixel is ${t.scale.toFixed(1)} mm of clay. Use a bigger photo for a finer trace.` });
  // A tilted pot's rim sits off-centre from its base. The top rows are checked, because a handle rarely reaches them.
  const tops: number[] = [];
  for (let y = t.top; y <= t.top + rows * 0.08; y++) if (t.left[y] >= 0) tops.push((t.left[y] + t.right[y]) / 2);
  const rimCentre = tops.sort((a, b) => a - b)[tops.length >> 1], rimHalf = width(t.top + Math.round(rows * 0.04)) / 2;
  if (rimHalf > 0 && Math.abs(rimCentre - t.axis) > 0.1 * rimHalf) {
    out.push({ id: 'tilted', message: 'The rim sits off-centre from the base, so the pot or the camera was tilted. Straighten the photo, or use one taken square on.' });
  }
  if (area > 0.6 * w * h) out.push({ id: 'background', message: 'Most of the photo counts as pot, so the background may be busy or close to the pot\'s colour. Use a photo with plain background round the pot, or raise the tolerance.' });
  return out;
}
