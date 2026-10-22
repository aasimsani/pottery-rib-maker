import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { Settings } from '../state';
import type { Rib } from '../core/rib';
import type { PlatePart } from '../core/plate';
import type { WheelMode } from './Wheel3D';
import { RibView, type EditProps } from './RibView';
import { useDialog } from './dialog';
import { PLATE_GAP } from './PlatePanel';

// three.js is about 600 kB, so the 3D views load after the rest of the page.
const Wheel3D = lazy(() => import('./Wheel3D'));
const PrintView = lazy(() => import('./PrintView'));

type Mode = WheelMode | 'print';

interface Props {
  s: Settings; rib: Rib; tris: Float32Array;
  edit: EditProps & { canUndo: boolean; notice: string; onUndo: () => void; onStartOver: () => void };
  /** The exact file Download STL saves, or null when the rib doesn't fit the bed. */
  print: PlatePart | null;
  plate: PlatePart[];
  onStl: () => void; onAddToPlate: () => void; onSvg: (svg: SVGSVGElement) => void;
}

const f0 = (v: number) => v.toFixed(0);

export function Preview({ s, rib, tris, print, plate, edit, onStl, onAddToPlate, onSvg }: Props) {
  const [mode, setMode] = useState<Mode>('wheel');
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDivElement>(null), svgHost = useRef<HTMLDivElement>(null);
  useDialog(dialog, expanded, () => setExpanded(false));

  const ok = rib.outline.length > 0;
  const sel = edit.selected !== null ? edit.profile[edit.selected] : undefined;
  const fired = 1 - s.shrink / 100, widest = ok ? 2 * Math.max(...rib.pot.map((p) => p.r)) : 0;
  const label = ok ? `${s.name}: a rib ${f0(rib.width)} by ${f0(rib.height)} mm that throws a pot ${f0(rib.rim)} mm tall and ${f0(widest)} mm across.` : 'No rib yet';
  const bedParts = useMemo(() => (print ? [...plate.map((p) => ({ stl: p.stl })), { stl: print.stl, current: true }] : []), [plate, print]);

  const view = (className: string) => {
    if (!ok) return <div className={`${className} loading`}>Fix the pot measurements to see it.</div>;
    const fallback = <div className={`${className} loading`}>Loading 3D…</div>;
    if (mode === 'print') return print
      ? <Suspense fallback={fallback}><PrintView parts={bedParts} bedW={s.bedW} bedD={s.bedD} gap={PLATE_GAP} className={className} label={`Print plate: this rib${plate.length ? ` and ${plate.length} more` : ''} on a ${s.bedW} × ${s.bedD} mm bed`} /></Suspense>
      : <div className={`${className} loading`}>No print file: the rib doesn't fit the bed.</div>;
    return <Suspense fallback={fallback}><Wheel3D rib={rib} tris={tris} thick={s.thick} shrink={s.shrink} mode={mode} className={className} label={`3D view of ${label}`} /></Suspense>;
  };
  const modeToggle = (
    <div className="seg" role="group" aria-label="3D view">
      {([['wheel', 'On the wheel'], ['fired', 'Fired pot'], ['print', 'Print plate']] as [Mode, string][]).map(([m, text]) => (
        <button key={m} aria-pressed={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{text}</button>
      ))}
    </div>
  );
  const hint = mode === 'print'
    ? (plate.length ? `This rib is in teal, beside the ${plate.length} on the plate.` : 'The exact STL that Download STL saves, on the bed.')
    : mode === 'fired' ? `The pot after firing, ${s.shrink}% smaller than it was thrown.` : 'Drag to rotate, scroll to zoom.';

  const errors = rib.checks.filter((c) => c.level === 'error').length, warns = rib.checks.filter((c) => c.level === 'warn').length;
  const columns = { none: '', wet: 'wet', 'wet-fired': 'wet / fired', 'wet-dry-fired': 'wet / dry / fired' }[s.scaleNumbers];
  const tickInfo = !s.scale ? 'no height scale'
    : `ticks every ${s.units === 'in' ? '¼"' : '5 mm'}${columns ? `, numbered ${columns} in ${{ mm: 'mm', cm: 'cm', in: 'inches' }[s.units]}` : ''}`;

  return (
    <section className="panel preview" aria-labelledby="preview-title">
      <div className="previews">
        <div>
          <div className="piece-head">
            <h2 id="preview-title">Rib, as printed</h2>
            <div className="draw-tools" role="toolbar" aria-label="Shape tools">
              <button className="secondary small" onClick={edit.onUndo} disabled={!edit.canUndo} title="Undo (⌘Z or Ctrl+Z)">Undo</button>
              <button className="secondary small" aria-pressed={!!sel?.sharp} disabled={!sel || edit.selected === 0 || edit.selected === edit.profile.length - 1}
                onClick={() => { edit.onBegin(); edit.onCorner(edit.selected!); }}>Corner</button>
              <button className="secondary small" disabled={!sel || edit.selected === 0 || edit.profile.length <= 2}
                onClick={() => { edit.onBegin(); edit.onRemove(edit.selected!); }}>Delete point</button>
              <button className="secondary small" onClick={edit.onStartOver} title="Start from a plain cylinder at this size">Start over</button>
            </div>
          </div>
          <div ref={svgHost}><RibView rib={rib} shrink={s.shrink} dryShrink={s.scale && s.scaleNumbers === 'wet-dry-fired' ? s.dryShrink : undefined} label={label} edit={edit} /></div>
          <p className={`hint draw-hint${edit.notice ? ' caution' : ''}`} role="status">
            {edit.notice ? edit.notice : sel
              ? <>Point {edit.selected! + 1} of {edit.profile.length}: <b>{sel.z} mm</b> up, <b>Ø {sel.d} mm</b>{sel.sharp ? ', corner' : ''}, as thrown. Arrow keys nudge it, and Shift moves 5 mm.</>
              : <>Drag a point to reshape the pot. Drag a ＋ to add a point, or double-click anywhere. Select a point to make it a corner or delete it.</>}
          </p>
          {ok && (
            <div className="legend">
              <span><i style={{ background: 'var(--plastic)' }} />rib</span>
              <span><i style={{ background: 'var(--mark)' }} />raised marks</span>
              <span><i style={{ background: 'var(--clay)' }} />the thrown pot</span>
              {s.scale && columns.includes('/') && <span>numbers read {columns}</span>}
            </div>
          )}
        </div>
        <div>
          <div className="piece-head">
            <h2>Your pot</h2>
            <button className="secondary small" onClick={() => setExpanded(true)} disabled={!ok}>Expand</button>
          </div>
          {view('piece3d')}
          <div className="view-row">{modeToggle}</div>
          <p className="hint">{hint}</p>
        </div>
      </div>

      {ok && (
        <p className="spec" role="status">
          <span>Rib <b>{f0(rib.width)} × {f0(rib.height)} mm</b>, {s.thick} mm thick</span>
          <span>{rib.rot === 0 ? 'fits the bed' : rib.rot === 90 ? 'fits the bed turned 90°' : rib.rot !== null ? `fits the bed at ${rib.rot}°` : 'too big for the bed'}</span>
          <span>Throws <b>{f0(rib.rim)} mm</b> tall, Ø {f0(widest)} at the widest</span>
          {s.shrink > 0 && <span>Fired <b>{f0(rib.rim * fired)} mm</b>, Ø {f0(widest * fired)}</span>}
          <span>{tickInfo}</span>
        </p>
      )}

      <div className="checks-head">
        <h2>Print check</h2>
        <span role="status" aria-live="polite" className={errors ? 'warn' : warns ? 'caution' : 'ok'}>
          {errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'no errors'}{warns ? `, ${warns} warning${warns > 1 ? 's' : ''}` : ''}
        </span>
      </div>
      <ul className="checks">
        {!errors && !warns && <li className="pass"><span aria-hidden="true">✓</span>Ready to print: one piece, at least {f0(rib.narrowest)} mm wide everywhere, fits the bed.</li>}
        {rib.checks.map((c) => (
          <li key={c.id} className={c.level}>
            <span aria-hidden="true">{c.level === 'error' ? '✕' : c.level === 'warn' ? '⚠' : '•'}</span>
            <span><span className="visually-hidden">{c.level === 'error' ? 'Error: ' : c.level === 'warn' ? 'Warning: ' : ''}</span>{c.message}</span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button onClick={onStl} disabled={!print}>{print?.parts ? 'Download 3MF' : 'Download STL'}</button>
        <button className="secondary" onClick={onAddToPlate} disabled={!print}>Add to plate</button>
        <button className="secondary" onClick={() => { const svg = svgHost.current?.querySelector('svg'); if (svg) onSvg(svg); }} disabled={!ok}>Download drawing (SVG)</button>
      </div>

      {expanded && ok && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setExpanded(false)}>
          <div className="modal-body" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="dialog-3d-title" tabIndex={-1}>
            <div className="modal-head">
              <h2 id="dialog-3d-title">Your pot</h2>
              {modeToggle}
              <span className="hint">Drag to rotate, scroll to zoom, right-drag to pan.</span>
              <button className="secondary small" onClick={() => setExpanded(false)}>Close</button>
            </div>
            {view('piece3d-large')}
          </div>
        </div>
      )}

      <details className="tips">
        <summary>Printing &amp; throwing tips</summary>
        <ul>
          <li><b>Print it flat</b>, marks up, exactly as exported. Turn the brim off so the working edge stays clean.</li>
          <li><b>PETG</b> survives water and clay grit better than PLA. Your Ceramic Rib Tool Set project uses PETG at 0.12 mm layers, with 4 walls and 40% gyroid infill. Those settings work for these ribs too.</li>
          <li>Thin layers don't smooth the curve, because the curve lies flat on the bed. They make the numbers crisper.</li>
          <li>Rub the working edge with 400-grit wet sandpaper, so it leaves a smooth wall rather than fine lines.</li>
          <li>Throw the cylinder a little taller than the rim mark, then rib from the base up while the wheel turns slowly. Trim the rim level with the mark.</li>
          <li>On a bat, the marks count from the top of the bat. Stand the rib on the bat, not on the wheel head.</li>
          <li>Shrinkage changes from clay to clay. Measure a test tile once, and enter that number, so the fired pot matches your measurements.</li>
        </ul>
      </details>
    </section>
  );
}
