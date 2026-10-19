import { widestD, scaleProfile, type ProfilePoint } from '../core/profile';
import type { Settings } from '../state';
import { usePersistent } from '../state';
import { BED_MARGIN } from '../core/rib';
import { CheckField, NumberField, Section, SelectField } from './fields';

type Set = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

const round1 = (v: number) => Math.round(v * 10) / 10;

function PotEditor({ s, set, onSave, isSaved, onDelete }: { s: Settings; set: Set; onSave: () => void; isSaved: boolean; onDelete: () => void }) {
  const [keep, setKeep] = usePersistent('keepProportions', true);
  const p = s.profile, height = round1(p[p.length - 1].z - p[0].z), widest = widestD(p);
  const setProfile = (profile: ProfilePoint[]) => set('profile', [...profile].sort((a, b) => a.z - b.z));
  const edit = (q: ProfilePoint, patch: Partial<ProfilePoint>) => setProfile(p.map((x) => (x === q ? { ...x, ...patch } : x)));
  // resize() scales the whole pot. With proportions kept, height and width grow together.
  const resize = (kz: number, kd: number) => set('profile', scaleProfile(p, keep ? kz * kd : kz, keep ? kz * kd : kd).map((q) => ({ ...q, z: round1(q.z), d: round1(q.d) })));

  return (
    <>
      <Section title="Pot">
        <label>Name <input type="text" value={s.name} onChange={(e) => set('name', e.target.value)} /></label>
        <div className="row-actions">
          <button className="secondary small" onClick={onSave}>Save to my shapes</button>
          {isSaved && <button className="secondary small" onClick={onDelete}>Delete</button>}
        </div>
        <p className="hint">Measurements are the finished pot, after firing, from the base up. A corner makes a crisp edge, such as a carination.</p>
        <div className="points" role="list" aria-label="Pot measurements">
          {[...p].reverse().map((q, i) => {
            const n = p.length - 1 - i, name = n === 0 ? 'Base' : n === p.length - 1 ? 'Rim' : `Point ${n}`;
            return (
              <div className="point" role="listitem" key={n}>
                <span className="point-name">{name}</span>
                <NumberField label={`${name} height`} unit="mm" value={q.z} min={0} step={0.5} onChange={(v) => edit(q, { z: v })} />
                <NumberField label={`${name} Ø`} unit="mm" value={q.d} min={1} step={0.5} onChange={(v) => edit(q, { d: v })} />
                <label className="check corner" title="Make this point a sharp corner">
                  <input type="checkbox" checked={!!q.sharp} disabled={n === 0 || n === p.length - 1} onChange={(e) => edit(q, { sharp: e.target.checked || undefined })} /> corner
                </label>
                <button className="icon" aria-label={`Remove ${name}`} disabled={p.length <= 2} onClick={() => setProfile(p.filter((x) => x !== q))}>×</button>
              </div>
            );
          })}
        </div>
        <div className="row-actions">
          <button className="secondary small" onClick={() => {
            // The new point goes in the biggest gap, halfway between its two neighbours.
            let k = 1;
            for (let i = 1; i < p.length; i++) if (p[i].z - p[i - 1].z > p[k].z - p[k - 1].z) k = i;
            setProfile([...p, { z: round1((p[k].z + p[k - 1].z) / 2), d: round1((p[k].d + p[k - 1].d) / 2) }]);
          }}>+ Measurement in between</button>
        </div>
      </Section>

      <Section title="Size">
        <NumberField label="Height" unit="mm" value={height} min={10} step={1} onChange={(v) => height > 0 && resize(v / height, 1)} />
        <NumberField label="Widest Ø" unit="mm" value={round1(widest)} min={10} step={1} onChange={(v) => resize(1, v / widest)} />
        <CheckField label="Keep proportions" value={keep} onChange={setKeep} />
        <NumberField label="Clay shrinkage" unit="%" value={s.shrink} min={0} max={25} step={0.5} onChange={(v) => set('shrink', v)} />
        <p className="hint">
          The rib is cut for the wet pot, {s.shrink > 0 ? `${round1(100 / (1 - s.shrink / 100) - 100)}% bigger than the fired size` : 'at exactly these measurements'}.
          Most stoneware shrinks 10–14% from wet to fired. To find your clay's number, mark a 100 mm line on a wet slab and measure it after the glaze firing.
        </p>
      </Section>
    </>
  );
}

export function Controls(props: { s: Settings; set: Set; onSave: () => void; isSaved: boolean; onDelete: () => void }) {
  const { s, set } = props;
  return (
    <aside className="panel controls" aria-label="Pot and rib settings">
      <PotEditor {...props} />

      <Section title="Rib">
        <NumberField label="Narrowest width" unit="mm" value={s.body} min={3} max={150} step={1} onChange={(v) => set('body', v)} />
        <NumberField label="Above the rim" unit="mm" value={s.above} min={0} max={60} step={1} onChange={(v) => set('above', v)} />
        <NumberField label="Thickness" unit="mm" value={s.thick} min={1} max={8} step={0.1} onChange={(v) => set('thick', v)} />
        <CheckField label="Both long edges throw the pot" value={s.mirror} onChange={(v) => set('mirror', v)} />
        <CheckField label="Finger hole" value={s.hole} onChange={(v) => set('hole', v)} />
        {s.hole && <NumberField label="Hole Ø" unit="mm" value={s.holeD} min={8} max={40} step={1} onChange={(v) => set('holeD', v)} />}
        <p className="hint">Stand the rib on the wheel head or bat and hold its working edge to the clay. The flat bottom keeps it level, so the pot comes out the same every time.</p>
      </Section>

      <Section title="Height scale">
        <SelectField label="Units" value={s.units} onChange={(v) => set('units', v)} options={[['cm', 'cm (ticks every 5 mm)'], ['mm', 'mm (ticks every 5 mm)'], ['in', 'inches (ticks every ¼")']]} />
        <SelectField label="Numbers show" value={s.labelAs} onChange={(v) => set('labelAs', v)} options={[['thrown', 'wet height, like a ruler'], ['fired', 'fired height']]} />
        <CheckField label="Ticks" value={s.ticks} onChange={(v) => set('ticks', v)} />
        <CheckField label="Numbers" value={s.numbers} onChange={(v) => set('numbers', v)} />
        <label>More marks at <input type="text" value={s.extraMarks} placeholder="e.g. 30, 65" onChange={(e) => set('extraMarks', e.target.value)} /></label>
        <NumberField label="Marks stand up" unit="mm" value={s.emboss} min={0} max={2} step={0.2} onChange={(v) => set('emboss', v)} />
        <p className="hint">
          The scale counts up from the wheel head along the back edge. A long line marks the rim. Add more lines in mm, {s.labelAs === 'fired' ? 'fired' : 'wet'} height,
          for a handle, a band, or where a wall turns. Print with the marks facing up. To print the marks in a second colour, add a filament change at the layer where they start.
        </p>
      </Section>

      <details className="expert">
        <summary>Printer settings</summary>
        <Section title="Printer">
          <NumberField label="Bed width" unit="mm" value={s.bedW} min={50} onChange={(v) => set('bedW', v)} />
          <NumberField label="Bed depth" unit="mm" value={s.bedD} min={50} onChange={(v) => set('bedD', v)} />
          <p className="hint">Set for a Bambu Lab P2S (256 × 256 mm). The fit check keeps {BED_MARGIN} mm clear of each bed edge. A rib that only fits at an angle gets that rotation built into the STL.</p>
        </Section>
      </details>
    </aside>
  );
}
