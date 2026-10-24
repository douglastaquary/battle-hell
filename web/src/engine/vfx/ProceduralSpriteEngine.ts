import * as THREE from 'three';

/**
 * Sprites 2D procedurais otimizados: um atlas canvas compartilhado,
 * dois InstancedMesh (aditivo + soft) para misturar fogo/fumaça sem N materiais.
 */

export type SpriteFlavor = 'fire' | 'ember' | 'smoke' | 'soul' | 'spark' | 'bone' | 'muzzle' | 'dust';

type SpriteParticle = {
  alive: boolean;
  flavor: SpriteFlavor;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  sizeEnd: number;
  spin: number;
  spinSpeed: number;
  color: THREE.Color;
  atlasIndex: number;
  layer: 0 | 1;
};

const MAX = 1536;
const ATLAS_SIZE = 256;
const CELL = 64;
const CELLS = ATLAS_SIZE / CELL;

const FLAVOR_INDEX: Record<SpriteFlavor, number> = {
  fire: 0,
  ember: 1,
  smoke: 2,
  soul: 3,
  spark: 4,
  bone: 5,
  muzzle: 6,
  dust: 7,
};

const SOFT: Partial<Record<SpriteFlavor, true>> = { smoke: true, bone: true, dust: true };

function drawCell(ctx: CanvasRenderingContext2D, ox: number, oy: number, kind: SpriteFlavor): void {
  const g = ctx.createRadialGradient(ox + 32, oy + 32, 2, ox + 32, oy + 32, 30);
  switch (kind) {
    case 'fire':
      g.addColorStop(0, 'rgba(255,252,230,1)');
      g.addColorStop(0.2, 'rgba(255,200,60,1)');
      g.addColorStop(0.5, 'rgba(255,90,10,0.85)');
      g.addColorStop(1, 'rgba(40,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox + 32, oy + 6);
      ctx.bezierCurveTo(ox + 54, oy + 30, ox + 48, oy + 54, ox + 32, oy + 58);
      ctx.bezierCurveTo(ox + 16, oy + 54, ox + 10, oy + 30, ox + 32, oy + 6);
      ctx.fill();
      break;
    case 'ember':
      g.addColorStop(0, 'rgba(255,230,140,1)');
      g.addColorStop(0.4, 'rgba(255,110,20,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox + 32, oy + 32, 14, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'smoke':
      g.addColorStop(0, 'rgba(200,200,210,0.55)');
      g.addColorStop(0.5, 'rgba(120,120,130,0.25)');
      g.addColorStop(1, 'rgba(40,40,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox + 32, oy + 32, 28, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'soul':
      g.addColorStop(0, 'rgba(230,255,220,1)');
      g.addColorStop(0.35, 'rgba(90,255,150,0.9)');
      g.addColorStop(0.7, 'rgba(50,140,255,0.45)');
      g.addColorStop(1, 'rgba(0,0,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ox + 32, oy + 34, 14, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'spark':
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,220,80,1)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox + 28, oy + 6, 8, 52);
      ctx.fillRect(ox + 6, oy + 28, 52, 8);
      break;
    case 'bone':
      ctx.fillStyle = 'rgba(235,225,205,0.95)';
      ctx.fillRect(ox + 22, oy + 16, 20, 30);
      ctx.fillStyle = 'rgba(160,140,120,0.55)';
      ctx.fillRect(ox + 26, oy + 22, 12, 5);
      break;
    case 'muzzle':
      g.addColorStop(0, 'rgba(255,255,245,1)');
      g.addColorStop(0.18, 'rgba(255,210,70,1)');
      g.addColorStop(0.5, 'rgba(255,90,20,0.65)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(ox + 32, oy + 32, 30, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'dust':
      g.addColorStop(0, 'rgba(230,230,235,0.7)');
      g.addColorStop(1, 'rgba(120,120,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox + 32, oy + 32, 10, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function buildAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  (Object.keys(FLAVOR_INDEX) as SpriteFlavor[]).forEach((kind) => {
    const i = FLAVOR_INDEX[kind];
    const col = i % CELLS;
    const row = Math.floor(i / CELLS);
    drawCell(ctx, col * CELL, row * CELL, kind);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function patchAtlasMaterial(material: THREE.MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float instanceAtlas;
varying vec2 vAtlasUV;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
float cell = 1.0 / ${CELLS}.0;
float col = mod(instanceAtlas, ${CELLS}.0);
float row = floor(instanceAtlas / ${CELLS}.0);
vAtlasUV = vec2(uv.x * cell + col * cell, 1.0 - (row + 1.0) * cell + uv.y * cell);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vAtlasUV;`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vAtlasUV );
	diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
}

export type SpriteBurstOpts = {
  flavor: SpriteFlavor;
  origin: THREE.Vector3;
  count: number;
  speed?: number;
  life?: number;
  size?: number;
  upward?: number;
  color?: THREE.ColorRepresentation;
  spread?: number;
};

export class ProceduralSpriteEngine {
  readonly group = new THREE.Group();
  private readonly particles: SpriteParticle[] = [];
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly atlas: THREE.CanvasTexture;
  private readonly free: number[] = [];
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.atlas = buildAtlas();
    const geo = new THREE.PlaneGeometry(1, 1);
    const atlasAttr = new Float32Array(MAX);
    geo.setAttribute('instanceAtlas', new THREE.InstancedBufferAttribute(atlasAttr, 1));

    const addMat = new THREE.MeshBasicMaterial({
      map: this.atlas,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const softMat = new THREE.MeshBasicMaterial({
      map: this.atlas,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      opacity: 1,
    });
    patchAtlasMaterial(addMat);
    patchAtlasMaterial(softMat);

    for (const mat of [addMat, softMat]) {
      const mesh = new THREE.InstancedMesh(geo, mat, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = MAX;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }

    for (let i = 0; i < MAX; i++) {
      this.particles.push({
        alive: false,
        flavor: 'ember',
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        life: 1,
        size: 0.2,
        sizeEnd: 0.05,
        spin: 0,
        spinSpeed: 0,
        color: new THREE.Color(1, 1, 1),
        atlasIndex: 0,
        layer: 0,
      });
      this.free.push(i);
      this.hideInstance(i);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  burst(opts: SpriteBurstOpts, rng: () => number): void {
    const speed = opts.speed ?? 1.2;
    const life = opts.life ?? 0.7;
    const size = opts.size ?? 0.35;
    const upward = opts.upward ?? 1.4;
    const spread = opts.spread ?? 0.8;
    const baseColor = new THREE.Color(opts.color ?? 0xffffff);
    const atlasIndex = FLAVOR_INDEX[opts.flavor];
    const layer: 0 | 1 = SOFT[opts.flavor] ? 1 : 0;

    for (let n = 0; n < opts.count; n++) {
      const i = this.free.pop();
      if (i === undefined) break;
      const p = this.particles[i];
      p.alive = true;
      p.flavor = opts.flavor;
      p.atlasIndex = atlasIndex;
      p.layer = layer;
      p.position.copy(opts.origin);
      p.position.x += (rng() - 0.5) * 0.12;
      p.position.z += (rng() - 0.5) * 0.12;
      const ang = rng() * Math.PI * 2;
      const sp = speed * (0.4 + rng());
      p.velocity.set(Math.cos(ang) * sp * spread, upward * (0.5 + rng()), Math.sin(ang) * sp * spread);
      p.age = 0;
      p.life = life * (0.6 + rng() * 0.8);
      p.size = size * (0.7 + rng() * 0.6);
      p.sizeEnd = p.size * (opts.flavor === 'smoke' ? 2.4 : opts.flavor === 'dust' ? 1.6 : 0.2);
      p.spin = rng() * Math.PI * 2;
      p.spinSpeed = (rng() - 0.5) * 4;
      p.color.copy(baseColor);

      for (const mesh of this.meshes) {
        const attr = mesh.geometry.getAttribute('instanceAtlas') as THREE.InstancedBufferAttribute;
        attr.setX(i, atlasIndex);
        attr.needsUpdate = true;
      }
    }
  }

  emitSteady(
    flavor: SpriteFlavor,
    origin: THREE.Vector3,
    rate: number,
    dt: number,
    rng: () => number,
    extras?: Partial<SpriteBurstOpts>,
  ): void {
    const expected = rate * dt;
    const count = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
    if (count <= 0) return;
    this.burst({
      flavor,
      origin,
      count,
      speed: extras?.speed ?? 0.35,
      life: extras?.life ?? 0.9,
      size: extras?.size ?? 0.45,
      upward: extras?.upward ?? 1.8,
      color: extras?.color,
      spread: extras?.spread ?? 0.25,
    }, rng);
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.free.push(i);
        this.hideInstance(i);
        continue;
      }
      const t = p.age / p.life;
      const lift =
        p.flavor === 'smoke' || p.flavor === 'fire' || p.flavor === 'dust' ? 0.55 : -1.3;
      p.velocity.y += lift * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.spin += p.spinSpeed * dt;
      const size = THREE.MathUtils.lerp(p.size, p.sizeEnd, t);
      const fade =
        p.flavor === 'smoke' || p.flavor === 'dust'
          ? (1 - t) * (t < 0.15 ? t / 0.15 : 1)
          : Math.sin((1 - t) * Math.PI);

      this.dummy.position.copy(p.position);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.rotateZ(p.spin);
      this.dummy.scale.setScalar(Math.max(0.04, size * fade));
      this.dummy.updateMatrix();
      const active = this.meshes[p.layer];
      active.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.copy(p.color);
      active.setColorAt(i, this.tmpColor);

      this.dummy.scale.setScalar(0);
      this.dummy.position.set(0, -999, 0);
      this.dummy.updateMatrix();
      this.meshes[1 - p.layer].setMatrixAt(i, this.dummy.matrix);
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private hideInstance(i: number): void {
    this.dummy.scale.setScalar(0);
    this.dummy.position.set(0, -999, 0);
    this.dummy.updateMatrix();
    for (const mesh of this.meshes) mesh.setMatrixAt(i, this.dummy.matrix);
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.atlas.dispose();
  }
}
