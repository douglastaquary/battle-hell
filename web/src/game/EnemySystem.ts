import * as THREE from 'three';
import type { WorldBuilder } from '../engine/scene/WorldBuilder';

export type EnemyKind = 'skeleton' | 'skeleton_reaper' | 'skeleton_knight' | 'ghoul' | 'skull_horned';

type EnemyDef = {
  kind: EnemyKind;
  hp: number;
  speed: number;
  damage: number;
  scale: number;
  armored?: boolean;
};

const DEFS: Record<EnemyKind, EnemyDef> = {
  skeleton: { kind: 'skeleton', hp: 60, speed: 1.7, damage: 10, scale: 1 },
  skeleton_reaper: { kind: 'skeleton_reaper', hp: 45, speed: 2.7, damage: 8, scale: 0.95 },
  skeleton_knight: { kind: 'skeleton_knight', hp: 150, speed: 1.35, damage: 18, scale: 1.05, armored: true },
  ghoul: { kind: 'ghoul', hp: 95, speed: 2.1, damage: 14, scale: 1 },
  skull_horned: { kind: 'skull_horned', hp: 55, speed: 3.0, damage: 12, scale: 0.8 },
};

export type Enemy = {
  id: number;
  def: EnemyDef;
  root: THREE.Object3D;
  hp: number;
  state: 'rising' | 'chase' | 'attack' | 'dead';
  rise: number;
  attackCd: number;
  hitFlash: number;
  alive: boolean;
};

export class EnemySystem {
  readonly root = new THREE.Group();
  enemies: Enemy[] = [];
  private nextId = 1;
  private readonly fallbackMat = new THREE.MeshStandardMaterial({
    color: 0xc8bca8,
    roughness: 0.85,
  });

  async spawn(
    kind: EnemyKind,
    position: THREE.Vector3,
    load: (k: string) => Promise<THREE.Object3D | null>,
  ): Promise<Enemy> {
    const def = DEFS[kind];
    let model = await load(kind);
    if (!model) {
      model = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), this.fallbackMat.clone());
      model.position.y = 1;
    }
    model.scale.setScalar(def.scale);
    const root = new THREE.Group();
    root.add(model);
    root.position.copy(position);
    root.position.y = -1.2;
    this.root.add(root);
    const enemy: Enemy = {
      id: this.nextId++,
      def,
      root,
      hp: def.hp,
      state: 'rising',
      rise: 0,
      attackCd: 0,
      hitFlash: 0,
      alive: true,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    world: WorldBuilder,
    arenaRadius: number,
    onAttack: (dmg: number) => void,
  ): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      this.applyHitFlashVisual(e);
      if (e.state === 'rising') {
        e.rise += dt;
        e.root.position.y = THREE.MathUtils.lerp(-1.2, 0, Math.min(1, e.rise / 0.9));
        if (e.rise >= 0.9) e.state = 'chase';
        continue;
      }
      if (e.state === 'dead') continue;

      const pos = e.root.position;
      const toPlayer = new THREE.Vector3().subVectors(playerPos, pos);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      if (dist > 0.001) {
        e.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      }

      if (dist < 1.35) {
        e.state = 'attack';
        e.attackCd -= dt;
        if (e.attackCd <= 0) {
          e.attackCd = 1.1;
          onAttack(e.def.damage);
        }
      } else {
        e.state = 'chase';
        const dir = toPlayer.normalize();
        let speed = e.def.speed;
        if (e.def.kind === 'skeleton_reaper') {
          const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.sin(performance.now() * 0.004));
          dir.add(side).normalize();
        }
        const nx = pos.x + dir.x * speed * dt;
        const nz = pos.z + dir.z * speed * dt;
        if (!world.collides(nx, pos.z, 0.4, arenaRadius)) pos.x = nx;
        if (!world.collides(pos.x, nz, 0.4, arenaRadius)) pos.z = nz;
        if (e.def.kind === 'skull_horned') pos.y = 1.4 + Math.sin(performance.now() * 0.003) * 0.2;
      }
    }
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive && e.state === 'dead') {
        // keep briefly handled by caller removal
      }
      return true;
    });
  }

  tryHitscan(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    pellets: number,
    spread: number,
    rng: () => number,
  ): { enemy: Enemy; point: THREE.Vector3; damage: number }[] {
    const hits: { enemy: Enemy; point: THREE.Vector3; damage: number }[] = [];
    for (let p = 0; p < pellets; p++) {
      const d = dir.clone();
      d.x += (rng() - 0.5) * spread;
      d.y += (rng() - 0.5) * spread * 0.6;
      d.z += (rng() - 0.5) * spread;
      d.normalize();
      let best: Enemy | null = null;
      let bestT = 28;
      let bestPoint = new THREE.Vector3();
      for (const e of this.enemies) {
        if (!e.alive || e.state === 'rising') continue;
        const center = e.root.position.clone();
        center.y += e.def.kind === 'skull_horned' ? 0.3 : 1.0;
        const radius = 0.55;
        const to = center.clone().sub(origin);
        const t = to.dot(d);
        if (t < 0.3 || t > bestT) continue;
        const closest = origin.clone().addScaledVector(d, t);
        if (closest.distanceTo(center) <= radius) {
          best = e;
          bestT = t;
          bestPoint = closest;
        }
      }
      if (best) {
        const head = bestPoint.y > best.root.position.y + 1.45;
        let dmg = head ? 14 : 8;
        if (best.def.armored) dmg *= 0.7;
        const falloff = bestT > 6 ? 0.65 : 1;
        dmg *= falloff;
        hits.push({ enemy: best, point: bestPoint, damage: dmg });
      }
    }
    return hits;
  }

  applyDamage(enemy: Enemy, amount: number): boolean {
    if (!enemy.alive) return false;
    enemy.hp -= amount;
    enemy.hitFlash = 0.18;
    this.applyHitFlashVisual(enemy);
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.state = 'dead';
      return true;
    }
    return false;
  }

  private applyHitFlashVisual(enemy: Enemy): void {
    const t = enemy.hitFlash > 0 ? Math.min(1, enemy.hitFlash / 0.18) : 0;
    enemy.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.emissive) continue;
        if (t > 0) {
          std.emissive.setRGB(0.85 * t, 0.55 * t, 0.25 * t);
          std.emissiveIntensity = 1.8 * t;
        } else if (std.emissiveIntensity > 0.01 && std.emissive.r > 0.5) {
          std.emissive.setRGB(0, 0, 0);
          std.emissiveIntensity = 0;
        }
      }
    });
  }

  remove(enemy: Enemy): void {
    this.root.remove(enemy.root);
    this.enemies = this.enemies.filter((e) => e.id !== enemy.id);
  }

  livingCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }
}

export function waveRoster(wave: number): EnemyKind[] {
  switch (wave) {
    case 1:
      return Array(5).fill('skeleton');
    case 2:
      return [...Array(4).fill('skeleton'), ...Array(3).fill('skeleton_reaper')];
    case 3:
      return [
        ...Array(3).fill('skeleton'),
        ...Array(2).fill('skeleton_reaper'),
        ...Array(3).fill('ghoul'),
        'skull_horned',
      ];
    case 4:
      return [
        ...Array(3).fill('skeleton_reaper'),
        ...Array(2).fill('skeleton_knight'),
        ...Array(2).fill('ghoul'),
        ...Array(2).fill('skull_horned'),
      ];
    default:
      return [
        ...Array(3).fill('skeleton'),
        ...Array(2).fill('skeleton_knight'),
        ...Array(2).fill('skull_horned'),
        'skeleton_knight',
      ];
  }
}
