import * as THREE from 'three';

/**
 * Números de dano + labels de status (ex. SHOCKED) como billboards canvas.
 * Pool pequeno — flavor gothic serif (Battle Hell).
 */

type Floater = {
  alive: boolean;
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  age: number;
  life: number;
  velocity: THREE.Vector3;
  baseScale: THREE.Vector2;
};

const POOL = 48;

function paintLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  kind: 'damage' | 'status',
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'damage') {
    ctx.font = '700 54px Cinzel, Georgia, serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(20,8,8,0.85)';
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = '#f4e8d0';
    ctx.fillText(text, w / 2, h / 2);
    ctx.fillStyle = 'rgba(255,200,120,0.5)';
    ctx.fillText(text, w / 2 - 1, h / 2 - 1);
  } else {
    ctx.font = '700 36px Cinzel, Georgia, serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,0,40,0.9)';
    ctx.strokeText(text, w / 2, h / 2);
    const grad = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.7);
    grad.addColorStop(0, '#e8d0ff');
    grad.addColorStop(0.5, '#c080ff');
    grad.addColorStop(1, '#8040d0');
    ctx.fillStyle = grad;
    ctx.fillText(text, w / 2, h / 2);
  }
}

export class CombatFloaters {
  readonly group = new THREE.Group();
  private readonly pool: Floater[] = [];
  private readonly free: number[] = [];

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({
        alive: false,
        sprite,
        texture,
        age: 0,
        life: 1,
        velocity: new THREE.Vector3(),
        baseScale: new THREE.Vector2(1.35, 0.7),
      });
      this.free.push(i);
    }
  }

  spawnDamage(origin: THREE.Vector3, amount: number, rng: () => number): void {
    this.spawn(origin, String(Math.max(1, Math.round(amount))), 'damage', 1.15, rng);
  }

  spawnStatus(origin: THREE.Vector3, label: string, rng: () => number): void {
    this.spawn(origin.clone().add(new THREE.Vector3(0, 0.55, 0)), label, 'status', 1.45, rng);
  }

  private spawn(
    origin: THREE.Vector3,
    text: string,
    kind: 'damage' | 'status',
    life: number,
    rng: () => number,
  ): void {
    const i = this.free.pop();
    if (i === undefined) return;
    const f = this.pool[i];
    const canvas = f.texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    paintLabel(ctx, text, kind);
    f.texture.needsUpdate = true;
    f.alive = true;
    f.age = 0;
    f.life = life * (0.85 + rng() * 0.3);
    f.baseScale.set(kind === 'status' ? 2.6 : 1.7, kind === 'status' ? 1.05 : 0.85);
    f.sprite.position.set(
      origin.x + (rng() - 0.5) * 0.35,
      origin.y + (kind === 'status' ? 2.15 : 1.65),
      origin.z + (rng() - 0.5) * 0.35,
    );
    f.velocity.set((rng() - 0.5) * 0.4, 1.15 + rng() * 0.45, (rng() - 0.5) * 0.4);
    f.sprite.scale.set(f.baseScale.x, f.baseScale.y, 1);
    f.sprite.visible = true;
    (f.sprite.material as THREE.SpriteMaterial).opacity = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      const f = this.pool[i];
      if (!f.alive) continue;
      f.age += dt;
      if (f.age >= f.life) {
        f.alive = false;
        f.sprite.visible = false;
        this.free.push(i);
        continue;
      }
      const t = f.age / f.life;
      f.sprite.position.addScaledVector(f.velocity, dt);
      f.velocity.y *= 0.98;
      const mat = f.sprite.material as THREE.SpriteMaterial;
      mat.opacity = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88);
      const s = 1 + t * 0.28;
      f.sprite.scale.set(f.baseScale.x * s, f.baseScale.y * s, 1);
    }
  }

  dispose(): void {
    for (const f of this.pool) {
      f.texture.dispose();
      (f.sprite.material as THREE.Material).dispose();
    }
  }
}
