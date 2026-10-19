import * as THREE from 'three';

/** Resolves a CSS colour (including var() tokens) to RGB by painting one canvas pixel. */
export function cssRgb(value: string): [number, number, number] {
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  c.fillStyle = value.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(value).trim() : value;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** A theme colour token as a three.js colour. */
export const tokenColor = (name: string) => { const [r, g, b] = cssRgb(name); return new THREE.Color(r / 255, g / 255, b / 255); };
