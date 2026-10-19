import { useMemo, useState } from 'react';
import { DEFAULTS, usePersistent, type Settings } from './state';
import { buildRib } from './core/rib';
import { ribTris } from './core/mesh';
import { exportName, exportSTL } from './export';
import type { PlatePart } from './core/plate';
import type { Shape } from './presets';
import { Controls } from './ui/Controls';
import { Preview } from './ui/Preview';
import { PlatePanel } from './ui/PlatePanel';
import { Library } from './ui/Library';

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

  const rib = useMemo(() => buildRib(s), [s]);
  const tris = useMemo(() => (rib.outline.length ? ribTris(rib, s.thick, s.emboss) : new Float32Array()), [rib, s.thick, s.emboss]);
  const print = useMemo(() => exportSTL(s, rib), [s, rib]);

  const pick = ({ name, profile, body, above, mirror }: Shape) => setSaved((prev) => ({ ...prev, name, profile, body, above, mirror }));
  const current: Shape = { group: 'pots', name: s.name, profile: s.profile, body: s.body, above: s.above, mirror: s.mirror };
  const onSvg = (svg: SVGSVGElement) => {
    // The saved drawing is in mm, so it prints or cuts at full size.
    const copy = svg.cloneNode(true) as SVGSVGElement, { width: w, height: h } = svg.viewBox.baseVal;
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', `${w}mm`); copy.setAttribute('height', `${h}mm`);
    const css = getComputedStyle(document.documentElement), v = (n: string) => css.getPropertyValue(n).trim();
    copy.insertAdjacentHTML('afterbegin', `<style>.pot{fill:${v('--clay')};stroke:${v('--clay-line')};stroke-width:.4}.rib{fill:${v('--plastic')}}.mark{fill:${v('--mark')}}.wheel,.dims line{stroke:${v('--muted')};stroke-width:.4}.dims text{font:4px sans-serif;fill:${v('--muted')}}</style>`);
    download(new Blob([copy.outerHTML], { type: 'image/svg+xml' }), `${exportName(s, rib)}.svg`);
  };

  return (
    <>
      <header>
        <h1>Pottery Rib Maker</h1>
        <p>Printable profile ribs with a height scale, cut to the pot you want to throw.</p>
      </header>
      <div className="app">
        <Controls s={s} set={set} isSaved={shapes.some((x) => x.name === s.name)}
          onSave={() => setShapes((xs) => [...xs.filter((x) => x.name !== s.name), current])}
          onDelete={() => setShapes((xs) => xs.filter((x) => x.name !== s.name))} />
        <main>
          <Preview s={s} rib={rib} tris={tris} print={print} plate={plate} onSvg={onSvg}
            onStl={() => print && download(new Blob([print.stl], { type: 'model/stl' }), print.name)}
            onAddToPlate={() => print && setPlate((p) => [...p, { name: print.name.replace(/\.stl$/, ''), stl: print.stl }])} />
          <PlatePanel plate={plate} bedW={s.bedW} bedD={s.bedD} onRemove={(i) => setPlate((p) => p.filter((_, k) => k !== i))}
            onClear={() => setPlate([])} onDownload={(zip, name) => download(new Blob([zip as BlobPart], { type: 'model/3mf' }), name)} />
        </main>
        <Library s={s} onPick={pick} saved={shapes} />
      </div>
    </>
  );
}
