import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { packPlate, stlSize } from '../core/plate';
import { tokenColor } from './color';
import { frameObject, useOrbitScene } from './scene';

/** One part on the bed. The current rib is drawn in the accent colour, so it stands out from the plate. */
export interface BedPart { stl: ArrayBuffer; current?: boolean }

interface Props { parts: BedPart[]; bedW: number; bedD: number; gap: number; className?: string; label: string }

// stlGeometry() reads a binary STL into a three.js geometry, keeping its flat face normals.
function stlGeometry(stl: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(stl), n = dv.getUint32(80, true);
  const pos = new Float32Array(n * 9), nor = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) {
      pos[t * 9 + v * 3 + k] = dv.getFloat32(o + 12 + v * 12 + k * 4, true);
      nor[t * 9 + v * 3 + k] = dv.getFloat32(o + k * 4, true);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}

/** Shows the print files on the printer bed, laid out the way Download plate places them. */
export default function PrintView({ parts, bedW, bedD, gap, className, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useOrbitScene(host);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    // The STL is z-up and three.js is y-up, so the whole print turns −90° about x.
    const print = new THREE.Group();
    print.rotation.x = -Math.PI / 2;
    // Parts that don't fit together fall back to rows of one, which the Plate panel flags.
    const at = packPlate(parts.map((p) => { const [w, d] = stlSize(p.stl); return [w, d]; }), bedW, bedD, gap)
      ?? parts.map(() => [3, 3] as [number, number]);
    const meshes = parts.map((p, i) => {
      const geo = stlGeometry(p.stl);
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      geo.translate(at[i][0] - b.min.x - bedW / 2, at[i][1] - b.min.y - bedD / 2, -b.min.z);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tokenColor(p.current ? '--plastic' : '--print-plastic'), roughness: 0.55 }));
      print.add(m);
      return m;
    });
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(bedW, bedD), new THREE.MeshStandardMaterial({ color: tokenColor('--print-bed'), roughness: 0.9 }));
    bed.position.z = -0.05;
    print.add(bed);
    const grid = new THREE.GridHelper(Math.max(bedW, bedD), Math.round(Math.max(bedW, bedD) / 10), tokenColor('--print-grid'), tokenColor('--print-grid'));
    grid.rotation.x = Math.PI / 2;
    print.add(grid);
    t.scene.add(print);
    frameObject(t, bed, new THREE.Vector3(0, 1.2, 0.9));
    return () => {
      t.scene.remove(print);
      for (const m of [...meshes, bed]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      grid.dispose();
    };
  }, [parts, bedW, bedD, gap, three]);

  return <div ref={host} className={className} role="img" aria-label={label} />;
}
