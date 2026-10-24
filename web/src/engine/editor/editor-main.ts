import * as THREE from 'three';
import { createRenderer, resizeRenderer } from '../../core/Renderer';
import { Atmosphere } from '../render/Atmosphere';
import { createAbbeyClearingMap, type BattleHellMap, type WeatherSettings } from '../scene/MapFormat';
import { WorldBuilder } from '../scene/WorldBuilder';
import { VfxDirector } from '../vfx/VfxDirector';
import { createSeededRandom } from '../../utils/random';

const canvas = document.querySelector<HTMLCanvasElement>('#editor-canvas');
if (!canvas) throw new Error('editor canvas missing');

const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.position.set(0, 4, 12);

const world = new WorldBuilder();
scene.add(world.root);

let map: BattleHellMap = createAbbeyClearingMap();
let atmosphere = new Atmosphere(map.weather);
scene.add(atmosphere.group);
atmosphere.applyFog(scene);

let vfx = new VfxDirector();
scene.add(vfx.root);

let mapDirty = false;
let pauseFx = false;
let walkMode = false;
let rng = createSeededRandom(map.seed);
const keys = new Set<string>();
let yaw = 0;
let pitch = -0.25;
let dragging = false;
let flightSpeed = 10;
const velocity = new THREE.Vector3();

const loading = document.querySelector<HTMLElement>('#loading-ring');
const unsaved = document.querySelector<HTMLElement>('#unsaved');
const status = document.querySelector<HTMLElement>('#status-msg');
const objectList = document.querySelector<HTMLElement>('#object-list');
const walkBar = document.querySelector<HTMLElement>('#walk-bar');

function replaceVfx(): VfxDirector {
  scene.remove(vfx.root);
  vfx.dispose();
  vfx = new VfxDirector();
  scene.add(vfx.root);
  return vfx;
}

async function rebuild(): Promise<void> {
  if (loading) loading.hidden = false;
  const director = replaceVfx();
  await world.build(map, director);
  refreshObjectList();
  document.querySelector('#map-name')!.textContent = map.name;
  document.querySelector('#map-seed')!.textContent = String(map.seed);
  document.querySelector('#obj-count')!.textContent = String(map.props.length);
  if (loading) loading.hidden = true;
  if (status) status.textContent = 'Map loaded.';
}

function markDirty(): void {
  mapDirty = true;
  if (unsaved) unsaved.hidden = false;
  if (status) status.textContent = 'Map changed. Save to keep your edits.';
}

function refreshObjectList(): void {
  if (!objectList) return;
  objectList.innerHTML = '';
  for (const p of map.props) {
    const li = document.createElement('li');
    li.textContent = `${p.kind} · ${p.id}`;
    objectList.appendChild(li);
  }
}

function readWeatherFromUi(): WeatherSettings {
  const num = (id: string) => Number((document.querySelector(`#${id}`) as HTMLInputElement).value);
  const val = (id: string) =>
    (document.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement).value;
  return {
    style: val('sky-style'),
    zenithColor: val('zenith'),
    moonSize: num('moon-size'),
    moonBrightness: num('moon-bright'),
    stars: num('stars'),
    cloudCoverage: num('clouds'),
    cloudSpeed: num('cloud-speed'),
    moonlightIntensity: num('moonlight'),
    ambientIntensity: num('ambient'),
    azimuthDeg: num('azimuth'),
    elevationDeg: num('elevation'),
    lightScattering: num('scatter'),
    fogColor: val('fog-color'),
    fogDensity: num('fog-density'),
    fogStart: num('fog-start'),
    fogHeightFalloff: num('fog-falloff'),
  };
}

function writeWeatherToUi(w: WeatherSettings): void {
  const set = (id: string, v: string | number) => {
    const el = document.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = String(v);
  };
  set('sky-style', w.style);
  set('zenith', w.zenithColor);
  set('moon-size', w.moonSize);
  set('moon-bright', w.moonBrightness);
  set('stars', w.stars);
  set('clouds', w.cloudCoverage);
  set('cloud-speed', w.cloudSpeed);
  set('moonlight', w.moonlightIntensity);
  set('ambient', w.ambientIntensity);
  set('azimuth', w.azimuthDeg);
  set('elevation', w.elevationDeg);
  set('scatter', w.lightScattering);
  set('fog-color', w.fogColor);
  set('fog-density', w.fogDensity);
  set('fog-start', w.fogStart);
  set('fog-falloff', w.fogHeightFalloff);
}

function applyWeather(): void {
  map.weather = readWeatherFromUi();
  atmosphere.apply(map.weather);
  atmosphere.applyFog(scene);
  markDirty();
}

for (const id of [
  'sky-style',
  'zenith',
  'moon-size',
  'moon-bright',
  'stars',
  'clouds',
  'cloud-speed',
  'moonlight',
  'ambient',
  'azimuth',
  'elevation',
  'scatter',
  'fog-color',
  'fog-density',
  'fog-start',
  'fog-falloff',
]) {
  document.querySelector(`#${id}`)?.addEventListener('input', applyWeather);
}

document.querySelector('#flight-speed')?.addEventListener('input', (e) => {
  flightSpeed = Number((e.target as HTMLInputElement).value);
});

document.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'F5') {
    e.preventDefault();
    walkMode = !walkMode;
    walkBar?.classList.toggle('hidden', !walkMode);
  }
  if (e.code === 'Escape') {
    walkMode = false;
    walkBar?.classList.add('hidden');
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2 || e.button === 0) {
    dragging = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= e.movementX * 0.004;
  pitch -= e.movementY * 0.004;
  pitch = THREE.MathUtils.clamp(pitch, -1.4, 1.4);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.querySelectorAll('[data-act]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const act = (btn as HTMLElement).dataset.act;
    if (act === 'play') {
      walkMode = !walkMode;
      walkBar?.classList.toggle('hidden', !walkMode);
      if (status) status.textContent = walkMode ? 'Walk preview active.' : 'Editor fly mode.';
    } else if (act === 'save') {
      const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${map.id}.json`;
      a.click();
      mapDirty = false;
      if (unsaved) unsaved.hidden = true;
      if (status) status.textContent = 'Map saved (download).';
    } else if (act === 'reload') {
      map = createAbbeyClearingMap(map.seed);
      writeWeatherToUi(map.weather);
      atmosphere.apply(map.weather);
      atmosphere.applyFog(scene);
      await rebuild();
      mapDirty = false;
      if (unsaved) unsaved.hidden = true;
    } else if (act === 'reset') {
      camera.position.set(0, 4, 12);
      yaw = 0;
      pitch = -0.25;
    } else if (act === 'pause-fx') {
      pauseFx = !pauseFx;
      if (status) status.textContent = pauseFx ? 'Effects paused.' : 'Effects running.';
    } else if (act === 'add-prop') {
      const kind = (document.querySelector('#prop-kind') as HTMLSelectElement).value;
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      const pos = camera.position.clone().addScaledVector(forward, 4);
      map.props.push({
        id: `${kind}-${map.props.length + 1}`,
        kind,
        position: [pos.x, 0, pos.z],
      });
      markDirty();
      await rebuild();
    } else if (act === 'open-file' || act === 'load') {
      document.querySelector<HTMLInputElement>('#file-open')?.click();
    } else if (act === 'pause-walk') {
      walkMode = false;
      walkBar?.classList.add('hidden');
    }
  });
});

document.querySelector('#file-open')?.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  map = JSON.parse(await file.text()) as BattleHellMap;
  rng = createSeededRandom(map.seed);
  writeWeatherToUi(map.weather);
  atmosphere.apply(map.weather);
  atmosphere.applyFog(scene);
  await rebuild();
  document.querySelector('#map-path')!.textContent = file.name;
  mapDirty = false;
  if (unsaved) unsaved.hidden = true;
});

writeWeatherToUi(map.weather);
void rebuild();

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(euler);

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0);
  const wish = new THREE.Vector3();
  if (keys.has('KeyW')) wish.add(forward);
  if (keys.has('KeyS')) wish.sub(forward);
  if (keys.has('KeyD')) wish.add(right);
  if (keys.has('KeyA')) wish.sub(right);
  if (keys.has('KeyE') || keys.has('Space')) wish.add(up);
  if (keys.has('KeyQ')) wish.sub(up);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(flightSpeed);
  velocity.lerp(wish, 1 - Math.exp(-8 * dt));
  camera.position.addScaledVector(velocity, dt);

  if (walkMode) {
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 1.6, 6, dt);
  }

  if (!pauseFx) vfx.update(dt, camera, rng, now / 1000);

  resizeRenderer(renderer, camera, 1.5);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

(window as unknown as { __BH_EDITOR_DIRTY__?: boolean }).__BH_EDITOR_DIRTY__ = false;
setInterval(() => {
  (window as unknown as { __BH_EDITOR_DIRTY__?: boolean }).__BH_EDITOR_DIRTY__ = mapDirty;
}, 500);
