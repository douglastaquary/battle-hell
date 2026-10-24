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
  mixer?: THREE.AnimationMixer;
  actions?: Partial<Record<'idle' | 'walk' | 'attack' | 'hit' | 'death', THREE.AnimationAction>>;
  currentClip?: string;
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
    load: (
      k: string,
    ) => Promise<THREE.Object3D | null | { scene: THREE.Object3D; clips: THREE.AnimationClip[] }>,
  ): Promise<Enemy> {
    const def = DEFS[kind];
    const loaded = await load(kind);
    let model: THREE.Object3D;
    let clips: THREE.AnimationClip[] = [];
    if (loaded && 'scene' in loaded && loaded.scene) {
      model = loaded.scene;
      clips = loaded.clips ?? [];
    } else if (loaded && (loaded as THREE.Object3D).isObject3D) {
      model = loaded as THREE.Object3D;
    } else {
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
    if (clips.length) {
      const mixer = new THREE.AnimationMixer(model);
      const actions: Enemy['actions'] = {};
      const pick = (names: string[]) =>
        clips.find((c) => names.some((n) => c.name.toLowerCase().includes(n)));
      const map: Array<[keyof NonNullable<Enemy['actions']>, string[]]> = [
        ['idle', ['idle']],
        ['walk', ['walk']],
        ['attack', ['attack']],
        ['hit', ['hit']],
        ['death', ['death']],
      ];
      for (const [key, names] of map) {
        const clip = pick(names);
        if (clip) actions[key] = mixer.clipAction(clip);
      }
      enemy.mixer = mixer;
      enemy.actions = actions;
      this.playClip(enemy, 'idle');
    }
    this.enemies.push(enemy);
    return enemy;
  }

  private playClip(enemy: Enemy, name: keyof NonNullable<Enemy['actions']>): void {
    if (!enemy.actions || enemy.currentClip === name) return;
    const next = enemy.actions[name];
    if (!next) return;
    const prev = enemy.currentClip ? enemy.actions[enemy.currentClip as keyof typeof enemy.actions] : undefined;
    if (prev && prev !== next) prev.fadeOut(0.15);
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.15).play();
    if (name === 'attack' || name === 'hit') next.setLoop(THREE.LoopOnce, 1);
    else next.setLoop(THREE.LoopRepeat, Infinity);
    enemy.currentClip = name;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    world: WorldBuilder,
    arenaRadius: number,
    onAttack: (dmg: number) => void,
  ): void {
    for (const e of this.enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      this.applyHitFlashVisual(e);
      e.mixer?.update(dt);
      if (e.state === 'dead' || !e.alive) {
        this.playClip(e, 'death');
        continue;
      }
      if (e.state === 'rising') {
        e.rise += dt;
        e.root.position.y = THREE.MathUtils.lerp(-1.2, 0, Math.min(1, e.rise / 0.9));
        if (e.rise >= 0.9) e.state = 'chase';
        this.playClip(e, 'idle');
        continue;
      }

      const pos = e.root.position;
      const toPlayer = new THREE.Vector3().subVectors(playerPos, pos);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      if (dist > 0.001) {
        e.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      }

      if (dist < 1.35) {
        e.state = 'attack';
        this.playClip(e, 'attack');
        e.attackCd -= dt;
        if (e.attackCd <= 0) {
          e.attackCd = 1.1;
          onAttack(e.def.damage);
        }
      } else {
        e.state = 'chase';
        this.playClip(e, 'walk');
        const dir = toPlayer.normalize();
        if (e.def.kind === 'skeleton_reaper') {
          const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.sin(performance.now() * 0.004));
          dir.add(side).normalize();
        }
        const speed = e.def.speed;
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
    range = 28,
    damageMul = 1,
  ): { enemy: Enemy; point: THREE.Vector3; damage: number }[] {
    const hits: { enemy: Enemy; point: THREE.Vector3; damage: number }[] = [];
    for (let p = 0; p < pellets; p++) {
      const d = dir.clone();
      d.x += (rng() - 0.5) * spread;
      d.y += (rng() - 0.5) * spread * 0.6;
      d.z += (rng() - 0.5) * spread;
      d.normalize();
      let best: Enemy | null = null;
      let bestT = range;
      let bestPoint = new THREE.Vector3();
      for (const e of this.enemies) {
        if (!e.alive || e.state === 'rising') continue;
        const center = e.root.position.clone();
        center.y += e.def.kind === 'skull_horned' ? 0.35 : 1.05;
        const radius = e.def.kind === 'skull_horned' ? 0.7 : 0.85;
        const to = center.clone().sub(origin);
        const t = to.dot(d);
        if (t < 0.2 || t > bestT) continue;
        const closest = origin.clone().addScaledVector(d, t);
        if (closest.distanceTo(center) <= radius) {
          best = e;
          bestT = t;
          bestPoint = closest;
        }
      }
      if (best) {
        const head = bestPoint.y > best.root.position.y + 1.45;
        let dmg = (head ? 16 : 10) * damageMul;
        if (best.def.armored) dmg *= 0.7;
        const falloff = bestT > 8 ? 0.7 : bestT > 4 ? 0.85 : 1;
        dmg *= falloff;
        hits.push({ enemy: best, point: bestPoint, damage: dmg });
      }
    }
    return hits;
  }

  applyDamage(enemy: Enemy, amount: number): boolean {
    if (!enemy.alive || amount <= 0) return false;
    enemy.hp -= amount;
    enemy.hitFlash = 0.22;
    this.applyHitFlashVisual(enemy);
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      enemy.state = 'dead';
      this.playClip(enemy, 'death');
      return true;
    }
    this.playClip(enemy, 'hit');
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
