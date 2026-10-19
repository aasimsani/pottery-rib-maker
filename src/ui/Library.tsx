import { useMemo } from 'react';
import { PRESETS, type Shape } from '../presets';
import { buildRib } from '../core/rib';
import { DEFAULTS, usePersistent, type Settings } from '../state';
import { RibView } from './RibView';

type Tab = 'pots' | 'set' | 'saved';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'pots', label: 'Pots', hint: 'Each profile rib throws the pot it is cut from.' },
  { id: 'set', label: 'Your printed set', hint: 'These are the five ribs of the Ceramic Rib Tool Set. Resize them and add marks.' },
  { id: 'saved', label: 'Saved', hint: 'The shapes you save stay in this browser.' },
];

const sameShape = (a: Shape, s: Settings) => a.name === s.name && JSON.stringify(a.profile) === JSON.stringify(s.profile);

/** Lists the ribs you can start from. A click loads the shape and keeps your size and mark settings. */
export function Library({ s, onPick, saved }: { s: Settings; onPick: (shape: Shape) => void; saved: Shape[] }) {
  const [tab, setTab] = usePersistent<Tab>('library.tab', 'pots');
  const info = TABS.find((t) => t.id === tab)!;
  const shapes = tab === 'saved' ? saved : PRESETS.filter((p) => p.group === tab);
  // Thumbnails use the default marks, so the cards stay the same while you tweak the current rib.
  const ribs = useMemo(() => shapes.map((shape) => buildRib({ ...DEFAULTS, ...shape })), [shapes]);
  return (
    <section className="panel library" aria-labelledby="library-title">
      <h2 id="library-title">Rib library</h2>
      <div className="tabs" role="group" aria-label="Library">
        {TABS.map((t) => <button key={t.id} className={`tab ${t.id === tab ? 'on' : ''}`} aria-pressed={t.id === tab} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <p className="hint">{info.hint}</p>
      {!shapes.length && <p className="hint">Nothing saved yet. Click <b>Save to my shapes</b> under Pot.</p>}
      <div className="grid">
        {shapes.map((shape, i) => (
          <button key={shape.name} className={`card ${sameShape(shape, s) ? 'added' : ''}`} onClick={() => onPick(shape)} aria-pressed={sameShape(shape, s)}>
            <RibView rib={ribs[i]} shrink={0} mini />
            <span>{shape.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
