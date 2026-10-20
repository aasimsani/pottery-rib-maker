import { useEffect, useRef, useState, type ReactNode } from 'react';
import { autoTolerance, photoIssues, segment, traceProfile, type PhotoIssue, type Trace } from '../core/photo';
import type { ProfilePoint } from '../core/profile';
import { NumberField, RangeField, SelectField } from './fields';
import { useDialog } from './dialog';

const MAX_W = 640, MAX_H = 520;
type Step = 'guide' | 'photo' | 'check';

interface Props {
  /** The height to throw the traced pot to, in mm, to start with. */
  height: number; minGap: number;
  onUse: (shape: { name: string; profile: ProfilePoint[] }) => void;
  onClose: () => void;
}

// Pot, Mug, and Bowl draw the shapes the guide's example pictures use, in a 120 × 90 frame.
const Mug = ({ x = 60, w = 34, h = 44, y = 74, handle = false }) => (
  <g>
    {handle && <path d={`M${x + w / 2 - 1} ${y - h + 10} h7 a7 9 0 0 1 0 18 h-7`} fill="none" stroke="var(--ex-pot)" strokeWidth="4.5" />}
    <path d={`M${x - w / 2} ${y - h} h${w} l-2 ${h - 5} q0 5 -5 5 h${-(w - 14)} q-5 0 -5 -5 Z`} fill="var(--ex-pot)" />
  </g>
);
const Bowl = ({ x = 60, y = 70 }) => <path d={`M${x - 26} ${y - 22} h52 q-4 18 -16 22 h-20 q-12 -4 -16 -22 Z`} fill="var(--ex-pot)" />;
const Frame = ({ children, bg = 'var(--ex-bg)' }: { children: ReactNode; bg?: string }) => (
  <svg viewBox="0 0 120 90" aria-hidden="true"><rect width="120" height="90" fill={bg} />{children}</svg>
);

const EXAMPLES: { ok: boolean; title: string; why: string; art: ReactNode }[] = [
  { ok: true, title: 'Side-on and level', why: 'The camera is level with the middle of the pot, so the rim is a straight line.', art: <Frame><Mug /></Frame> },
  { ok: true, title: 'Plain background, space all round', why: 'A shop photo on white or grey is ideal. The whole pot is in the frame.', art: <Frame><Bowl /></Frame> },
  { ok: true, title: 'Handle to one side', why: 'The tracer measures the side without the handle, so a handle is fine.', art: <Frame><Mug handle x={54} /></Frame> },
  { ok: false, title: 'Taken from above', why: 'The rim shows as an oval, which adds height and rounds the top.', art: <Frame><Mug y={78} h={40} /><ellipse cx="60" cy="38" rx="17" ry="7" fill="var(--ex-pot)" /><ellipse cx="60" cy="38" rx="13" ry="4.5" fill="var(--ex-inside)" /></Frame> },
  { ok: false, title: 'Busy background', why: 'Patterns, tablecloths, and shelves blend into the outline.', art: (
    <Frame><g stroke="var(--ex-busy)" strokeWidth="5">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <line key={i} x1={i * 17 - 10} y1="90" x2={i * 17 + 20} y2="0" />)}</g><Mug /></Frame>
  ) },
  { ok: false, title: 'Cut off by the frame', why: 'Any part outside the photo is missing from the rib.', art: <Frame><Mug y={104} h={60} w={44} /></Frame> },
  { ok: false, title: 'In a hand or among other pots', why: 'Fingers and neighbouring pots join the outline.', art: (
    <Frame><Mug x={52} /><Mug x={86} w={28} h={36} /><path d="M20 62 q8 -10 18 -6 l6 4 l-4 30 h-22 Z" fill="var(--ex-hand)" /></Frame>
  ) },
  { ok: false, title: 'Dark pot on a dark background', why: 'Without contrast, the edge of the pot can\'t be found.', art: <Frame bg="var(--ex-dark)"><Mug /></Frame> },
];

// samplePhoto() paints a product-style photo on a canvas, so you can try the tracer without finding one.
// 'good' is an angled pot shot side-on on a plain background. 'above' is a mug shot from above.
function samplePhoto(kind: 'good' | 'above'): string {
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 520;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f1ede6'; c.fillRect(0, 0, 600, 520);
  c.fillStyle = 'rgba(80, 70, 60, 0.18)'; c.beginPath(); c.ellipse(300, 452, 150, 14, 0, 0, Math.PI * 2); c.fill();
  const glaze = c.createLinearGradient(160, 0, 440, 0);
  glaze.addColorStop(0, '#5a3a2a'); glaze.addColorStop(0.35, '#8a5a40'); glaze.addColorStop(1, '#4a2e20');
  c.fillStyle = glaze;
  c.beginPath();
  if (kind === 'good') {
    // Base 160 px across at y 450, carination 300 px across at y 330, rim 250 px across at y 90.
    c.moveTo(220, 450); c.lineTo(150, 330); c.lineTo(175, 90); c.lineTo(425, 90); c.lineTo(450, 330); c.lineTo(380, 450);
  } else {
    c.moveTo(190, 450); c.lineTo(180, 150); c.ellipse(300, 150, 120, 46, 0, Math.PI, 0); c.lineTo(410, 450);
  }
  c.closePath(); c.fill();
  if (kind === 'above') { c.fillStyle = '#2e1c14'; c.beginPath(); c.ellipse(300, 150, 104, 36, 0, 0, Math.PI * 2); c.fill(); }
  return cv.toDataURL('image/png');
}

/**
 * Turns a photo of a pot, such as one from a shop or a museum site, into a rib. It walks through
 * which photos work, takes the photo, and shows the traced outline with any problems before you use it.
 */
export function PhotoRib({ height: startHeight, minGap, onUse, onClose }: Props) {
  const [step, setStep] = useState<Step>('guide');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  // null means automatic: Otsu's method on colour distance from the background.
  const [tol, setTol] = useState<number | null>(null);
  const [usedTol, setUsedTol] = useState(60);
  const [height, setHeight] = useState(Math.round(startHeight));
  const [detail, setDetail] = useState(0.6);
  const [name, setName] = useState('Pot from a photo');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [issues, setIssues] = useState<PhotoIssue[]>([]);
  const view = useRef<HTMLCanvasElement>(null), dialog = useRef<HTMLDivElement>(null);
  useDialog(dialog, true, onClose);

  // open() loads an image from a file, a pasted image, or a URL, and moves on to the check.
  const open = (src: string, cross = false) => {
    const i = new Image();
    if (cross) i.crossOrigin = 'anonymous';
    i.onload = () => { setImg(i); setError(''); setTol(null); setStep('check'); };
    i.onerror = () => setError(cross
      ? 'That address didn\'t load as an image, or its site doesn\'t let other pages read its pictures. Right-click the picture, choose Copy Image, and paste it here with ⌘V or Ctrl+V. You can also save it and drop the file here.'
      : 'That file isn\'t an image this browser can read. Try a JPEG, PNG, or WebP.');
    i.src = src;
  };
  const openFile = (file?: File | null) => { if (file?.type.startsWith('image/')) open(URL.createObjectURL(file)); else if (file) setError('That file isn\'t an image. Try a JPEG, PNG, or WebP.'); };

  // A copied image or image address pastes straight in, from anywhere in the dialog.
  useEffect(() => {
    if (step !== 'photo') return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
      if (item) { e.preventDefault(); openFile(item.getAsFile()); return; }
      const text = e.clipboardData?.getData('text/plain').trim();
      if (text && /^https?:\/\//.test(text) && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setUrl(text); open(text, true); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Trace the photo whenever it or the settings change, and draw the result over it.
  useEffect(() => {
    const cv = view.current;
    if (step !== 'check' || !img || !cv) return;
    const k = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const w = (cv.width = Math.round(img.naturalWidth * k)), h = (cv.height = Math.round(img.naturalHeight * k));
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0, w, h);
    let photo: ImageData;
    try { photo = c.getImageData(0, 0, w, h); } catch {
      setTrace(null); setIssues([]);
      setError('This site doesn\'t let other pages read its pictures. Right-click the picture, choose Copy Image, and paste it on the previous step.');
      return;
    }
    const t0 = tol ?? autoTolerance(photo.data, w, h);
    setUsedTol(t0);
    const mask = segment(photo.data, w, h, t0);
    try {
      const t = traceProfile(mask, w, h, height, { detail, minGap });
      setTrace(t); setIssues(photoIssues(mask, w, h, t)); setError('');
      // Tint the pot, then draw the traced outline on both sides of the centre line, with a dot at each point.
      const d = photo.data;
      for (let p = 0; p < w * h; p++) if (mask[p]) { d[p * 4] = d[p * 4] * 0.5 + 40; d[p * 4 + 1] = d[p * 4 + 1] * 0.5 + 100; d[p * 4 + 2] = d[p * 4 + 2] * 0.5 + 110; }
      c.putImageData(photo, 0, 0);
      const px = (q: ProfilePoint, side: number): [number, number] => [t.axis + side * (q.d / 2 / t.scale), t.bottom - q.z / t.scale];
      c.strokeStyle = '#e39a1d'; c.lineWidth = 2; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(t.axis, t.top); c.lineTo(t.axis, t.bottom); c.stroke(); c.setLineDash([]);
      for (const side of [-1, 1]) {
        c.beginPath();
        t.profile.forEach((q, i) => { const [x, y] = px(q, side); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
        c.stroke();
      }
      c.fillStyle = '#fffdf9';
      for (const q of t.profile) { const [x, y] = px(q, 1); c.beginPath(); c.arc(x, y, q.sharp ? 5 : 4, 0, Math.PI * 2); c.fill(); c.stroke(); }
    } catch (e) {
      setTrace(null); setIssues([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [step, img, tol, height, detail, minGap]);

  const steps: [Step, string][] = [['guide', 'Good photos'], ['photo', 'Add a photo'], ['check', 'Check the trace']];
  const widest = trace ? Math.max(...trace.profile.map((q) => q.d)) : 0;

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-body photo" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="photo-title" tabIndex={-1}>
        <div className="modal-head">
          <h2 id="photo-title">Rib from a photo</h2>
          <ol className="steps" aria-label="Steps">
            {steps.map(([id, label], i) => (
              <li key={id} aria-current={step === id ? 'step' : undefined} className={step === id ? 'on' : ''}>
                <button className="link" disabled={id === 'check' && !img} onClick={() => setStep(id)}>{i + 1}. {label}</button>
              </li>
            ))}
          </ol>
          <button className="secondary small" onClick={onClose}>Close</button>
        </div>

        {step === 'guide' && (
          <>
            <p className="hint">
              Any photo of a pot can become a rib, such as one from a shop, a museum, or your own phone. The tracer finds the
              pot's outline against the background, so some photos work much better than others.
            </p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <figure key={ex.title} className={ex.ok ? 'good' : 'bad'}>
                  {ex.art}
                  <figcaption>
                    <b><span aria-hidden="true">{ex.ok ? '✓ ' : '✕ '}</span><span className="visually-hidden">{ex.ok ? 'Works: ' : 'Doesn\'t work: '}</span>{ex.title}</b>
                    <span>{ex.why}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="actions">
              <button onClick={() => setStep('photo')}>I have a photo</button>
              <button className="secondary" onClick={() => open(samplePhoto('good'))}>Try a good example</button>
              <button className="secondary" onClick={() => open(samplePhoto('above'))}>Try a bad example</button>
            </div>
          </>
        )}

        {step === 'photo' && (
          <>
            <div className="photo-view" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0], link = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
              if (file) openFile(file); else if (link) { setUrl(link); open(link, true); }
            }}>
              <label className="drop">
                Drop a photo here, paste one with ⌘V or Ctrl+V, or <u>choose a file</u>. On a phone this can open the camera.
                <input type="file" accept="image/*" hidden onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
            <form className="search" onSubmit={(e) => { e.preventDefault(); if (url.trim()) open(url.trim(), true); }}>
              <input type="url" placeholder="…or paste the image's address (https://…)" aria-label="Image address" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button type="submit" disabled={!url.trim()}>Load</button>
            </form>
            <p className="hint">
              To copy a picture from a web page, right-click it and choose <b>Copy Image</b>. Many shops don't let other pages load
              their images by address, but a copied image always works.
            </p>
            {error && <p className="warn" role="alert">{error}</p>}
          </>
        )}

        {step === 'check' && (
          <div className="photo-grid">
            <div className="photo-view"><canvas ref={view} role="img" aria-label={trace ? `Photo with the traced outline, ${trace.profile.length} points` : 'The photo'} /></div>
            <div className="photo-side">
              <NumberField label="Throw it to" unit="mm" value={height} min={10} step={1} onChange={setHeight} />
              <p className="hint">A photo has no scale, so the trace keeps the pot's proportions and sizes it to this height.</p>
              <RangeField label={`Background tolerance${tol === null ? ' (auto)' : ''}`} value={usedTol} min={10} max={250} onChange={setTol}
                action={<button type="button" className="secondary small" title="Pick the tolerance that best separates the pot from the background and its shadow" onClick={() => setTol(null)}>Auto</button>} />
              <SelectField label="Detail" value={detail} onChange={setDetail} options={[[0.3, 'fine (more points)'], [0.6, 'normal'], [1.5, 'smooth (fewer points)']]} />
              <label>Name <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
              {error && <p className="warn" role="alert">{error}</p>}
              {trace && (
                <ul className="checks" aria-live="polite">
                  {issues.length === 0 && <li className="pass"><span aria-hidden="true">✓</span>This photo traces cleanly.</li>}
                  {issues.map((i) => <li key={i.id} className="warn"><span aria-hidden="true">⚠</span><span><span className="visually-hidden">Warning: </span>{i.message}</span></li>)}
                  <li className="note"><span aria-hidden="true">•</span>{trace.profile.length} points, {height} mm tall, Ø {trace.profile[0].d} at the base, Ø {widest} at the widest. Corners are drawn larger.</li>
                </ul>
              )}
              <div className="row-actions">
                <button className="secondary" onClick={() => { setImg(null); setTrace(null); setStep('photo'); }}>Another photo</button>
                <button disabled={!trace} onClick={() => trace && onUse({ name, profile: trace.profile })}>Make the rib</button>
              </div>
              <p className="hint">You can drag the points on the rib drawing afterwards, and Undo brings back the shape you had.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
