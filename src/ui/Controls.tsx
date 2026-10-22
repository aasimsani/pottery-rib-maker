import { widestD, scaleProfile, type ProfilePoint } from '../core/profile';
import type { Settings } from '../state';
import { usePersistent } from '../state';
import { BED_MARGIN } from '../core/rib';
import { CheckField, NumberField, Section, SelectField } from './fields';

type Set = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

const round1 = (v: number) => Math.round(v * 10) / 10;

interface EditorProps { s: Settings; set: Set; onSave: () => void; isSaved: boolean; onDelete: () => void; selected: number | null; onSelect: (i: number) => void; onBegin: () => void }

function PotEditor({ s, set, onSave, isSaved, onDelete, selected, onSelect, onBegin }: EditorProps) {
  const [keep, setKeep] = usePersistent('keepProportions', true);
  const p = s.profile, height = round1(p[p.length - 1].z - p[0].z), widest = widestD(p);
  const setProfile = (profile: ProfilePoint[]) => set('profile', [...profile].sort((a, b) => a.z - b.z));
  const edit = (q: ProfilePoint, patch: Partial<ProfilePoint>) => setProfile(p.map((x) => (x === q ? { ...x, ...patch } : x)));
  // resize() scales the whole pot. With proportions kept, height and width grow together.
  const resize = (kz: number, kd: number) => {
    onBegin();
    set('profile', scaleProfile(p, keep ? kz * kd : kz, keep ? kz * kd : kd).map((q) => ({ ...q, z: round1(q.z), d: round1(q.d) })));
  };

  return (
    <>
      <Section title="Pot">
        <label>Name <input type="text" value={s.name} onChange={(e) => set('name', e.target.value)} /></label>
        <div className="row-actions">
          <button className="secondary small" onClick={onSave}>Save to my shapes</button>
          {isSaved && <button className="secondary small" onClick={onDelete}>Delete</button>}
        </div>
        <p className="hint">Draw the pot on the rib drawing, or type exact numbers here. They are the pot as you throw it, wet, from the rim down to the base.</p>
        <table className="points">
          <thead><tr><th scope="col">Point</th><th scope="col">Height</th><th scope="col">Ø</th><th scope="col">Corner</th><th><span className="visually-hidden">Remove</span></th></tr></thead>
          <tbody>
            {[...p].map((q, n) => ({ q, n })).reverse().map(({ q, n }) => {
              const name = n === 0 ? 'Base' : n === p.length - 1 ? 'Rim' : String(n + 1);
              return (
                <tr key={n} className={selected === n ? 'on' : ''} onFocus={() => onSelect(n)} onClick={() => onSelect(n)}>
                  <th scope="row">{name}</th>
                  <td><NumberField compact label={`${name} height`} unit="mm" value={q.z} min={0} step={0.5} onChange={(v) => edit(q, { z: v })} /></td>
                  <td><NumberField compact label={`${name} Ø`} unit="mm" value={q.d} min={1} step={0.5} onChange={(v) => edit(q, { d: v })} /></td>
                  <td><input type="checkbox" aria-label={`${name} is a corner`} checked={!!q.sharp} disabled={n === 0 || n === p.length - 1}
                    onChange={(e) => { onBegin(); edit(q, { sharp: e.target.checked || undefined }); }} /></td>
                  <td><button className="icon" aria-label={`Remove point ${name}`} disabled={n === 0 || p.length <= 2} onClick={() => { onBegin(); setProfile(p.filter((x) => x !== q)); }}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row-actions">
          <button className="secondary small" onClick={() => {
            // The new point goes in the biggest gap, halfway between its two neighbours.
            let k = 1;
            for (let i = 1; i < p.length; i++) if (p[i].z - p[i - 1].z > p[k].z - p[k - 1].z) k = i;
            onBegin();
            setProfile([...p, { z: round1((p[k].z + p[k - 1].z) / 2), d: round1((p[k].d + p[k - 1].d) / 2) }]);
            onSelect(k);
          }}>+ Add a point</button>
        </div>
        <details className="expert">
          <summary>Drawing limits</summary>
          <NumberField label="Least gap between points" unit="mm" value={s.minGap} min={0.5} max={20} step={0.5} onChange={(v) => set('minGap', v)} />
          <NumberField label="Smallest Ø" unit="mm" value={s.minD} min={5} max={200} step={1} onChange={(v) => set('minD', v)} />
          <NumberField label="Snap to" unit="mm" value={s.snap} min={0} max={10} step={0.5} onChange={(v) => set('snap', v)} />
          <p className="hint">
            A dragged point stays this far from the points above and below it, so the heights keep their order. A point also stops
            where the curve would fold back on itself, because the rib couldn't pull away from that wall. Set Snap to 0 to move freely.
          </p>
        </details>
      </Section>

      <Section title="Size">
        <NumberField label="Height" unit="mm" value={height} min={10} step={1} onChange={(v) => height > 0 && resize(v / height, 1)} />
        <NumberField label="Widest Ø" unit="mm" value={round1(widest)} min={10} step={1} onChange={(v) => resize(1, v / widest)} />
        <CheckField label="Keep proportions" value={keep} onChange={setKeep} />
        <NumberField label="Clay shrinkage" unit="%" value={s.shrink} min={0} max={25} step={0.5} onChange={(v) => set('shrink', v)} />
        <p className="hint">
          Shrinkage doesn't change the rib. It sets the dry and fired numbers on the scale.
          {s.shrink > 0 && ` This pot throws to ${round1(height)} mm and comes out of the kiln at ${round1(height * (1 - s.shrink / 100))} mm.`}
          {' '}Most stoneware shrinks 10–14% from wet to fired. To find your clay's number, mark a 100 mm line on a wet slab and measure it after the glaze firing.
        </p>
      </Section>
    </>
  );
}

export function Controls(props: EditorProps) {
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
        <CheckField label="Put a height scale on the rib" value={s.scale} onChange={(v) => set('scale', v)} />
        {s.scale && (
          <>
            <SelectField label="Units" value={s.units} onChange={(v) => set('units', v)} options={[['cm', 'cm (ticks every 5 mm)'], ['mm', 'mm (ticks every 5 mm)'], ['in', 'inches (ticks every ¼")']]} />
            <SelectField label="Numbers show" value={s.scaleNumbers} onChange={(v) => set('scaleNumbers', v)} options={[
              ['wet-dry-fired', 'wet, dry, and fired'], ['wet-fired', 'wet and fired'], ['wet', 'wet only'], ['none', 'no numbers'],
            ]} />
            {s.scaleNumbers === 'wet-dry-fired' && (
              <NumberField label="Drying shrinkage" unit="%" value={s.dryShrink} min={0} max={s.shrink} step={0.5} onChange={(v) => set('dryShrink', v)} />
            )}
            <p className="hint">
              The ticks count the wet height up from the wheel head, like a ruler held to the thrown pot.
              {s.scaleNumbers === 'wet-dry-fired' && ` The dry and fired columns put each number at the height it names. A sloped line runs from each wet height down to its bone-dry height, ${s.dryShrink}% lower, and on to its fired height, ${s.shrink}% lower.`}
              {s.scaleNumbers === 'wet-fired' && ` The fired column puts each number at the height it names. A sloped line runs from each wet height down to its fired height, ${s.shrink}% lower.`}
              {s.scaleNumbers !== 'none' && s.scaleNumbers !== 'wet' && ' Each column needs about 15 mm more rib. If numbers or the finger hole go missing, raise Narrowest width or show fewer columns.'}
            </p>
          </>
        )}
        <CheckField label="Rim line" value={s.rimLine} onChange={(v) => set('rimLine', v)} />
        <label>More marks at <input type="text" value={s.extraMarks} placeholder="e.g. 30, 65" onChange={(e) => set('extraMarks', e.target.value)} /></label>
        <NumberField label="Marks stand up" unit="mm" value={s.emboss} min={0} max={2} step={0.2} onChange={(v) => set('emboss', v)} />
        <CheckField label="Save the marks as a separate part" value={s.splitMarks} onChange={(v) => set('splitMarks', v)} />
        <p className="hint">
          A long line marks the rim when the rib reaches above it. To add more lines, enter wet heights in mm, the same as the pot measurements,
          such as where a handle goes or where the wall turns. Print with the marks facing up.
          {s.splitMarks
            ? ' The download is a 3MF file, because an STL file holds only one part. In Bambu Studio, the rib opens as one object with two parts, Rib and Scale marks, so you can give the marks their own filament.'
            : ' To print the marks in a second color, save them as a separate part, or add a filament change at the layer where they start.'}
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
