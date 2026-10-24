import * as THREE from 'three';
import { CombatFloaters } from './CombatFloaters';
import { ParticleSystem3D } from './ParticleSystem3D';
import { ProceduralSpriteEngine, type SpriteFlavor } from './ProceduralSpriteEngine';

export type VfxEvent =
  | { type: 'muzzle'; origin: THREE.Vector3; forward?: THREE.Vector3 }
  | {
      type: 'hit';
      origin: THREE.Vector3;
      armored?: boolean;
      damage?: number;
      shocked?: boolean;
    }
  | { type: 'death'; origin: THREE.Vector3 }
  | { type: 'soul'; origin: THREE.Vector3 }
  | { type: 'burn'; origin: THREE.Vector3 }
  | { type: 'lightning'; near?: THREE.Vector3 };

type BrazierEmitter = {
  position: THREE.Vector3;
  light: THREE.PointLight;
  baseIntensity: number;
};

/**
 * Diretor VFX híbrido: sprites 2D procedurais + pontos 3D + floaters de combate.
 * Eventos jogáveis com flavor Abbey / gothic (não cópia de ativos).
 */
export class VfxDirector {
  readonly root = new THREE.Group();
  readonly sprites = new ProceduralSpriteEngine();
  readonly particles = new ParticleSystem3D();
  readonly floaters = new CombatFloaters();
  private braziers: BrazierEmitter[] = [];
  private flash = 0;
  private dustOrigin = new THREE.Vector3();
  private mistOrigin = new THREE.Vector3();
  private mistTimer = 0;

  constructor() {
    this.root.add(this.sprites.group);
    this.root.add(this.particles.points);
    this.root.add(this.floaters.group);
  }

  clearBraziers(): void {
    this.braziers.length = 0;
  }

  registerBrazier(position: THREE.Vector3, light: THREE.PointLight, flameY = 1.15): void {
    const p = position.clone();
    p.y = flameY;
    this.braziers.push({ position: p, light, baseIntensity: light.intensity });
  }

  trigger(event: VfxEvent, rng: () => number): void {
    switch (event.type) {
      case 'muzzle': {
        const origin = event.origin.clone();
        if (event.forward) origin.addScaledVector(event.forward, 0.15);
        this.sprites.burst(
          {
            flavor: 'muzzle',
            origin,
            count: 8,
            size: 0.85,
            life: 0.12,
            upward: 0.1,
            speed: 0.4,
            spread: 0.25,
            bias: event.forward,
          },
          rng,
        );
        this.sprites.burst(
          {
            flavor: 'flare',
            origin,
            count: 4,
            size: 0.55,
            life: 0.1,
            upward: 0.05,
            speed: 0.2,
            spread: 0.15,
          },
          rng,
        );
        this.sprites.burst(
          {
            flavor: 'spark',
            origin,
            count: 12,
            size: 0.2,
            life: 0.32,
            upward: 0.5,
            speed: 4.2,
            spread: 0.95,
            bias: event.forward,
          },
          rng,
        );
        this.particles.burst(
          origin,
          36,
          { color: 0xffcc66, speed: 6, life: 0.26, size: 0.1 },
          rng,
        );
        break;
      }
      case 'hit': {
        const o = event.origin;
        const shocked = event.shocked ?? (event.armored ? rng() < 0.55 : rng() < 0.28);
        this.sprites.burst(
          {
            flavor: 'impact',
            origin: o,
            count: 3,
            size: 0.9,
            life: 0.28,
            upward: 0.2,
            speed: 0.3,
            spread: 0.2,
            color: 0xe8d8ff,
          },
          rng,
        );
        this.sprites.burst(
          {
            flavor: 'bone',
            origin: o,
            count: 12,
            size: 0.26,
            life: 0.55,
            upward: 1.7,
            speed: 2.9,
            color: 0xf0e6d4,
          },
          rng,
        );
        this.sprites.burst(
          {
            flavor: 'scrap',
            origin: o,
            count: 6,
            size: 0.22,
            life: 0.65,
            upward: 1.2,
            speed: 2.2,
          },
          rng,
        );
        this.sprites.burst(
          {
            flavor: 'smoke',
            origin: o.clone().add(new THREE.Vector3(0, 0.2, 0)),
            count: 5,
            size: 0.55,
            life: 0.7,
            upward: 1.1,
            speed: 0.6,
            color: 0xc8c4d8,
          },
          rng,
        );
        this.sprites.burst(
          {
            flavor: 'spark',
            origin: o,
            count: event.armored ? 18 : 10,
            size: 0.18,
            life: 0.42,
            upward: 1.1,
            speed: 3.6,
            color: event.armored ? 0xffdd88 : 0xffeebb,
          },
          rng,
        );
        if (shocked) {
          this.sprites.burst(
            {
              flavor: 'shock',
              origin: o.clone().add(new THREE.Vector3(0, 0.4, 0)),
              count: 10,
              size: 0.75,
              life: 0.55,
              upward: 0.8,
              speed: 1.4,
              spread: 0.7,
              color: 0xd0a0ff,
            },
            rng,
          );
          this.sprites.burst(
            {
              flavor: 'arc',
              origin: o.clone().add(new THREE.Vector3(0, 0.6, 0)),
              count: 8,
              size: 0.55,
              life: 0.4,
              upward: 0.5,
              speed: 2.2,
              spread: 0.9,
              color: 0xffffff,
            },
            rng,
          );
          this.particles.burst(o, 40, { color: 0xc080ff, speed: 5, life: 0.45, size: 0.08 }, rng);
          this.floaters.spawnStatus(o, 'SHOCKED', rng);
        } else {
          this.particles.burst(
            o,
            40,
            { color: event.armored ? 0xffe0a0 : 0xe8dcc8, speed: 4.4, life: 0.55 },
            rng,
          );
        }
        if (event.damage !== undefined && event.damage > 0) {
          this.floaters.spawnDamage(o, event.damage, rng);
        }
        break;
      }
      case 'death': {
        const mid = event.origin.clone().add(new THREE.Vector3(0, 1, 0));
        this.sprites.burst({
          flavor: 'bone',
          origin: mid,
          count: 24,
          size: 0.34,
          life: 1.05,
          upward: 2.5,
          speed: 3.2,
        }, rng);
        this.sprites.burst({
          flavor: 'scrap',
          origin: mid,
          count: 10,
          size: 0.28,
          life: 0.9,
          upward: 2.0,
          speed: 2.6,
        }, rng);
        this.sprites.burst({
          flavor: 'soul',
          origin: mid.clone().add(new THREE.Vector3(0, 0.3, 0)),
          count: 9,
          size: 0.45,
          life: 1.4,
          upward: 1.7,
          speed: 0.75,
          color: 0x88ffcc,
        }, rng);
        this.sprites.burst({
          flavor: 'mist',
          origin: event.origin.clone().add(new THREE.Vector3(0, 0.15, 0)),
          count: 6,
          size: 1.1,
          life: 1.6,
          upward: 0.35,
          speed: 0.35,
          color: 0xb080ff,
        }, rng);
        this.particles.burst(event.origin, 56, { color: 0xc8b89a, speed: 4.8, life: 0.95 }, rng);
        break;
      }
      case 'soul':
        this.sprites.burst({
          flavor: 'soul',
          origin: event.origin,
          count: 7,
          size: 0.4,
          life: 1.45,
          upward: 0.9,
          speed: 0.45,
          color: 0xaaff88,
        }, rng);
        this.sprites.burst({
          flavor: 'bloom',
          origin: event.origin,
          count: 2,
          size: 0.9,
          life: 0.35,
          upward: 0.2,
          speed: 0.1,
        }, rng);
        break;
      case 'burn':
        this.sprites.burst({
          flavor: 'fire',
          origin: event.origin,
          count: 12,
          size: 0.6,
          life: 0.8,
          upward: 2.2,
          speed: 1.0,
        }, rng);
        this.sprites.burst({
          flavor: 'fireCore',
          origin: event.origin,
          count: 6,
          size: 0.4,
          life: 0.55,
          upward: 1.8,
          speed: 0.7,
        }, rng);
        this.sprites.burst({
          flavor: 'ember',
          origin: event.origin,
          count: 10,
          size: 0.16,
          life: 1.0,
          upward: 2.5,
          speed: 1.2,
        }, rng);
        break;
      case 'lightning': {
        this.flash = 1;
        const anchor = event.near?.clone() ?? new THREE.Vector3(0, 4, -6);
        anchor.y = Math.max(3, anchor.y);
        this.sprites.burst({
          flavor: 'arc',
          origin: anchor,
          count: 14,
          size: 1.4,
          life: 0.35,
          upward: -1.5,
          speed: 3.5,
          spread: 1.2,
          color: 0xe8d0ff,
        }, rng);
        this.sprites.burst({
          flavor: 'shock',
          origin: anchor.clone().add(new THREE.Vector3(0, -1.5, 0)),
          count: 8,
          size: 1.1,
          life: 0.4,
          upward: 0.2,
          speed: 1.5,
          color: 0xc090ff,
        }, rng);
        this.sprites.burst({
          flavor: 'flare',
          origin: anchor,
          count: 3,
          size: 2.2,
          life: 0.18,
          upward: 0,
          speed: 0.1,
        }, rng);
        break;
      }
    }
  }

  update(dt: number, camera: THREE.Camera, rng: () => number, time: number): number {
    for (const b of this.braziers) {
      const flicker = 0.88 + Math.sin(time * 9 + b.position.x * 2) * 0.1 + rng() * 0.05;
      b.light.intensity = b.baseIntensity * flicker;
      this.sprites.emitSteady('fire', b.position, 11, dt, rng, {
        size: 0.68,
        life: 0.52,
        upward: 2.5,
        spread: 0.16,
      });
      this.sprites.emitSteady('fireCore', b.position, 4, dt, rng, {
        size: 0.38,
        life: 0.35,
        upward: 2.0,
        spread: 0.1,
      });
      this.sprites.emitSteady('ember', b.position, 3.5, dt, rng, {
        size: 0.14,
        life: 1.25,
        upward: 3.1,
        speed: 0.55,
        spread: 0.45,
      });
      this.sprites.emitSteady(
        'smoke',
        b.position.clone().add(new THREE.Vector3(0, 0.28, 0)),
        2.4,
        dt,
        rng,
        {
          size: 0.7,
          life: 1.85,
          upward: 1.55,
          speed: 0.22,
          color: 0xa8b0bc,
          spread: 0.32,
        },
      );
      this.sprites.emitSteady('bloom', b.position, 1.2, dt, rng, {
        size: 0.95,
        life: 0.28,
        upward: 0.4,
        spread: 0.08,
      });
    }

    // Floating dust near camera
    this.dustOrigin.copy(camera.position);
    this.dustOrigin.y -= 0.2;
    this.sprites.emitSteady('dust', this.dustOrigin, 5, dt, rng, {
      size: 0.08,
      life: 2.2,
      upward: 0.35,
      speed: 0.25,
      spread: 1.8,
      color: 0xd8dce4,
    });

    // Purple ground mist pools (goal still flavor)
    this.mistTimer -= dt;
    if (this.mistTimer <= 0) {
      this.mistTimer = 0.35 + rng() * 0.55;
      this.mistOrigin.set(
        camera.position.x + (rng() - 0.5) * 14,
        0.12,
        camera.position.z + (rng() - 0.5) * 14 - 2,
      );
    }
    this.sprites.emitSteady('mist', this.mistOrigin, 3.5, dt, rng, {
      size: 1.35,
      life: 2.8,
      upward: 0.15,
      speed: 0.12,
      spread: 0.55,
      color: 0xb070e8,
    });

    this.sprites.update(dt, camera);
    this.particles.update(dt);
    this.floaters.update(dt);

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    return this.flash;
  }

  dispose(): void {
    this.sprites.dispose();
    this.particles.dispose();
    this.floaters.dispose();
  }
}

export type { SpriteFlavor };
