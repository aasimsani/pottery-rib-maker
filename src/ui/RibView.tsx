import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Rib } from '../core/rib';
import type { ProfilePoint } from '../core/profile';

/** What the drawing needs to edit the pot. Heights and diameters are the thrown pot's, in mm. */
export interface EditProps {
  profile: ProfilePoint[];
  selected: number | null;
  snap: number;
  onSelect: (i: number | null) => void;
  /** Runs before a drag, a new point, or a key move, so Undo can return to the shape before it. */
  onBegin: () => void;
  onMove: (i: number, z: number, d: number) => void;
  /** Adds a point and returns its index, or null when the guards refuse it. */
  onInsert: (z: number, d: number) => number | null;
  onRemove: (i: number) => void;
  onCorner: (i: number) => void;
}

interface Props {
  rib: Rib; shrink: number; mini?: boolean; label?: string; edit?: EditProps;
  /** The drying shrinkage, in %. With it set, the drawing outlines the bone-dry pot too. */
  dryShrink?: number;
}

const f1 = (v: number) => v.toFixed(0);

// RibView draws the rib flat, as it prints, beside a cross-section of the thrown pot it shapes.
// The drawing is in mm with y pointing up, so the group flips the SVG's downward y. With edit set,
// the measured points become handles that you drag, and a ＋ between two points adds one there.
export function RibView({ rib, shrink, dryShrink, mini, label, edit }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ i: number; box: string } | null>(null);
  const editRef = useRef(edit);
  editRef.current = edit;

  const { pot, rmin, height: top, rim } = rib;
  const z0 = edit?.profile[0].z ?? 0;
  // toPot() turns a pointer position into the thrown pot's height and diameter.
  const toPot = (clientX: number, clientY: number) => {
    const m = svg.current!.getScreenCTM()!.inverse(), p = new DOMPoint(clientX, clientY).matrixTransform(m);
    return { z: top - p.y + z0, d: 2 * Math.abs(p.x) };
  };

  // While a drag runs, the window follows the pointer, because the handle under it can re-render.
  useEffect(() => {
    if (!drag) return;
    const move = (e: globalThis.PointerEvent) => { const { z, d } = toPot(e.clientX, e.clientY); editRef.current?.onMove(drag.i, z, d); };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  });

  if (!pot.length) return <div className="rib-svg empty">No rib to draw yet.</div>;
  const rmax = Math.max(...pot.map((p) => p.r)), width = rib.outline.length ? rib.width : rmax - rmin, pad = mini ? 4 : 10;
  const x0 = -rmax - pad - (mini ? 0 : 16), x1 = rmin + width + pad + (mini ? 0 : 26), y0 = -pad - (mini ? 0 : 8), y1 = top + pad;
  const Y = (y: number) => top - y; // the flip for anything that must not be mirrored
  // The view box holds still during a drag, so the drawing doesn't rescale under the pointer.
  const box = drag?.box ?? `${x0} ${Y(y1)} ${x1 - x0} ${y1 - y0}`;
  const potPath = 'M' + [...pot.map((p) => `${p.r},${p.z}`), ...[...pot].reverse().map((p) => `${-p.r},${p.z}`)].join(' L') + ' Z';
  const ribPath = rib.outline.length ? 'M' + rib.outline.map(([x, y]) => `${x + rmin},${y}`).join(' L') + ' Z'
    + (rib.hole ? ` M${rib.hole.x + rmin + rib.hole.r},${rib.hole.y} a${rib.hole.r},${rib.hole.r} 0 1 0 ${-2 * rib.hole.r},0 a${rib.hole.r},${rib.hole.r} 0 1 0 ${2 * rib.hole.r},0 Z` : '') : '';
  const fired = 1 - shrink / 100, backX = rmin + rib.width + 4;
  // Each stage the pot passes through, as its outline shrinks about the centre of the base.
  const stages = [
    ...(dryShrink ? [{ name: 'dry', f: 1 - dryShrink / 100 }] : []),
    ...(shrink > 0 ? [{ name: 'fired', f: fired }] : []),
  ];
  const outline = (f: number) => 'M' + [...pot.map((p) => `${p.r * f},${p.z * f}`), ...[...pot].reverse().map((p) => `${-p.r * f},${p.z * f}`)].join(' L');
  // The top row of numbers gets a header over each column. The headers are on screen only, not printed.
  const rows = rib.marks.filter((m) => m.kind === 'label' && m.groups);
  const topRow = rows.reduce<(typeof rows)[number] | undefined>((a, m) => (!a || m.y > a.y ? m : a), undefined);
  const headers = topRow && topRow.groups!.length > 1 ? ['wet', ...stages.map((st) => st.name)].slice(0, topRow.groups!.length) : [];
  const hr = (x1 - x0) / 75; // handle radius, about 6 px whatever the pot's size

  // focusHandle() moves keyboard focus to handle i once React has drawn it, so the arrow keys,
  // Delete, and C act on the point you just clicked, dragged, or added.
  const focusHandle = (i: number) => requestAnimationFrame(() => svg.current?.querySelectorAll<SVGGElement>('.handle')[i]?.focus());
  const begin = (i: number, e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    edit!.onSelect(i);
    setDrag({ i, box });
    focusHandle(i);
  };
  const onKey = (i: number, e: KeyboardEvent) => {
    const q = edit!.profile[i], step = e.shiftKey ? 5 : edit!.snap || 0.5;
    const moves: Record<string, [number, number]> = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowRight: [0, 2 * step], ArrowLeft: [0, -2 * step] };
    if (moves[e.key]) { e.preventDefault(); edit!.onBegin(); edit!.onMove(i, q.z + moves[e.key][0], q.d + moves[e.key][1]); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); edit!.onBegin(); edit!.onRemove(i); }
    else if (e.key === 'c' || e.key === 'C') { edit!.onBegin(); edit!.onCorner(i); }
  };

  return (
    <svg ref={svg} className={`rib-svg${mini ? ' mini' : ''}${edit ? ' editing' : ''}`} viewBox={box} role={edit ? 'group' : 'img'} aria-label={label}
      onPointerDown={edit && ((e) => { if (e.target === e.currentTarget || (e.target as Element).classList.contains('backdrop')) edit.onSelect(null); })}
      onDoubleClick={edit && ((e) => {
        if ((e.target as Element).closest('.handles')) return;
        const { z, d } = toPot(e.clientX, e.clientY);
        edit.onBegin();
        const i = edit.onInsert(z, d);
        if (i !== null) { edit.onSelect(i); focusHandle(i); }
      })}>
      <g transform={`translate(0 ${top}) scale(1 -1)`}>
        {!mini && <line className="wheel" x1={x0} x2={x1} y1={0} y2={0} />}
        <path className="pot" d={potPath} />
        {ribPath && <path className="rib" d={ribPath} fillRule="evenodd" />}
        {!mini && stages.map((st) => <path key={st.name} className={`stage ${st.name}`} d={outline(st.f)} />)}
        {rib.marks.map((m, i) => m.rects.map(([a, b, c, d], j) => <rect key={`${i}-${j}`} className="mark" x={a + rmin} y={b} width={c - a} height={d - b} />))}
      </g>
      {!mini && (
        <g className="dims stages">
          <text x={-pot[pot.length - 1].r - 2} y={Y(rim) + 1.5} textAnchor="end">wet {f1(rim)}</text>
          {stages.map((st) => (
            <text key={st.name} className={st.name} x={-pot[pot.length - 1].r * st.f - 2} y={Y(rim * st.f) + 1.5} textAnchor="end">{st.name} {f1(rim * st.f)}</text>
          ))}
          {topRow && headers.map((h, c) => {
            const g = topRow.groups![c], gx = (Math.min(...g.map((r) => r[0])) + Math.max(...g.map((r) => r[2]))) / 2;
            return <text key={h} className="col-head" x={gx + rmin} y={Y(Math.max(...g.map((r) => r[3]))) - 2} textAnchor="middle">{h}</text>;
          })}
        </g>
      )}
      {!mini && rib.outline.length > 0 && (
        <g className="dims">
          <line x1={backX} x2={backX + 6} y1={Y(rim)} y2={Y(rim)} />
          <line x1={backX + 3} x2={backX + 3} y1={Y(rim)} y2={Y(0)} />
          <line x1={backX} x2={backX + 6} y1={Y(0)} y2={Y(0)} />
          <text x={backX + 6} y={Y(rim / 2) - 2}>throw to</text>
          <text x={backX + 6} y={Y(rim / 2) + 4}>{f1(rim)} mm</text>
          <text x={0} y={Y(0) + 7} textAnchor="middle">Ø {f1(2 * pot[0].r)}</text>
          <text x={rmin + rib.width / 2} y={Y(0) + 7} textAnchor="middle">{f1(rib.width)} mm</text>
        </g>
      )}
      {edit && (
        <g className="handles">
          {edit.profile.slice(0, -1).map((q, i) => {
            // A ＋ sits on the curve halfway up each gap that has room for one more point.
            const next = edit.profile[i + 1], mid = (q.z + next.z) / 2 - z0;
            if (next.z - q.z < 4 || drag) return null;
            const s = pot.reduce((a, b) => (Math.abs(b.z - mid) < Math.abs(a.z - mid) ? b : a));
            return (
              <g key={`add-${i}`} className="add" transform={`translate(${s.r} ${Y(s.z)})`} role="button" tabIndex={-1} aria-label="Add a point here"
                onPointerDown={(e) => { edit.onBegin(); const n = edit.onInsert(s.z + z0, 2 * s.r); if (n !== null) begin(n, e); }}>
                <circle r={hr * 1.1} />
                <path d={`M${-hr * 0.6},0 H${hr * 0.6} M0,${-hr * 0.6} V${hr * 0.6}`} />
              </g>
            );
          })}
          {edit.profile.map((q, i) => {
            const x = q.d / 2, y = Y(q.z - z0), on = edit.selected === i;
            const name = i === 0 ? 'Base' : i === edit.profile.length - 1 ? 'Rim' : `Point ${i}`;
            return (
              <g key={i} className={`handle${on ? ' on' : ''}`} transform={`translate(${x} ${y})`} tabIndex={0} role="button"
                aria-label={`${name}: ${q.z} mm up, Ø ${q.d} mm${q.sharp ? ', corner' : ''}. Arrow keys move it, Delete removes it, C makes it a corner.`}
                aria-pressed={on} onPointerDown={(e) => { edit.onBegin(); begin(i, e); }} onFocus={() => edit.onSelect(i)} onKeyDown={(e) => onKey(i, e)}>
                <circle className="hit" r={hr * 2} />
                {q.sharp ? <rect x={-hr} y={-hr} width={2 * hr} height={2 * hr} transform="rotate(45)" /> : <circle r={hr} />}
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
