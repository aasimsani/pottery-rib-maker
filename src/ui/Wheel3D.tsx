import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Rib } from '../core/rib';
import { tokenColor } from './color';
import { frameObject, useOrbitScene } from './scene';

export type WheelMode = 'wheel' | 'fired';

interface Props { rib: Rib; tris: Float32Array; thick: number; wall: number; shrink: number; mode: WheelMode; className?: string; label: string }

// potMesh() revolves the outside into a lathe mesh. The inside runs a wall's thickness in from the
// finished pot, down to a floor as thick as the wall, so clay left to trim shows as a thicker foot.
function potMesh(rib: Rib, outside: Rib['pot'], wall: number) {
  const out = outside.map((p) => new THREE.Vector2(p.r, p.z));
  const inner = [...rib.pot].reverse().map((p) => new THREE.Vector2(Math.max(1, p.r - wall), Math.max(wall, p.z)));
  const pts = [new THREE.Vector2(0, 0), ...out, ...inner, new THREE.Vector2(0, wall)];
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 160), new THREE.MeshStandardMaterial({ color: tokenColor('--clay'), roughness: 0.85, side: THREE.DoubleSide }));
}

/**
 * The thrown pot on the wheel head, with the rib held against it where it shapes the wall. The
 * fired view shows the pot alone, trimmed and shrunk to the size it leaves the kiln.
 */
export default function Wheel3D({ rib, tris, thick, wall, shrink, mode, className, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useOrbitScene(host);
  const fit = useRef<{ scene?: object; key?: string }>({});

  useEffect(() => {
    const t = three.current;
    if (!t || !rib.pot.length) return;
    const group = new THREE.Group();
    const pot = potMesh(rib, mode === 'wheel' ? rib.thrown : rib.pot, wall);
    group.add(pot);
    const rmax = Math.max(...rib.thrown.map((p) => p.r)), wheelR = Math.max(rmax * 1.5, rib.rmin + rib.width + 10);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 6, 96), new THREE.MeshStandardMaterial({ color: tokenColor('--wheel'), roughness: 0.6 }));
    wheel.position.y = -3;
    group.add(wheel);
    let ribMesh: THREE.Mesh | null = null;
    if (mode === 'wheel') {
      const geo = new THREE.BufferGeometry();
      // translate() moves the array in place, and tris is shared with the other views, so the rib gets a copy.
      geo.setAttribute('position', new THREE.BufferAttribute(tris.slice(), 3));
      geo.computeVertexNormals();
      // The rib's x runs out from the pot's narrowest radius, and its thickness sits centred on the cut plane.
      geo.translate(rib.rmin, 0, -thick / 2);
      ribMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tokenColor('--plastic'), roughness: 0.5 }));
      group.add(ribMesh);
    } else pot.scale.setScalar(1 - shrink / 100);
    t.scene.add(group);

    // Re-frame only when the shape or the mode changes, so a tweak to the marks keeps your view.
    const key = `${mode}:${rib.width.toFixed(1)}:${rib.height.toFixed(1)}:${rmax.toFixed(1)}`;
    if (fit.current.scene !== t || fit.current.key !== key) {
      fit.current = { scene: t, key };
      frameObject(t, group, new THREE.Vector3(0.25, 0.45, 1));
    }
    return () => {
      t.scene.remove(group);
      for (const m of [pot, wheel, ribMesh]) if (m) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    };
  }, [rib, tris, thick, wall, shrink, mode, three]);

  return <div ref={host} className={className} role="img" aria-label={label} />;
}
