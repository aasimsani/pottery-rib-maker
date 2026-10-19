import type { Rib } from '../core/rib';

interface Props { rib: Rib; shrink: number; mini?: boolean; label?: string }

const f1 = (v: number) => v.toFixed(0);

// RibView draws the rib flat, as it prints, beside a cross-section of the thrown pot it shapes.
// The drawing is in mm with y pointing up, so the group flips the SVG's downward y.
export function RibView({ rib, shrink, mini, label }: Props) {
  if (!rib.outline.length) return <div className="rib-svg empty">No rib to draw yet.</div>;
  const { pot, rmin, height: top, rim } = rib;
  const rmax = Math.max(...pot.map((p) => p.r)), pad = mini ? 4 : 10;
  const x0 = -rmax - pad, x1 = rmin + rib.width + pad + (mini ? 0 : 26), y0 = -pad - (mini ? 0 : 8), y1 = top + pad;
  const Y = (y: number) => top - y; // the flip for text, which must not be mirrored
  const potPath = 'M' + [...pot.map((p) => `${p.r},${p.z}`), ...[...pot].reverse().map((p) => `${-p.r},${p.z}`)].join(' L') + ' Z';
  const ribPath = 'M' + rib.outline.map(([x, y]) => `${x + rmin},${y}`).join(' L') + ' Z'
    + (rib.hole ? ` M${rib.hole.x + rmin + rib.hole.r},${rib.hole.y} a${rib.hole.r},${rib.hole.r} 0 1 0 ${-2 * rib.hole.r},0 a${rib.hole.r},${rib.hole.r} 0 1 0 ${2 * rib.hole.r},0 Z` : '');
  const fired = 1 - shrink / 100, backX = rmin + rib.width + 4;
  return (
    <svg className={mini ? 'rib-svg mini' : 'rib-svg'} viewBox={`${x0} ${Y(y1)} ${x1 - x0} ${y1 - y0}`} role="img" aria-label={label}>
      <g transform={`translate(0 ${top}) scale(1 -1)`}>
        {!mini && <line className="wheel" x1={x0} x2={x1} y1={0} y2={0} />}
        <path className="pot" d={potPath} />
        <path className="rib" d={ribPath} fillRule="evenodd" />
        {rib.marks.map((m, i) => m.rects.map(([a, b, c, d], j) => <rect key={`${i}-${j}`} className="mark" x={a + rmin} y={b} width={c - a} height={d - b} />))}
      </g>
      {!mini && (
        <g className="dims">
          <line x1={backX} x2={backX + 6} y1={Y(rim)} y2={Y(rim)} />
          <line x1={backX + 3} x2={backX + 3} y1={Y(rim)} y2={Y(0)} />
          <line x1={backX} x2={backX + 6} y1={Y(0)} y2={Y(0)} />
          <text x={backX + 6} y={Y(rim / 2) - 2}>{f1(rim)} mm</text>
          {shrink > 0 && <text x={backX + 6} y={Y(rim / 2) + 4} className="sub">fired {f1(rim * fired)}</text>}
          <text x={0} y={Y(0) + 7} textAnchor="middle">Ø {f1(2 * pot[0].r)}</text>
          <text x={rmin + rib.width / 2} y={Y(0) + 7} textAnchor="middle">{f1(rib.width)} mm</text>
        </g>
      )}
    </svg>
  );
}
