// standaloneSvg() copies the rib drawing as a file that stands on its own. The saved drawing is in mm, so it
// prints or cuts at full size, and its colours come from the theme, inlined so they survive outside the page.
export function standaloneSvg(svg: SVGSVGElement): { text: string; w: number; h: number } {
  const copy = svg.cloneNode(true) as SVGSVGElement, { width: w, height: h } = svg.viewBox.baseVal;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', `${w}mm`); copy.setAttribute('height', `${h}mm`);
  const css = getComputedStyle(document.documentElement), v = (n: string) => css.getPropertyValue(n).trim();
  copy.insertAdjacentHTML('afterbegin', `<style>.pot{fill:${v('--clay')};stroke:${v('--clay-line')};stroke-width:.4}.trim{fill:${v('--clay-line')}}.trimmed{fill:none;stroke:${v('--ink')};stroke-width:.4;stroke-dasharray:1.2 1}.rib{fill:${v('--plastic')}}.mark{fill:${v('--mark')}}.wheel,.dims line{stroke:${v('--muted')};stroke-width:.4}.dims text{font:4px sans-serif;fill:${v('--muted')}}</style>`);
  return { text: copy.outerHTML, w, h };
}
