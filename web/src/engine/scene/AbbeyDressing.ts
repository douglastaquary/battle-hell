import * as THREE from 'three';
import { Materials } from '../render/MaterialKit';

/**
 * Dressing alinhado ao walk-preview Abbey Clearing:
 * caminho hexagonal, faixas nos pilares, grades extras, escada lateral.
 */
export function buildAbbeyDressing(parent: THREE.Group): void {
  const stone = Materials.stone();
  const dirt = Materials.dirt();
  const iron = Materials.iron();
  const banner = Materials.banner();

  // Replace flat ground look with dirt disk already present — add hex pavers to gate
  const hexGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.07, 6);
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col <= 1; col++) {
      const tile = new THREE.Mesh(hexGeo, stone);
      const z = 5.5 - row * 1.05;
      const x = col * 1.15 + (row % 2) * 0.55;
      tile.position.set(x, 0.035, z);
      tile.receiveShadow = true;
      parent.add(tile);
    }
  }

  // Side dirt patches
  const patch = new THREE.Mesh(new THREE.CircleGeometry(3.5, 16), dirt);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(-6, 0.01, -2);
  parent.add(patch);
  const patch2 = patch.clone();
  patch2.position.set(6, 0.01, -1);
  parent.add(patch2);

  // Pillar banners at gate (±4, -17)
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 0.9), stone);
    pole.position.set(side * 3.6, 2.1, -17.2);
    pole.castShadow = true;
    parent.add(pole);

    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), banner);
    cloth.position.set(side * 3.6, 2.4, -16.7);
    parent.add(cloth);

    // Brazier bowl on pillar
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.22, 8),
      Materials.brass(),
    );
    bowl.position.set(side * 3.6, 4.25, -17.2);
    parent.add(bowl);
  }

  // Iron grate overlay if gate GLB is sparse
  const barGeo = new THREE.BoxGeometry(0.08, 3.2, 0.08);
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(barGeo, iron);
    bar.position.set(i * 0.45, 1.7, -17.6);
    parent.add(bar);
  }
  for (let i = 0; i < 4; i++) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.08), iron);
    cross.position.set(0, 0.7 + i * 0.75, -17.6);
    parent.add(cross);
  }

  // Circular crest on arch
  const crest = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.08, 8, 16),
    Materials.brass(),
  );
  crest.position.set(0, 4.3, -17.4);
  parent.add(crest);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), Materials.brass());
  hub.position.copy(crest.position);
  parent.add(hub);

  // Side wall + stairs (left)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.4, 1.1), stone);
  wall.position.set(-7.5, 1.2, -14);
  wall.castShadow = true;
  parent.add(wall);
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 0.7), stone);
    step.position.set(-5.2, 0.14 + i * 0.28, -12.5 - i * 0.55);
    step.castShadow = true;
    parent.add(step);
  }

  // Background pine silhouettes (cheap cones)
  const pineMat = new THREE.MeshStandardMaterial({
    color: 0x1a2218,
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < 10; i++) {
    const h = 4 + (i % 4);
    const pine = new THREE.Mesh(new THREE.ConeGeometry(1.2, h, 5), pineMat);
    const a = -0.8 + i * 0.22;
    pine.position.set(Math.sin(a) * 22, h * 0.45, -20 - Math.cos(a) * 6);
    parent.add(pine);
  }
}
