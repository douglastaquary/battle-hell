import * as THREE from 'three';
import { Materials, getStainedGlassTexture } from '../render/MaterialKit';

/**
 * Dressing Abbey Clearing — riqueza alinhada à captura de referência:
 * caminho hex, abadia com vitrais, poças roxas, cogumelos, pinheiros, grades.
 */
export function buildAbbeyDressing(parent: THREE.Group): void {
  const stone = Materials.stone();
  const dirt = Materials.dirt();
  const iron = Materials.iron();
  const banner = Materials.banner();
  const brass = Materials.brass();

  // Hex pavers with slight height/color variation
  const hexGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.07, 6);
  for (let row = 0; row < 18; row++) {
    for (let col = -2; col <= 2; col++) {
      if (Math.abs(col) === 2 && row % 3 === 0) continue;
      const tile = new THREE.Mesh(hexGeo, stone);
      const z = 6.2 - row * 1.02;
      const x = col * 1.12 + (row % 2) * 0.56;
      tile.position.set(x, 0.03 + ((row + col) % 3) * 0.008, z);
      tile.receiveShadow = true;
      parent.add(tile);
    }
  }

  // Dirt side patches
  for (const [x, z, r] of [
    [-6.5, -2, 3.8],
    [6.5, -1, 3.5],
    [-5, 6, 2.8],
    [5.5, 5.5, 2.6],
  ] as const) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 20), dirt);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.012, z);
    parent.add(patch);
  }

  // Purple soul-mist pools (goal still)
  const mistMat = new THREE.MeshStandardMaterial({
    color: 0x2a1040,
    emissive: 0x8844cc,
    emissiveIntensity: 1.4,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
    toneMapped: false,
  });
  const mistSpots: [number, number, number][] = [
    [-2.4, 0.04, -3.2],
    [3.1, 0.04, -5.5],
    [-4.2, 0.04, 1.5],
    [1.8, 0.04, 3.2],
    [-1.2, 0.04, -9.5],
    [4.5, 0.04, -12],
    [0.5, 0.04, -1],
  ];
  for (const [x, y, z] of mistSpots) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7 + Math.abs(x) * 0.05, 20), mistMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y, z);
    parent.add(pool);
    const glow = new THREE.PointLight(0xaa66ee, 1.4, 5.5, 2);
    glow.position.set(x, 0.6, z);
    parent.add(glow);
  }

  // Pillar banners at gate
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.95, 4.4, 0.95), stone);
    pole.position.set(side * 3.6, 2.2, -17.2);
    pole.castShadow = true;
    parent.add(pole);

    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.5), banner);
    cloth.position.set(side * 3.6, 2.5, -16.65);
    parent.add(cloth);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.24, 10), brass);
    bowl.position.set(side * 3.6, 4.4, -17.2);
    parent.add(bowl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 12), iron);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(bowl.position);
    rim.position.y += 0.12;
    parent.add(rim);
  }

  // Iron grate
  const barGeo = new THREE.BoxGeometry(0.08, 3.4, 0.08);
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(barGeo, iron);
    bar.position.set(i * 0.45, 1.8, -17.55);
    parent.add(bar);
  }
  for (let i = 0; i < 5; i++) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 0.08), iron);
    cross.position.set(0, 0.55 + i * 0.7, -17.55);
    parent.add(cross);
  }

  // Crest
  const crest = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 8, 18), brass);
  crest.position.set(0, 4.45, -17.35);
  parent.add(crest);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), brass);
  hub.position.copy(crest.position);
  parent.add(hub);

  // Side wall + stairs
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.6, 1.2), stone);
  wall.position.set(-7.6, 1.3, -14);
  wall.castShadow = true;
  parent.add(wall);
  for (let i = 0; i < 5; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 0.65), stone);
    step.position.set(-5.1, 0.13 + i * 0.26, -12.3 - i * 0.52);
    step.castShadow = true;
    parent.add(step);
  }

  // Stained-glass rose proxy (emissive plane if abbey GLB behind)
  const glassMap = getStainedGlassTexture();
  const rose = new THREE.Mesh(
    new THREE.CircleGeometry(1.85, 28),
    new THREE.MeshStandardMaterial({
      map: glassMap,
      emissiveMap: glassMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.8,
      roughness: 0.35,
      metalness: 0.05,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  rose.position.set(0, 5.8, -22.2);
  parent.add(rose);
  const roseLight = new THREE.PointLight(0xff8844, 4.5, 22, 1.6);
  roseLight.position.set(0, 5.5, -20);
  parent.add(roseLight);

  // Lancets glow
  for (const x of [-4.2, -2, 2, 4.2]) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 2.1),
      new THREE.MeshStandardMaterial({
        color: x > 0 ? 0x3355aa : 0xaa4422,
        emissive: x > 0 ? 0x4466cc : 0xcc5533,
        emissiveIntensity: 2.2,
        toneMapped: false,
      }),
    );
    pane.position.set(x, 3.2, -21.8);
    parent.add(pane);
  }

  // Procedural mushroom clusters (fallback density; GLB props add more)
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xc8bca8, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x6a2a90,
    emissive: 0x8844cc,
    emissiveIntensity: 1.6,
    roughness: 0.55,
    toneMapped: false,
  });
  const mushSpots: [number, number][] = [
    [-3.5, -4],
    [2.8, -7],
    [-5.5, 2],
    [4.2, 1],
    [-2, -11],
    [3.5, -14],
    [6, -8],
    [-6.5, -6],
  ];
  for (const [mx, mz] of mushSpots) {
    const cluster = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const h = 0.12 + i * 0.04;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, h, 6), stemMat);
      stem.position.set((i - 1.5) * 0.12, h / 2, (i % 2) * 0.1);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09 + i * 0.015, 8, 6), capMat);
      cap.scale.y = 0.55;
      cap.position.set(stem.position.x, h + 0.04, stem.position.z);
      cluster.add(stem, cap);
    }
    cluster.position.set(mx, 0, mz);
    parent.add(cluster);
  }

  // Background pines
  const pineMat = new THREE.MeshStandardMaterial({
    color: 0x1a2218,
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < 14; i++) {
    const h = 4.5 + (i % 5) * 0.8;
    const pine = new THREE.Mesh(new THREE.ConeGeometry(1.15, h, 6), pineMat);
    const a = -1.1 + i * 0.18;
    pine.position.set(Math.sin(a) * 24, h * 0.45, -18 - Math.cos(a) * 8);
    parent.add(pine);
  }

  // Low fog cards (soft purple)
  const fogMat = new THREE.MeshBasicMaterial({
    color: 0x664488,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    toneMapped: false,
  });
  for (let i = 0; i < 6; i++) {
    const fog = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.8), fogMat);
    fog.position.set((i - 2.5) * 3.5, 0.7, -6 - i * 2);
    fog.rotation.x = -0.15;
    parent.add(fog);
  }
}
