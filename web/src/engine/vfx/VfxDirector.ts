import * as THREE from 'three';
import { ParticleSystem3D } from './ParticleSystem3D';
import { ProceduralSpriteEngine, type SpriteFlavor } from './ProceduralSpriteEngine';

export type VfxEvent =
  | { type: 'muzzle'; origin: THREE.Vector3; forward?: THREE.Vector3 }
  | { type: 'hit'; origin: THREE.Vector3; armored?: boolean }
  | { type: 'death'; origin: THREE.Vector3 }
  | { type: 'soul'; origin: THREE.Vector3 }
  | { type: 'burn'; origin: THREE.Vector3 }
  | { type: 'lightning' };

type BrazierEmitter = {
  position: THREE.Vector3;
  light: THREE.PointLight;
  baseIntensity: number;
};

export class VfxDirector {
  readonly root = new THREE.Group();
  readonly sprites = new ProceduralSpriteEngine();
  readonly particles = new ParticleSystem3D();
  private braziers: BrazierEmitter[] = [];
  private flash = 0;
  private dustOrigin = new THREE.Vector3();

  constructor() {
    this.root.add(this.sprites.group);
    this.root.add(this.particles.points);
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
        this.sprites.burst({
          flavor: 'muzzle',
          origin,
          count: 10,
          size: 0.7,
          life: 0.14,
          upward: 0.15,
          speed: 0.55,
          spread: 0.35,
        }, rng);
        this.sprites.burst({
          flavor: 'spark',
          origin,
          count: 8,
          size: 0.22,
          life: 0.28,
          upward: 0.4,
          speed: 3.5,
          spread: 0.9,
        }, rng);
        this.particles.burst(origin, 28, { color: 0xffcc66, speed: 5, life: 0.28, size: 0.09 }, rng);
        break;
      }
      case 'hit': {
        const o = event.origin;
        this.sprites.burst({
          flavor: 'bone',
          origin: o,
          count: 14,
          size: 0.28,
          life: 0.55,
          upward: 1.6,
          speed: 2.8,
          color: 0xf0e6d4,
        }, rng);
        this.sprites.burst({
          flavor: 'spark',
          origin: o,
          count: event.armored ? 16 : 8,
          size: 0.2,
          life: 0.4,
          upward: 1.0,
          speed: 3.2,
          color: event.armored ? 0xffdd88 : 0xffeebb,
        }, rng);
        this.particles.burst(
          o,
          36,
          { color: event.armored ? 0xffe0a0 : 0xe8dcc8, speed: 4.2, life: 0.55 },
          rng,
        );
        break;
      }
      case 'death':
        this.sprites.burst({
          flavor: 'bone',
          origin: event.origin.clone().add(new THREE.Vector3(0, 1, 0)),
          count: 22,
          size: 0.32,
          life: 1.0,
          upward: 2.4,
          speed: 3.0,
        }, rng);
        this.sprites.burst({
          flavor: 'soul',
          origin: event.origin.clone().add(new THREE.Vector3(0, 1.2, 0)),
          count: 7,
          size: 0.42,
          life: 1.3,
          upward: 1.6,
          speed: 0.7,
          color: 0x88ffcc,
        }, rng);
        this.particles.burst(event.origin, 48, { color: 0xc8b89a, speed: 4.5, life: 0.9 }, rng);
        break;
      case 'soul':
        this.sprites.burst({
          flavor: 'soul',
          origin: event.origin,
          count: 5,
          size: 0.35,
          life: 1.4,
          upward: 0.8,
          speed: 0.4,
          color: 0xaaff88,
        }, rng);
        break;
      case 'burn':
        this.sprites.burst({
          flavor: 'fire',
          origin: event.origin,
          count: 10,
          size: 0.55,
          life: 0.75,
          upward: 2.1,
          speed: 0.9,
        }, rng);
        break;
      case 'lightning':
        this.flash = 1;
        break;
    }
  }

  update(dt: number, camera: THREE.Camera, rng: () => number, time: number): number {
    for (const b of this.braziers) {
      const flicker = 0.88 + Math.sin(time * 9 + b.position.x * 2) * 0.1 + rng() * 0.05;
      b.light.intensity = b.baseIntensity * flicker;
      // Cap rates for budget: ~10 fire + 3 ember + 2 smoke per brazier
      this.sprites.emitSteady('fire', b.position, 10, dt, rng, {
        size: 0.62,
        life: 0.5,
        upward: 2.4,
        spread: 0.18,
      });
      this.sprites.emitSteady('ember', b.position, 3, dt, rng, {
        size: 0.14,
        life: 1.2,
        upward: 3.0,
        speed: 0.55,
        spread: 0.45,
      });
      this.sprites.emitSteady('smoke', b.position.clone().add(new THREE.Vector3(0, 0.25, 0)), 2.2, dt, rng, {
        size: 0.65,
        life: 1.8,
        upward: 1.5,
        speed: 0.22,
        color: 0xa8b0bc,
        spread: 0.3,
      });
    }

    // Floating dust near camera (cheap ambience like the walk preview)
    this.dustOrigin.copy(camera.position);
    this.dustOrigin.y -= 0.2;
    this.sprites.emitSteady('dust', this.dustOrigin, 6, dt, rng, {
      size: 0.08,
      life: 2.2,
      upward: 0.35,
      speed: 0.25,
      spread: 1.8,
      color: 0xd8dce4,
    });

    this.sprites.update(dt, camera);
    this.particles.update(dt);

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    return this.flash;
  }

  dispose(): void {
    this.sprites.dispose();
    this.particles.dispose();
  }
}

export type { SpriteFlavor };
