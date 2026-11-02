import type { Settings } from '../state';
import type { Rib } from '../core/rib';
import type { Shape } from '../presets';
import { applyOps, type Op } from './ops';
import { capture3d } from '../ui/scene';
import { setViewMode, type PieceMode } from './viewMode';
import type { Handler } from './bridge';

/** What the handlers need from the App. get() always returns the latest render's values. */
export interface TabApi {
  get(): { s: Settings; rib: Rib; renderedEdit: number; shapes: Shape[] };
  /** Applies new settings and returns the edit's number, which renderedEdit reaches once the page shows it. */
  commit(next: Settings): number;
  /** Runs the matching download button and returns the file name. */
  exportFile(format: 'stl' | 'svg' | '3mf'): Promise<string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// shrink() copies a canvas at most max pixels across, so a preview costs Claude about 1,500 tokens.
function shrink(src: HTMLCanvasElement, max = 1200): string {
  const k = Math.min(1, max / Math.max(src.width, src.height, 1)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

// inlineStyles() copies each element's computed paint onto its twin in a copy, so the picture keeps the page's look.
const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'display', 'visibility'];
function inlineStyles(src: Element, dst: Element): void {
  const cs = getComputedStyle(src);
  dst.setAttribute('style', PAINT.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
}

// drawingImage() paints the rib drawing, as the page shows it, onto a canvas 1000 px on its long side.
async function drawingImage(): Promise<string | undefined> {
  const svg = document.querySelector<SVGSVGElement>('svg.rib-svg:not(.mini)');
  if (!svg) return undefined;
  const { width: w, height: h } = svg.viewBox.baseVal, k = 1000 / Math.max(w, h, 1);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, copy);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(Math.round(w * k))); copy.setAttribute('height', String(Math.round(h * k)));
  const url = URL.createObjectURL(new Blob([copy.outerHTML], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

// ponytail: checkpoints live in the tab's memory and vanish on reload. Store them in IndexedDB if that ever bites.
const checkpoints = new Map<string, { state: Settings; image?: string }>();

export function makeHandlers(api: TabApi): Record<string, Handler> {
  const summary = () => {
    const { s, rib } = api.get();
    return {
      settings: s,
      rib: { width: rib.width, height: rib.height, rim: rib.rim, narrowest: rib.narrowest, fitsBedAt: rib.rot, clayGrams: Math.round(rib.clay), trimmingsGrams: Math.round(rib.trimmings), heelFit: rib.heelFit },
      checks: rib.checks,
    };
  };

  // waitFor() returns once the page has rendered the edit. The rib builds in the render itself, so the render is the rebuild.
  const waitFor = async (edit: number) => {
    const t0 = Date.now();
    while (api.get().renderedEdit < edit && Date.now() - t0 < 10_000) await sleep(30);
  };

  const view = async ({ which = 'both', mode }: { which?: 'drawing' | '3d' | 'both'; mode?: PieceMode }) => {
    const images: { name: string; dataUrl: string }[] = [];
    if (which !== '3d') { const d = await drawingImage(); if (d) images.push({ name: 'Rib, as printed, with the thrown pot', dataUrl: d }); }
    if (which !== 'drawing') {
      if (mode) { setViewMode(mode); await sleep(400); }
      let shot: HTMLCanvasElement | null = null;
      for (let i = 0; i < 40 && !(shot = capture3d()); i++) await sleep(100);
      if (shot) images.push({ name: `3D view${mode ? `, ${mode}` : ''}`, dataUrl: shrink(shot) });
    }
    if (!images.length) throw new Error('No preview is on screen yet. Fix the pot measurements, then call view again.');
    return { images };
  };

  const commitAndWait = async (next: Settings, wantView?: boolean) => {
    await waitFor(api.commit(next));
    return { ...summary(), ...(wantView ? await view({ which: 'drawing' }) : {}) };
  };

  return {
    getState: async () => ({ ...summary(), checkpoints: [...checkpoints.keys()] }),
    view: async (p: { which?: 'drawing' | '3d' | 'both'; mode?: PieceMode }) => view(p),
    apply: async ({ ops, view: wantView }: { ops: Op[]; view?: boolean }) => {
      const { s, shapes } = api.get();
      return commitAndWait(applyOps(s, ops, { shapes }), wantView);
    },
    listShapes: async () => ({
      shapes: api.get().shapes.map((x) => ({ name: x.name, group: x.group, height: x.profile[x.profile.length - 1].z - x.profile[0].z, widest: Math.max(...x.profile.map((q) => q.d)) })),
    }),
    checkpoint: async ({ name }: { name: string }) => {
      checkpoints.set(name, { state: api.get().s, image: await drawingImage() });
      return { saved: name, checkpoints: [...checkpoints.keys()] };
    },
    restore: async ({ name, view: wantView }: { name: string; view?: boolean }) => {
      const c = checkpoints.get(name);
      if (!c) throw new Error(`No checkpoint is called ${name}. Saved: ${[...checkpoints.keys()].join(', ') || 'none'}.`);
      return commitAndWait(c.state, wantView);
    },
    compare: async ({ a, b }: { a: string; b: string }) => {
      const pick = async (n: string) => {
        const image = n === 'current' ? await drawingImage() : checkpoints.get(n)?.image;
        if (!image) throw new Error(`No drawing for ${n}. Use a checkpoint name, or "current".`);
        return { name: n, dataUrl: image };
      };
      return { images: [await pick(a), await pick(b)] };
    },
    export: async ({ format }: { format: 'stl' | 'svg' | '3mf' }) => ({ file: await api.exportFile(format), savedTo: 'the browser\'s downloads folder' }),
  };
}
