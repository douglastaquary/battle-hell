import * as THREE from 'three';

/** Partículas 3D leves (pontos + mesh scraps) — base reformulada do estilo Dark Veil. */

type P3 = {
  alive: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
};

const MAX = 1500;

export class ParticleSystem3D {
  readonly points: THREE.Points;
  private readonly data: P3[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private free: number[] = [];

  constructor() {
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;

    for (let i = 0; i < MAX; i++) {
      this.data.push({
        alive: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        life: 1,
        size: 0.1,
        color: new THREE.Color(1, 1, 1),
      });
      this.free.push(i);
      this.positions[i * 3 + 1] = -999;
    }
  }

  burst(
    origin: THREE.Vector3,
    count: number,
    opts: {
      color?: THREE.ColorRepresentation;
      speed?: number;
      life?: number;
      gravity?: number;
      size?: number;
    },
    rng: () => number,
  ): void {
    const color = new THREE.Color(opts.color ?? 0xffcc66);
    const speed = opts.speed ?? 2.5;
    const life = opts.life ?? 0.6;
    const size = opts.size ?? 0.1;
    for (let n = 0; n < count; n++) {
      const i = this.free.pop();
      if (i === undefined) break;
      const p = this.data[i];
      p.alive = true;
      p.position.copy(origin);
      const theta = rng() * Math.PI * 2;
      const phi = rng() * Math.PI;
      const sp = speed * (0.3 + rng());
      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * sp,
        Math.cos(phi) * sp * 0.8 + 1.2,
        Math.sin(phi) * Math.sin(theta) * sp,
      );
      p.age = 0;
      p.life = life * (0.5 + rng());
      p.size = size * (0.6 + rng());
      p.color.copy(color);
    }
  }

  update(dt: number, gravity = 6): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.data[i];
      const o = i * 3;
      if (!p.alive) {
        this.positions[o + 1] = -999;
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.free.push(i);
        this.positions[o + 1] = -999;
        continue;
      }
      p.velocity.y -= gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
      const fade = 1 - p.age / p.life;
      this.positions[o] = p.position.x;
      this.positions[o + 1] = p.position.y;
      this.positions[o + 2] = p.position.z;
      this.colors[o] = p.color.r * fade;
      this.colors[o + 1] = p.color.g * fade;
      this.colors[o + 2] = p.color.b * fade;
      this.sizes[i] = p.size * fade;
    }
    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
