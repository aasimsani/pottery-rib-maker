import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULTS, usePersistent, type Settings } from './state';
import { buildRib } from './core/rib';
import { ribTris } from './core/mesh';
import { exportName, exportSTL } from './export';
import { plate3mf, type PlatePart } from './core/plate';
import type { Shape } from './presets';
import { insertPoint, movePoint, removePoint } from './core/edit';
import { widestD, type ProfilePoint } from './core/profile';
import { Controls } from './ui/Controls';
import { Preview } from './ui/Preview';
import { PlatePanel } from './ui/PlatePanel';
import { Library } from './ui/Library';
import { PhotoRib } from './ui/PhotoRib';
import { standaloneSvg } from './ui/svgExport';
import { ConnectClaude } from './ui/ConnectClaude';
import { makeHandlers } from './mcp/tab';
import { PRESETS } from './presets';

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export function App() {
  const [saved, setSaved] = usePersistent<Partial<Settings>>('settings', {});
  const s = useMemo<Settings>(() => ({ ...DEFAULTS, ...saved }), [saved]);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSaved((prev) => ({ ...prev, [key]: value }));
  const [shapes, setShapes] = usePersistent<Shape[]>('shapes', []);
  // ponytail: the plate lives in memory and empties on reload, the same as in the stencil maker.
  const [plate, setPlate] = useState<PlatePart[]>([]);

  const [selected, setSelected] = useState<number | null>(null);
  // notice says why the guards refused a new point. It clears on the next edit.
  const [notice, setNotice] = useState('');
  // Undo keeps the last 50 shapes. ponytail: shapes only, because the other settings are single fields you can retype.
  const history = useRef<ProfilePoint[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const remember = () => {
    const h = history.current, last = h[h.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(s.profile)) return;
    h.push(s.profile); if (h.length > 50) h.shift();
    setCanUndo(true);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) { set('profile', prev); setSelected(null); }
    setCanUndo(history.current.length > 0);
  };
  const setProfile = (f: (p: ProfilePoint[], s: Settings) => ProfilePoint[]) => setSaved((prev) => {
    const cur = { ...DEFAULTS, ...prev };
    return { ...prev, profile: f(cur.profile, cur) };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A text field keeps its own undo.
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const edit = {
    profile: s.profile, selected: selected !== null && selected < s.profile.length ? selected : null, snap: s.snap, canUndo,
    notice, onSelect: (i: number | null) => { setSelected(i); setNotice(''); }, onBegin: remember, onUndo: undo,
    onMove: (i: number, z: number, d: number) => setProfile((p, cur) => movePoint(p, i, z, d, cur)),
    onInsert: (z: number, d: number) => {
      const added = insertPoint(s.profile, z, d, s), rim = s.profile[s.profile.length - 1].z;
      if (added) { set('profile', added.profile); setNotice(''); }
      else setNotice(z >= rim ? 'To make the pot taller, drag the rim point up.' : z <= s.profile[0].z ? 'The base stays on the wheel head, so a new point has to go above it.'
        : s.profile.some((q) => Math.abs(q.z - z) < s.minGap) ? `No point added: that spot is within ${s.minGap} mm of another point. Drag that point instead, or lower the gap under Drawing limits.`
        : 'No point added there, because the wall would fold back on itself. Try a spot closer to the curve.');
      return added?.index ?? null;
    },
    onRemove: (i: number) => { set('profile', removePoint(s.profile, i)); setSelected(null); },
    onCorner: (i: number) => setProfile((p) => p.map((q, k) => (k === i ? { ...q, sharp: !q.sharp || undefined } : q))),
    onStartOver: () => {
      remember();
      const p = s.profile, w = widestD(p);
      setSaved((prev) => ({ ...prev, name: 'My rib', profile: [{ z: 0, d: w }, { z: p[p.length - 1].z - p[0].z, d: w }] }));
      setSelected(null);
    },
  };

  const rib = useMemo(() => buildRib(s), [s]);
  const tris = useMemo(() => (rib.outline.length ? ribTris(rib, s.thick, s.emboss) : new Float32Array()), [rib, s.thick, s.emboss]);
  const print = useMemo(() => exportSTL(s, rib), [s, rib]);

  const [photoOpen, setPhotoOpen] = useState(false);

  // Claude's handlers read the latest render through a ref, and change the rib through the same state your edits change.
  // Each change Claude makes gets a number, and renderedEdit reaches it in the render that shows the new rib.
  const [renderedEdit, setRenderedEdit] = useState(0);
  const edits = useRef(0);
  const actions = { onStl: () => {}, on3mf: async () => {}, onSvg: () => {} };
  const latest = useRef({ s, rib, renderedEdit, shapes: [...PRESETS, ...shapes], actions });
  latest.current = { s, rib, renderedEdit, shapes: [...PRESETS, ...shapes], actions };
  const handlers = useMemo(() => makeHandlers({
    get: () => latest.current,
    commit: (next) => {
      const e = ++edits.current;
      remember();
      setSaved(next); setSelected(null); setRenderedEdit(e);
      return e;
    },
    exportFile: async (format) => {
      const { s: cur, rib: r, actions: a } = latest.current;
      if (format === 'stl') a.onStl(); else if (format === '3mf') await a.on3mf(); else a.onSvg();
      return `${exportName(cur, r)}.${format}`;
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = ({ name, profile, body, above, mirror }: Shape) => { remember(); setSelected(null); setSaved((prev) => ({ ...prev, name, profile, body, above, mirror })); };
  const current: Shape = { group: 'pots', name: s.name, profile: s.profile, body: s.body, above: s.above, mirror: s.mirror };
  const onSvg = (svg: SVGSVGElement) => download(new Blob([standaloneSvg(svg).text], { type: 'image/svg+xml' }), `${exportName(s, rib)}.svg`);
  const onStl = () => {
    if (!print) return;
    // A rib in parts saves as one STL per part, because an STL holds one solid.
    const files = print.parts?.map((p, i) => ({ stl: p.stl, name: `${print.name}_${i ? 'marks' : 'rib'}.stl` })) ?? [{ stl: print.stl, name: `${print.name}.stl` }];
    for (const f of files) download(new Blob([f.stl], { type: 'model/stl' }), f.name);
  };
  const on3mf = async () => {
    // The 3MF holds the rib alone, centred on the bed, with its parts when it has them.
    const zip = print && await plate3mf([{ ...print, name: s.name }], s.bedW, s.bedD);
    if (zip) download(new Blob([zip as BlobPart], { type: 'model/3mf' }), `${print.name}.3mf`);
  };
  actions.onStl = onStl; actions.on3mf = on3mf;
  actions.onSvg = () => { const svg = document.querySelector<SVGSVGElement>('svg.rib-svg:not(.mini)'); if (svg) onSvg(svg); };

  return (
    <>
      <header>
        <div className="header-row">
          <div>
            <h1>Pottery Rib Maker</h1>
            <p>Printable profile ribs with a height scale, cut to the pot you want to throw.</p>
          </div>
          <ConnectClaude handlers={handlers} />
        </div>
      </header>
      <div className="app">
        <Controls s={s} set={set} clayG={rib.clay} heelFit={rib.heelFit} selected={edit.selected} onSelect={setSelected} onBegin={remember} isSaved={shapes.some((x) => x.name === s.name)}
          onSave={() => setShapes((xs) => [...xs.filter((x) => x.name !== s.name), current])}
          onDelete={() => setShapes((xs) => xs.filter((x) => x.name !== s.name))} />
        <main>
          <Preview s={s} rib={rib} tris={tris} edit={edit} print={print} plate={plate} onSvg={onSvg}
            onStl={onStl}
            onSplitMarks={(v) => set('splitMarks', v)}
            on3mf={on3mf}
            onAddToPlate={() => print && setPlate((p) => [...p, print])} />
          <PlatePanel plate={plate} bedW={s.bedW} bedD={s.bedD} onRemove={(i) => setPlate((p) => p.filter((_, k) => k !== i))}
            onClear={() => setPlate([])} onDownload={(zip, name) => download(new Blob([zip as BlobPart], { type: 'model/3mf' }), name)} />
        </main>
        <Library s={s} onPick={pick} saved={shapes} onPhoto={() => setPhotoOpen(true)} />
      </div>
      {photoOpen && (
        <PhotoRib height={s.profile[s.profile.length - 1].z - s.profile[0].z} minGap={s.minGap} onClose={() => setPhotoOpen(false)}
          onUse={({ name, profile }) => { remember(); setSelected(null); setSaved((prev) => ({ ...prev, name, profile })); setPhotoOpen(false); }} />
      )}
    </>
  );
}
