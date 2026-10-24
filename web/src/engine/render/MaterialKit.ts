import * as THREE from 'three';

/** Materiais e texturas canvas compartilhados — evita proliferar GPU textures. */

let stoneTex: THREE.CanvasTexture | null = null;
let bannerTex: THREE.CanvasTexture | null = null;
let dirtTex: THREE.CanvasTexture | null = null;
let gunMarkTex: THREE.CanvasTexture | null = null;
let stainedGlassTex: THREE.CanvasTexture | null = null;

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function getStoneTexture(): THREE.CanvasTexture {
  if (stoneTex) return stoneTex;
  stoneTex = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#3a3834';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      const x = (i * 47) % s;
      const y = (i * 91) % s;
      ctx.fillStyle = i % 2 ? '#4a4640' : '#2e2c28';
      ctx.fillRect(x, y, 18 + (i % 7), 12 + (i % 5));
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < s; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }
  });
  stoneTex.repeat.set(4, 4);
  return stoneTex;
}

export function getDirtTexture(): THREE.CanvasTexture {
  if (dirtTex) return dirtTex;
  dirtTex = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#2a241c';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(${40 + (i % 20)},${32 + (i % 12)},${22},0.35)`;
      ctx.fillRect((i * 17) % s, (i * 29) % s, 3, 3);
    }
  });
  dirtTex.repeat.set(8, 8);
  return dirtTex;
}

export function getBannerTexture(): THREE.CanvasTexture {
  if (bannerTex) return bannerTex;
  bannerTex = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#6a1218';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#8a1a22';
    ctx.fillRect(8, 8, s - 16, s - 16);
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.moveTo(s / 2, 28);
    ctx.lineTo(s / 2 + 22, s / 2);
    ctx.lineTo(s / 2, s - 28);
    ctx.lineTo(s / 2 - 22, s / 2);
    ctx.closePath();
    ctx.fill();
  });
  return bannerTex;
}

export function getGunMarkTexture(): THREE.CanvasTexture {
  if (gunMarkTex) return gunMarkTex;
  gunMarkTex = canvasTex(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = '#f0ece0';
    ctx.lineWidth = 5;
    ctx.lineCap = 'square';
    // >< mark
    ctx.beginPath();
    ctx.moveTo(38, 16);
    ctx.lineTo(22, 32);
    ctx.lineTo(38, 48);
    ctx.moveTo(26, 16);
    ctx.lineTo(42, 32);
    ctx.lineTo(26, 48);
    ctx.stroke();
  });
  gunMarkTex.wrapS = gunMarkTex.wrapT = THREE.ClampToEdgeWrapping;
  return gunMarkTex;
}

/** Vitral rosácea procedural (abbey). */
export function getStainedGlassTexture(): THREE.CanvasTexture {
  if (stainedGlassTex) return stainedGlassTex;
  stainedGlassTex = canvasTex(256, (ctx, s) => {
    const cx = s / 2;
    const cy = s / 2;
    ctx.fillStyle = '#1a0c08';
    ctx.fillRect(0, 0, s, s);
    const colors = ['#c04028', '#2848a8', '#c8a028', '#8030a0', '#208060', '#d06030'];
    for (let ring = 0; ring < 4; ring++) {
      const r0 = 18 + ring * 28;
      const r1 = r0 + 26;
      const n = 8 + ring * 2;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
        ctx.arc(cx, cy, r1, a0, a1);
        ctx.lineTo(cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0);
        ctx.closePath();
        ctx.fillStyle = colors[(i + ring) % colors.length];
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#1a1008';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#e8c070';
    ctx.fill();
  });
  stainedGlassTex.wrapS = stainedGlassTex.wrapT = THREE.ClampToEdgeWrapping;
  return stainedGlassTex;
}

export const Materials = {
  stone(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: getStoneTexture(),
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.05,
    });
  },
  dirt(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: getDirtTexture(),
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.02,
    });
  },
  banner(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: getBannerTexture(),
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  },
  iron(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x1a1a1c,
      roughness: 0.45,
      metalness: 0.85,
    });
  },
  brass(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x8a6a2e,
      roughness: 0.55,
      metalness: 0.7,
      envMapIntensity: 0.55,
    });
  },
  gunBody(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x1c1c20,
      roughness: 0.62,
      metalness: 0.55,
      envMapIntensity: 0.45,
    });
  },
  gunWood(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x4a2814,
      roughness: 0.48,
      metalness: 0.05,
      envMapIntensity: 0.35,
    });
  },
};
