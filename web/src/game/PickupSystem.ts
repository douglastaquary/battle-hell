import * as THREE from 'three';

export type SoulPickup = {
  id: number;
  root: THREE.Group;
  alive: boolean;
  age: number;
  bob: number;
};

/**
 * Cristais de alma — reward legível (cura + gold + soul energy).
 * Usa GLB `crystal` quando disponível; fallback emissivo procedural.
 */
export class PickupSystem {
  readonly root = new THREE.Group();
  pickups: SoulPickup[] = [];
  private nextId = 1;
  private template: THREE.Object3D | null = null;
  private readonly fallbackMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a28,
    emissive: 0x44ff88,
    emissiveIntensity: 2.2,
    roughness: 0.35,
    metalness: 0.2,
    toneMapped: false,
  });

  async ensureTemplate(load: (kind: string) => Promise<THREE.Object3D | null>): Promise<void> {
    if (this.template) return;
    const glb = await load('crystal');
    if (glb) {
      glb.scale.setScalar(0.55);
      this.template = glb;
    }
  }

  spawn(origin: THREE.Vector3): SoulPickup {
    const root = new THREE.Group();
    if (this.template) {
      const gem = this.template.clone(true);
      gem.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.emissive) {
            std.emissiveIntensity = Math.max(std.emissiveIntensity || 0, 1.6);
          }
        }
      });
      root.add(gem);
    } else {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), this.fallbackMat);
      gem.castShadow = true;
      root.add(gem);
    }
    // Soft glow disc for readability at distance
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({
        color: 0x66ffaa,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    root.add(glow);

    root.position.set(origin.x, 0.4, origin.z);
    this.root.add(root);
    const p: SoulPickup = {
      id: this.nextId++,
      root,
      alive: true,
      age: 0,
      bob: Math.random() * Math.PI * 2,
    };
    this.pickups.push(p);
    return p;
  }

  update(dt: number, playerPos: THREE.Vector3, onCollect: (p: SoulPickup) => void): void {
    for (const p of this.pickups) {
      if (!p.alive) continue;
      p.age += dt;
      p.bob += dt * 3.2;
      p.root.position.y = 0.35 + Math.sin(p.bob) * 0.12;
      p.root.rotation.y += dt * 1.8;
      // Lifetime fade after 18s
      if (p.age > 18) {
        p.alive = false;
        this.root.remove(p.root);
        continue;
      }
      const dx = p.root.position.x - playerPos.x;
      const dz = p.root.position.z - playerPos.z;
      if (dx * dx + dz * dz < 1.15 * 1.15) {
        p.alive = false;
        this.root.remove(p.root);
        onCollect(p);
      }
    }
    this.pickups = this.pickups.filter((p) => p.alive);
  }

  clear(): void {
    for (const p of this.pickups) this.root.remove(p.root);
    this.pickups.length = 0;
  }
}
