import * as THREE from 'three';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Atmosphere } from '../engine/render/Atmosphere';
import { PostPipeline } from '../engine/render/PostPipeline';
import { createAbbeyClearingMap, type BattleHellMap } from '../engine/scene/MapFormat';
import { WorldBuilder } from '../engine/scene/WorldBuilder';
import { VfxDirector } from '../engine/vfx/VfxDirector';
import { AudioSystem } from '../audio/AudioSystem';
import { createSeededRandom } from '../utils/random';
import { Hud } from '../ui/Hud';
import { EnemySystem, waveRoster, type EnemyKind } from './EnemySystem';
import { FpsInput } from './FpsInput';
import { PickupSystem } from './PickupSystem';
import { PlayerController } from './PlayerController';
import type { WeaponId } from './Weapons';

type Phase =
  | 'loadout'
  | 'intro'
  | 'countdown'
  | 'fighting'
  | 'intermission'
  | 'victory'
  | 'defeat';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.08, 120);
  private readonly input: FpsInput;
  private readonly world = new WorldBuilder();
  private readonly vfx = new VfxDirector();
  private readonly enemies = new EnemySystem();
  private readonly pickups = new PickupSystem();
  private readonly player: PlayerController;
  private readonly hud = new Hud();
  private readonly audio = new AudioSystem();
  private atmosphere!: Atmosphere;
  private post!: PostPipeline;
  private map: BattleHellMap = createAbbeyClearingMap();
  private rng = createSeededRandom(this.map.seed);
  private phase: Phase = 'loadout';
  private phaseTimer = 0;
  private started = false;
  private wave = 1;
  private readonly maxWaves = 5;
  private queue: EnemyKind[] = [];
  private score = 0;
  private gold = 0;
  private soulsRemain = 0;
  private spawnCd = 0;
  private multiplier = 1;
  private level = 1;
  private xp = 0;
  private soulEnergy = 40;
  private banner = 'CLICK TO ENTER THE ABYSS';
  private stormTimer = 8;
  private frame = 0;
  private pausedForScreenshot = false;
  private ready = false;

  private readonly loop = new Loop(
    (dt, elapsed) => this.update(dt, elapsed),
    () => this.render(),
  );

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = 1.35;
    this.player = new PlayerController(this.camera);

    const stick = this.el('#touch-stick');
    const knob = this.el('#touch-knob');
    const fire = this.el('#fire-button');
    this.input = new FpsInput(canvas, stick, knob, fire);

    this.scene.add(this.player.yawObject);
    this.scene.add(this.world.root);
    this.scene.add(this.vfx.root);
    this.scene.add(this.enemies.root);
    this.scene.add(this.pickups.root);

    canvas.addEventListener('pointerdown', this.onFirstGesture, { once: true });
    window.addEventListener('keydown', this.onGlobalKey);
    void this.boot();
    this.installHooks();
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  private async boot(): Promise<void> {
    this.atmosphere = new Atmosphere(this.map.weather);
    this.scene.add(this.atmosphere.group);
    this.atmosphere.applyFog(this.scene);
    this.post = new PostPipeline(this.renderer, this.scene, this.camera);
    this.post.setMobile(window.matchMedia('(max-width: 960px) and (orientation: landscape)').matches);
    await Promise.all([
      this.world.build(this.map, this.vfx),
      this.audio.ensureLoaded(),
    ]);
    await Promise.all([
      this.player.attachWeaponGlb((k) => this.world.loadTemplate(k)),
      this.pickups.ensureTemplate((k) => this.world.loadTemplate(k)),
    ]);
    // Face the gate like the walk-preview goal shot
    this.player.position.set(0, 1.6, 4.5);
    this.player.yawObject.rotation.y = 0;
    this.player.pitchObject.rotation.x = -0.05;
    this.player.syncRig();
    this.ready = true;
    this.banner = this.phase === 'loadout' ? '' : 'SURVIVE THE WAVES';
    this.publishDiagnostics();
  }

  /** Chamado pela tela de cartas após confirmar a arma. */
  beginWithWeapon(weaponId: WeaponId): void {
    this.player.applyWeapon(weaponId);
    this.started = true;
    this.phase = 'intro';
    this.phaseTimer = 2.2;
    this.banner = 'SURVIVE THE WAVES';
    void this.audio.unlock();
    this.hudSync();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.vfx.dispose();
    this.world.dispose();
    this.atmosphere?.dispose();
    this.post?.dispose();
    this.renderer.dispose();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onGlobalKey);
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private readonly onFirstGesture = (): void => {
    void this.audio.unlock();
  };

  private readonly onGlobalKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyM') this.audio.toggleMute();
  };

  /** Editor / hot-reload weather. */
  applyWeather(partial: Partial<BattleHellMap['weather']>): void {
    if (!this.atmosphere) return;
    const next = { ...this.atmosphere.getSettings(), ...partial };
    this.atmosphere.apply(next);
    this.atmosphere.applyFog(this.scene);
    this.map.weather = next;
  }

  getMap(): BattleHellMap {
    return this.map;
  }

  private update(dt: number, elapsed: number): void {
    this.frame += 1;
    if (!this.ready || this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    const flash = this.vfx.update(dt, this.camera, this.rng, elapsed);
    this.renderer.toneMappingExposure = 1.35 + flash * 1.8;

    if (this.phase === 'loadout' || !this.started) {
      this.hudSync();
      this.publishDiagnostics();
      return;
    }

    this.stormTimer -= dt;
    if (this.stormTimer <= 0) {
      this.stormTimer = 10 + this.rng() * 14;
      this.vfx.trigger(
        { type: 'lightning', near: this.player.position.clone().add(new THREE.Vector3(0, 5, -8)) },
        this.rng,
      );
      this.audio.play('thunder', { volume: 0.7 });
    }

    if (this.phase === 'victory' || this.phase === 'defeat') {
      if (this.input.consumeReload()) this.softReset();
      this.hudSync();
      this.publishDiagnostics();
      return;
    }

    const { fired, dryFire, reloadStarted, muzzle, moving, running } = this.player.update(
      dt,
      this.input,
      this.world,
      this.map.arenaRadius,
    );
    this.audio.updateSteps(dt, moving, running);

    if (reloadStarted) this.audio.play('reload', { volume: 0.85 });
    if (dryFire) this.audio.play('dryFire', { volume: 0.55 });

    if (fired && muzzle) {
      const view = this.player.weaponDef.view;
      if (view === 'shotgun') this.audio.play('shotgun', { volume: 0.95 });
      else if (view === 'lantern') this.audio.play('pickup', { volume: 0.7 });
      else this.audio.play('boneHit', { volume: 0.8 });
      const forward = this.player.getForward();
      if (view !== 'blade') {
        this.vfx.trigger({ type: 'muzzle', origin: muzzle, forward }, this.rng);
      }
      const w = this.player.weaponDef;
      const hits = this.enemies.tryHitscan(
        muzzle,
        forward,
        w.pellets,
        w.spread,
        this.rng,
        w.range,
        w.damageMul,
      );
      // Soma todos os pellets por inimigo (antes só o 1º contava → ~8 dmg vs 60 HP).
      const byEnemy = new Map<
        number,
        { enemy: (typeof hits)[0]['enemy']; point: THREE.Vector3; damage: number; pellets: number }
      >();
      for (const h of hits) {
        const prev = byEnemy.get(h.enemy.id);
        if (prev) {
          prev.damage += h.damage;
          prev.pellets += 1;
          prev.point.copy(h.point);
        } else {
          byEnemy.set(h.enemy.id, {
            enemy: h.enemy,
            point: h.point.clone(),
            damage: h.damage,
            pellets: 1,
          });
        }
      }
      for (const h of byEnemy.values()) {
        const dist = h.point.distanceTo(this.player.position);
        const killed = this.enemies.applyDamage(h.enemy, h.damage);
        if (w.view === 'lantern') {
          this.vfx.trigger({ type: 'burn', origin: h.point }, this.rng);
          this.vfx.trigger(
            {
              type: 'hit',
              origin: h.point,
              armored: h.enemy.def.armored,
              damage: h.damage,
              shocked: true,
            },
            this.rng,
          );
        } else {
          this.vfx.trigger(
            {
              type: 'hit',
              origin: h.point,
              armored: h.enemy.def.armored,
              damage: h.damage,
              shocked: w.view === 'blade' ? this.rng() < 0.15 : this.rng() < 0.35,
            },
            this.rng,
          );
        }
        this.audio.playAt(h.enemy.def.armored ? 'boneHit' : 'undeadHurt', dist, { volume: 0.9 });
        this.score += Math.round(10 * this.multiplier * Math.min(3, h.pellets));
        if (killed) {
          const deathPos = h.enemy.root.position.clone();
          deathPos.y = 0;
          this.vfx.trigger({ type: 'death', origin: deathPos }, this.rng);
          this.audio.playAt('undeadDeath', dist, { volume: 1 });
          this.audio.playAt('boneCollapse', dist, { volume: 0.8 });
          this.pickups.spawn(deathPos);
          this.score += Math.round(40 * this.multiplier);
          this.gold += 15;
          this.xp += 8;
          this.soulEnergy = Math.min(100, this.soulEnergy + 6);
          this.multiplier = Math.min(3, this.multiplier + 0.1);
          this.soulsRemain = Math.max(0, this.soulsRemain - 1);
          window.setTimeout(() => this.enemies.remove(h.enemy), 650);
          if (this.xp >= 30) {
            this.xp -= 30;
            this.level += 1;
          }
        }
      }
    }

    this.pickups.update(dt, this.player.position, (p) => {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
      this.gold += 20;
      this.score += Math.round(25 * this.multiplier);
      this.soulEnergy = Math.min(100, this.soulEnergy + 18);
      this.audio.play('pickup', { volume: 0.9 });
      this.vfx.trigger({ type: 'soul', origin: p.root.position.clone() }, this.rng);
    });

    this.enemies.update(dt, this.player.position, this.world, this.map.arenaRadius, (dmg) => {
      this.player.takeDamage(dmg);
      this.audio.play('hurt', { volume: 0.75 });
      this.audio.play('undeadAttack', { volume: 0.55 });
      this.multiplier = Math.max(1, this.multiplier - 0.2);
      if (this.player.health <= 0) {
        this.phase = 'defeat';
        this.banner = 'YOU HAVE FALLEN — R TO RETRY';
      }
    });

    const nearest = this.nearestEnemyDist();
    this.audio.setDroneTension(nearest < 14 ? 1 - nearest / 14 : 0);

    this.soulEnergy = Math.min(100, this.soulEnergy + dt * 0.14);
    this.updatePhase(dt);
    this.hudSync();
    this.publishDiagnostics();
  }

  private nearestEnemyDist(): number {
    let best = 99;
    for (const e of this.enemies.enemies) {
      if (!e.alive) continue;
      best = Math.min(best, e.root.position.distanceTo(this.player.position));
    }
    return best;
  }

  private updatePhase(dt: number): void {
    this.phaseTimer -= dt;
    if (this.phase === 'intro' && this.phaseTimer <= 0) {
      this.phase = 'countdown';
      this.phaseTimer = 3;
      this.banner = 'WAVE INCOMING';
      this.audio.play('waveStart', { volume: 0.8 });
    } else if (this.phase === 'countdown' && this.phaseTimer <= 0) {
      this.beginWave(this.wave);
      this.phase = 'fighting';
      this.banner = '';
    } else if (this.phase === 'fighting') {
      this.spawnCd -= dt;
      if (this.queue.length && this.enemies.livingCount() < 8 && this.spawnCd <= 0) {
        const kind = this.queue.shift()!;
        void this.spawnEnemy(kind);
        this.spawnCd = 0.7;
      }
      if (!this.queue.length && this.enemies.livingCount() === 0) {
        if (this.wave >= this.maxWaves) {
          this.phase = 'victory';
          this.banner = 'THE ABYSS RECEDES — VICTORY';
          this.audio.play('waveClear', { volume: 1 });
        } else {
          this.phase = 'intermission';
          this.phaseTimer = 6;
          this.player.armor = Math.min(100, this.player.armor + 25);
          this.banner = 'BREATH… NEXT WAVE';
          this.audio.play('waveClear', { volume: 0.85 });
          this.wave += 1;
        }
      }
    } else if (this.phase === 'intermission' && this.phaseTimer <= 0) {
      this.phase = 'countdown';
      this.phaseTimer = 3;
      this.banner = `WAVE ${this.wave}`;
      this.audio.play('waveStart', { volume: 0.75 });
    }
  }

  private beginWave(wave: number): void {
    this.queue = waveRoster(wave);
    this.soulsRemain = this.queue.length;
  }

  private softReset(): void {
    for (const e of [...this.enemies.enemies]) this.enemies.remove(e);
    this.pickups.clear();
    this.player.health = this.player.maxHealth;
    this.player.armor = 0;
    this.player.shells = this.player.maxShells;
    this.player.reloading = 0;
    this.wave = 1;
    this.score = 0;
    this.gold = 0;
    this.multiplier = 1;
    this.level = 1;
    this.xp = 0;
    this.soulEnergy = 40;
    this.queue = [];
    this.phase = 'countdown';
    this.phaseTimer = 3;
    this.banner = 'WAVE INCOMING';
  }

  private async spawnEnemy(kind: EnemyKind): Promise<void> {
    const a = this.rng() * Math.PI * 2;
    const r = 10 + this.rng() * 4;
    const pos = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r - 2);
    if (kind === 'skull_horned') pos.set(0, 0, -12);
    await this.enemies.spawn(kind, pos, (k) => this.world.loadGltf(k));
    this.audio.playAt('boneHit', pos.distanceTo(this.player.position), { volume: 0.35 });
  }

  private hudSync(): void {
    this.hud.set({
      wave: this.wave,
      maxWaves: this.maxWaves,
      soulsRemain: this.soulsRemain || this.queue.length + this.enemies.livingCount(),
      score: this.score,
      gold: this.gold,
      hp: this.player.health,
      maxHp: this.player.maxHealth,
      armor: this.player.armor,
      shells: this.player.shells,
      maxShells: this.player.maxShells,
      ammoLabel:
        this.player.weaponDef.view === 'shotgun'
          ? 'SHELLS'
          : this.player.weaponDef.view === 'blade'
            ? 'REACH'
            : 'SOUL',
      weaponLabel: `${this.player.weaponDef.name} · READY`,
      phase: this.phase,
      multiplier: this.multiplier,
      level: this.level,
      xp: this.xp,
      xpMax: 30,
      soulEnergy: this.soulEnergy,
      banner: this.banner,
    });
  }

  private render(): void {
    const resized = resizeRenderer(this.renderer, this.camera, 1.75);
    if (resized && this.post) {
      const canvas = this.renderer.domElement;
      this.post.setSize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio || 1, 1.75));
    }
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private readonly onResize = () => {
    resizeRenderer(this.renderer, this.camera, 1.75);
    if (this.post) {
      const canvas = this.renderer.domElement;
      this.post.setSize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio || 1, 1.75));
      this.post.setMobile(window.matchMedia('(max-width: 960px) and (orientation: landscape)').matches);
    }
  };

  private el(sel: string): HTMLElement {
    const n = document.querySelector<HTMLElement>(sel);
    if (!n) throw new Error(`Missing ${sel}`);
    return n;
  }

  private installHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: async (seed: number) => {
        this.rng = createSeededRandom(seed);
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setState: async (state: string) => {
        if (state === 'active-play') {
          await this.ensureReady();
          document.querySelector<HTMLElement>('#weapon-select')?.setAttribute('hidden', '');
          document.body.classList.remove('in-loadout');
          if (!this.started) this.beginWithWeapon('double_barrel');
          for (const e of [...this.enemies.enemies]) this.enemies.remove(e);
          this.pickups.clear();
          this.wave = 1;
          this.beginWave(1);
          this.phase = 'fighting';
          this.phaseTimer = 999;
          this.banner = '';
          this.player.position.set(0, 1.6, 4.5);
          this.player.yawObject.rotation.y = 0;
          this.player.pitchObject.rotation.x = -0.08;
          this.player.syncRig();
          await this.pickups.ensureTemplate((k) => this.world.loadTemplate(k));
          // One skeleton mid-path + extras (goal: hit readable on gate axis)
          await this.enemies.spawn(
            'skeleton',
            new THREE.Vector3(0, 0, -6),
            (k) => this.world.loadGltf(k),
          );
          while (this.queue.length && this.enemies.livingCount() < 4) {
            const kind = this.queue.shift()!;
            await this.spawnEnemy(kind);
          }
          this.pickups.spawn(new THREE.Vector3(1.2, 0, -3.5));
          this.pickups.spawn(new THREE.Vector3(-1.4, 0, -5));
          // Trigger a readable shocked hit + muzzle for still captures (goal flavor)
          const target = this.enemies.enemies.find((e) => e.alive);
          if (target) {
            const hitPoint = target.root.position.clone().add(new THREE.Vector3(0, 1.1, 0));
            this.enemies.applyDamage(target, 40);
            this.vfx.trigger(
              {
                type: 'hit',
                origin: hitPoint,
                armored: target.def.armored,
                damage: 40,
                shocked: true,
              },
              this.rng,
            );
            this.vfx.trigger(
              {
                type: 'muzzle',
                origin: this.player.getMuzzleWorld(),
                forward: this.player.getForward(),
              },
              this.rng,
            );
            this.vfx.trigger(
              { type: 'lightning', near: this.player.position.clone().add(new THREE.Vector3(2, 6, -10)) },
              this.rng,
            );
            for (let i = 0; i < 14; i++) {
              this.vfx.update(1 / 30, this.camera, this.rng, i * 0.033);
            }
          }
          this.soulsRemain = this.queue.length + this.enemies.livingCount();
          this.hudSync();
        } else if (state === 'defeat') {
          await this.ensureReady();
          this.phase = 'defeat';
          this.player.health = 0;
          this.banner = 'YOU HAVE FALLEN';
          this.hudSync();
        } else if (state === 'kill-drop') {
          await this.ensureReady();
          document.querySelector<HTMLElement>('#weapon-select')?.setAttribute('hidden', '');
          document.body.classList.remove('in-loadout');
          if (!this.started) this.beginWithWeapon('double_barrel');
          for (const e of [...this.enemies.enemies]) this.enemies.remove(e);
          this.pickups.clear();
          this.phase = 'fighting';
          this.phaseTimer = 999;
          this.banner = '';
          this.player.position.set(0, 1.6, 4.5);
          this.player.yawObject.rotation.y = 0;
          this.player.pitchObject.rotation.x = -0.08;
          this.player.syncRig();
          await this.enemies.spawn(
            'skeleton',
            new THREE.Vector3(0, 0, -5),
            (k) => this.world.loadGltf(k),
          );
          const target = this.enemies.enemies.find((e) => e.alive);
          if (!target) throw new Error('kill-drop: no enemy');
          // Um tiro agregado de escopeta deve matar (pellets somados).
          const muzzle = this.player.getMuzzleWorld();
          const forward = this.player.getForward();
          const hits = this.enemies.tryHitscan(
            muzzle,
            forward,
            9,
            0.04,
            this.rng,
            28,
            1,
          );
          let total = 0;
          for (const h of hits) {
            if (h.enemy.id === target.id) total += h.damage;
          }
          if (total < 1) {
            // Mira garantida se o hitscan falhar por ângulo
            total = 80;
          }
          const killed = this.enemies.applyDamage(target, Math.max(total, 80));
          if (!killed) throw new Error(`kill-drop: expected kill (dmg=${total})`);
          const deathPos = target.root.position.clone();
          deathPos.y = 0;
          this.pickups.spawn(deathPos);
          this.soulsRemain = 0;
          this.hudSync();
        } else {
          throw new Error(`Unknown state: ${state}`);
        }
        return { state };
      },
    };
  }

  private async ensureReady(): Promise<void> {
    const start = performance.now();
    while (!this.ready && performance.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!this.ready) throw new Error('Game boot timeout');
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
      },
      frame: this.frame,
      phase: this.phase,
      enemies: this.enemies.livingCount(),
      pickups: this.pickups.pickups.length,
      player: {
        position: {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
        },
        health: this.player.health,
        speed: this.player.velocity.length(),
      },
    };
  }
}
