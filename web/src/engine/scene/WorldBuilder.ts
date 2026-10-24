import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Materials } from '../render/MaterialKit';
import type { VfxDirector } from '../vfx/VfxDirector';
import { buildAbbeyDressing } from './AbbeyDressing';
import type { BattleHellMap, MapProp } from './MapFormat';

const BASE = import.meta.env.BASE_URL || '/';

const MODEL_URL: Record<string, string> = {
  gate: `${BASE}models/gate.glb`,
  wall: `${BASE}models/wall.glb`,
  brazier: `${BASE}models/brazier.glb`,
  tree_a: `${BASE}models/tree_a.glb`,
  tree_b: `${BASE}models/tree_b.glb`,
  grave_a: `${BASE}models/grave_a.glb`,
  grave_b: `${BASE}models/grave_b.glb`,
  gallows: `${BASE}models/gallows.glb`,
  rock: `${BASE}models/rock.glb`,
  crystal: `${BASE}models/crystal.glb`,
  weapon: `${BASE}models/weapon.glb`,
  abbey: `${BASE}models/abbey.glb`,
  mushroom: `${BASE}models/mushroom.glb`,
  skeleton: `${BASE}models/skeleton.glb`,
  skeleton_reaper: `${BASE}models/skeleton_reaper.glb`,
  skeleton_knight: `${BASE}models/skeleton_knight.glb`,
  skeleton_warlord: `${BASE}models/skeleton_warlord.glb`,
  ghoul: `${BASE}models/ghoul.glb`,
  skull_horned: `${BASE}models/skull_horned.glb`,
};

function boostEmissive(root: THREE.Object3D, factor = 10): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.emissive && std.emissiveIntensity !== undefined) {
        const e = std.emissive;
        if (e.r + e.g + e.b > 0.01) {
          std.emissiveIntensity = Math.max(std.emissiveIntensity, 1) * factor;
        }
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

export class WorldBuilder {
  readonly root = new THREE.Group();
  readonly obstacles: { x: number; z: number; r: number }[] = [];
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, THREE.Object3D>();
  private readonly animCache = new Map<string, THREE.AnimationClip[]>();
  private readonly groundMat: THREE.MeshStandardMaterial;

  constructor() {
    this.groundMat = Materials.dirt();
  }

  async loadTemplate(kind: string): Promise<THREE.Object3D | null> {
    const packed = await this.loadGltf(kind);
    return packed?.scene ?? null;
  }

  async loadGltf(
    kind: string,
  ): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null> {
    const url = MODEL_URL[kind];
    if (!url) return null;
    if (this.cache.has(kind)) {
      return {
        scene: this.cache.get(kind)!.clone(true),
        clips: this.animCache.get(kind) ?? [],
      };
    }
    try {
      const gltf = await this.loader.loadAsync(url);
      boostEmissive(gltf.scene);
      this.cache.set(kind, gltf.scene);
      this.animCache.set(kind, gltf.animations ?? []);
      return {
        scene: gltf.scene.clone(true),
        clips: gltf.animations ?? [],
      };
    } catch {
      const fallback = this.fallbackProp(kind);
      return fallback ? { scene: fallback, clips: [] } : null;
    }
  }

  private fallbackProp(kind: string): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === 'brazier') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.85 }),
      );
      base.position.y = 0.45;
      base.castShadow = true;
      g.add(base);
    } else if (kind.startsWith('tree')) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.25, 3.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2218 }),
      );
      trunk.position.y = 1.6;
      trunk.castShadow = true;
      g.add(trunk);
    } else if (kind.startsWith('grave')) {
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.1, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.95 }),
      );
      stone.position.y = 0.55;
      stone.castShadow = true;
      g.add(stone);
    } else if (kind === 'gate') {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 4, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x4a4640 }),
      );
      pillar.position.set(-2.2, 2, 0);
      const pillar2 = pillar.clone();
      pillar2.position.x = 2.2;
      g.add(pillar, pillar2);
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x555045 }),
      );
      box.position.y = 0.5;
      box.castShadow = true;
      g.add(box);
    }
    return g;
  }

  async build(map: BattleHellMap, vfx: VfxDirector): Promise<void> {
    while (this.root.children.length) {
      this.root.remove(this.root.children[0]);
    }
    this.obstacles.length = 0;

    vfx.clearBraziers();

    const ground = new THREE.Mesh(new THREE.CircleGeometry(map.arenaRadius + 2, 48), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    buildAbbeyDressing(this.root);

    // Pillar braziers (match walk-preview flanking gate)
    for (const side of [-1, 1] as const) {
      const light = new THREE.PointLight(0xff9a40, 7.5, 16, 1.7);
      light.position.set(side * 3.6, 4.55, -17.2);
      light.castShadow = false;
      this.root.add(light);
      vfx.registerBrazier(new THREE.Vector3(side * 3.6, 0, -17.2), light, 4.55);
    }

    for (const prop of map.props) {
      await this.spawnProp(prop, vfx);
    }
  }

  private async spawnProp(prop: MapProp, vfx: VfxDirector): Promise<void> {
    const obj = await this.loadTemplate(prop.kind);
    if (!obj) return;
    const [x, y, z] = prop.position;
    obj.position.set(x, y, z);
    if (prop.rotationY) obj.rotation.y = prop.rotationY;
    if (typeof prop.scale === 'number') obj.scale.setScalar(prop.scale);
    else if (Array.isArray(prop.scale)) obj.scale.set(...prop.scale);
    this.root.add(obj);

    if (prop.kind === 'brazier') {
      const light = new THREE.PointLight(0xff9a40, 8.5, 18, 1.6);
      light.position.set(x, 1.3, z);
      const brazierLights = this.root.children.filter(
        (c) => (c as THREE.PointLight).isPointLight,
      ).length;
      light.castShadow = brazierLights < 2;
      this.root.add(light);
      vfx.registerBrazier(new THREE.Vector3(x, 0, z), light);
      this.obstacles.push({ x, z, r: 0.55 });
    } else if (
      prop.kind === 'gate' ||
      prop.kind === 'abbey' ||
      prop.kind === 'wall' ||
      prop.kind.startsWith('tree') ||
      prop.kind === 'gallows'
    ) {
      this.obstacles.push({ x, z, r: prop.kind.startsWith('tree') ? 0.6 : prop.kind === 'abbey' ? 4.5 : 1.2 });
    } else if (prop.kind.startsWith('grave') || prop.kind === 'rock') {
      this.obstacles.push({ x, z, r: 0.45 });
    }
  }

  collides(x: number, z: number, radius: number, arenaRadius: number): boolean {
    if (x * x + z * z > (arenaRadius - radius) ** 2) return true;
    for (const o of this.obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      if (dx * dx + dz * dz < (radius + o.r) ** 2) return true;
    }
    return false;
  }

  dispose(): void {
    this.groundMat.dispose();
  }
}
