import * as THREE from 'three';

/**
 * Motor de sprites 2D procedurais sobre partículas 3D.
 * Atlas canvas compartilhado + 2 InstancedMesh (aditivo / soft).
 * Flavors alinhados à meta Abbey / Dark Veil-like (fogo, choque, névoa, impacto).
 */

export type SpriteFlavor =
  | 'fire'
  | 'fireCore'
  | 'ember'
  | 'smoke'
  | 'mist'
  | 'soul'
  | 'spark'
  | 'bone'
  | 'muzzle'
  | 'dust'
  | 'shock'
  | 'arc'
  | 'impact'
  | 'flare'
  | 'scrap'
  | 'bloom';

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

const MAX = 2048;
const ATLAS_SIZE = 512;
const CELL = 64;
const CELLS = ATLAS_SIZE / CELL; // 8

const FLAVOR_INDEX: Record<SpriteFlavor, number> = {
  fire: 0,
  fireCore: 1,
  ember: 2,
  smoke: 3,
  mist: 4,
  soul: 5,
  spark: 6,
  bone: 7,
  muzzle: 8,
  dust: 9,
  shock: 10,
  arc: 11,
  impact: 12,
  flare: 13,
  scrap: 14,
  bloom: 15,
};

const SOFT: Partial<Record<SpriteFlavor, true>> = {
  smoke: true,
  mist: true,
  bone: true,
  dust: true,
  scrap: true,
  impact: true,
};

function jaggedBolt(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  color: string,
  seed: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  let x = ox + 30 + (seed % 5);
  let y = oy + 8;
  ctx.moveTo(x, y);
  for (let i = 0; i < 6; i++) {
    x += ((seed * (i + 3)) % 17) - 8;
    y += 8 + (i % 2) * 2;
    ctx.lineTo(ox + 18 + ((x - ox) % 28), y);
  }
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
}

function drawCell(ctx: CanvasRenderingContext2D, ox: number, oy: number, kind: SpriteFlavor): void {
  const cx = ox + 32;
  const cy = oy + 32;
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);

  switch (kind) {
    case 'fire': {
      g.addColorStop(0, 'rgba(255,252,220,1)');
      g.addColorStop(0.18, 'rgba(255,210,70,1)');
      g.addColorStop(0.45, 'rgba(255,100,18,0.92)');
      g.addColorStop(0.75, 'rgba(180,30,0,0.45)');
      g.addColorStop(1, 'rgba(20,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, oy + 4);
      ctx.bezierCurveTo(ox + 56, oy + 28, ox + 50, oy + 52, cx, oy + 60);
      ctx.bezierCurveTo(ox + 14, oy + 52, ox + 8, oy + 28, cx, oy + 4);
      ctx.fill();
      // tongue
      ctx.fillStyle = 'rgba(255,255,200,0.85)';
      ctx.beginPath();
      ctx.moveTo(cx, oy + 14);
      ctx.bezierCurveTo(ox + 40, oy + 30, ox + 38, oy + 42, cx, oy + 48);
      ctx.bezierCurveTo(ox + 24, oy + 42, ox + 22, oy + 30, cx, oy + 14);
      ctx.fill();
      break;
    }
    case 'fireCore': {
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(0.35, 'rgba(255,180,40,0.95)');
      g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 12, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ember': {
      g.addColorStop(0, 'rgba(255,240,160,1)');
      g.addColorStop(0.35, 'rgba(255,120,30,0.95)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'smoke': {
      g.addColorStop(0, 'rgba(210,210,220,0.5)');
      g.addColorStop(0.45, 'rgba(110,110,120,0.28)');
      g.addColorStop(1, 'rgba(30,30,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx - 4, cy, 22, 0, Math.PI * 2);
      ctx.arc(cx + 8, cy + 4, 18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mist': {
      // Purple ground mist pools (goal still)
      g.addColorStop(0, 'rgba(200,140,255,0.55)');
      g.addColorStop(0.4, 'rgba(120,60,200,0.35)');
      g.addColorStop(1, 'rgba(20,0,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 28, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'soul': {
      g.addColorStop(0, 'rgba(240,255,230,1)');
      g.addColorStop(0.3, 'rgba(100,255,160,0.92)');
      g.addColorStop(0.65, 'rgba(60,140,255,0.5)');
      g.addColorStop(1, 'rgba(0,0,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 13, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spark': {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.2, 'rgba(255,230,100,1)');
      g.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 3, oy + 6, 6, 52);
      ctx.fillRect(ox + 6, cy - 3, 52, 6);
      ctx.beginPath();
      ctx.moveTo(cx, oy + 10);
      ctx.lineTo(cx + 10, cy);
      ctx.lineTo(cx, oy + 54);
      ctx.lineTo(cx - 10, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bone': {
      ctx.fillStyle = 'rgba(240,230,210,0.95)';
      ctx.fillRect(ox + 24, oy + 14, 16, 34);
      ctx.beginPath();
      ctx.arc(cx, oy + 16, 10, 0, Math.PI * 2);
      ctx.arc(cx, oy + 48, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,130,110,0.5)';
      ctx.fillRect(ox + 28, oy + 24, 8, 4);
      break;
    }
    case 'muzzle': {
      g.addColorStop(0, 'rgba(255,255,250,1)');
      g.addColorStop(0.15, 'rgba(255,220,90,1)');
      g.addColorStop(0.45, 'rgba(255,100,25,0.7)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 30, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dust': {
      g.addColorStop(0, 'rgba(230,230,238,0.65)');
      g.addColorStop(1, 'rgba(100,100,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shock': {
      // Jagged purple/white electricity (SHOCKED look)
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(200,140,255,0.75)');
      g.addColorStop(1, 'rgba(40,0,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      jaggedBolt(ctx, ox, oy, 'rgba(190,120,255,1)', 3);
      jaggedBolt(ctx, ox + 4, oy + 2, 'rgba(255,255,255,0.95)', 11);
      jaggedBolt(ctx, ox - 2, oy + 6, 'rgba(160,80,255,0.9)', 19);
      break;
    }
    case 'arc': {
      ctx.strokeStyle = 'rgba(220,180,255,1)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ox + 8, oy + 40);
      ctx.lineTo(ox + 22, oy + 18);
      ctx.lineTo(ox + 34, oy + 36);
      ctx.lineTo(ox + 48, oy + 12);
      ctx.lineTo(ox + 56, oy + 28);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case 'impact': {
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.25, 'rgba(230,210,255,0.55)');
      g.addColorStop(1, 'rgba(60,40,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
        ctx.lineTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
        ctx.stroke();
      }
      break;
    }
    case 'flare': {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.2, 'rgba(255,200,80,0.9)');
      g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'scrap': {
      ctx.fillStyle = 'rgba(180,160,130,0.9)';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.4);
      ctx.fillRect(-6, -14, 10, 28);
      ctx.restore();
      ctx.fillStyle = 'rgba(120,100,80,0.7)';
      ctx.fillRect(ox + 34, oy + 22, 14, 8);
      break;
    }
    case 'bloom': {
      g.addColorStop(0, 'rgba(255,220,160,0.9)');
      g.addColorStop(0.4, 'rgba(255,120,40,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
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
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
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
  /** Optional cone bias along a world direction */
  bias?: THREE.Vector3;
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
      toneMapped: false,
    });
    const softMat = new THREE.MeshBasicMaterial({
      map: this.atlas,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      opacity: 1,
      toneMapped: false,
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
      p.position.x += (rng() - 0.5) * 0.14;
      p.position.y += (rng() - 0.5) * 0.08;
      p.position.z += (rng() - 0.5) * 0.14;
      const ang = rng() * Math.PI * 2;
      const sp = speed * (0.4 + rng());
      p.velocity.set(Math.cos(ang) * sp * spread, upward * (0.5 + rng()), Math.sin(ang) * sp * spread);
      if (opts.bias) {
        p.velocity.addScaledVector(opts.bias, speed * (0.4 + rng() * 0.6));
      }
      p.age = 0;
      p.life = life * (0.6 + rng() * 0.8);
      p.size = size * (0.7 + rng() * 0.6);
      p.sizeEnd =
        p.size *
        (opts.flavor === 'smoke' || opts.flavor === 'mist'
          ? 2.6
          : opts.flavor === 'dust' || opts.flavor === 'impact'
            ? 1.8
            : opts.flavor === 'shock' || opts.flavor === 'arc'
              ? 1.1
              : 0.18);
      p.spin = rng() * Math.PI * 2;
      p.spinSpeed =
        opts.flavor === 'shock' || opts.flavor === 'arc'
          ? (rng() - 0.5) * 14
          : (rng() - 0.5) * 4;
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
    this.burst(
      {
        flavor,
        origin,
        count,
        speed: extras?.speed ?? 0.35,
        life: extras?.life ?? 0.9,
        size: extras?.size ?? 0.45,
        upward: extras?.upward ?? 1.8,
        color: extras?.color,
        spread: extras?.spread ?? 0.25,
        bias: extras?.bias,
      },
      rng,
    );
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
      let lift = -1.3;
      if (p.flavor === 'smoke' || p.flavor === 'fire' || p.flavor === 'fireCore' || p.flavor === 'dust') {
        lift = 0.55;
      } else if (p.flavor === 'mist') {
        lift = 0.12;
      } else if (p.flavor === 'shock' || p.flavor === 'arc') {
        lift = 0.8;
      }
      p.velocity.y += lift * dt;
      if (p.flavor === 'shock' || p.flavor === 'arc') {
        // Crackling jitter
        p.position.x += (Math.random() - 0.5) * 0.08;
        p.position.y += (Math.random() - 0.5) * 0.06;
        p.position.z += (Math.random() - 0.5) * 0.08;
      }
      p.position.addScaledVector(p.velocity, dt);
      p.spin += p.spinSpeed * dt;
      const size = THREE.MathUtils.lerp(p.size, p.sizeEnd, t);
      const fade =
        p.flavor === 'smoke' || p.flavor === 'dust' || p.flavor === 'mist'
          ? (1 - t) * (t < 0.12 ? t / 0.12 : 1)
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
