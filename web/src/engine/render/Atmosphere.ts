import * as THREE from 'three';
import type { WeatherSettings } from '../scene/MapFormat';

/** Céu, lua, neblina e luz ambiente — painel weather do editor. */

export class Atmosphere {
  readonly group = new THREE.Group();
  readonly moonLight: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly moonMesh: THREE.Mesh;
  private readonly sky: THREE.Mesh;
  private settings: WeatherSettings;

  constructor(settings: WeatherSettings) {
    this.settings = { ...settings };

    this.ambient = new THREE.AmbientLight(0x8a9ab0, settings.ambientIntensity);
    this.hemi = new THREE.HemisphereLight(0x4a5a78, 0x2a1810, 0.55);
    this.moonLight = new THREE.DirectionalLight(0xc8d6ff, settings.moonlightIntensity);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 1;
    this.moonLight.shadow.camera.far = 60;
    this.moonLight.shadow.camera.left = -20;
    this.moonLight.shadow.camera.right = 20;
    this.moonLight.shadow.camera.top = 20;
    this.moonLight.shadow.camera.bottom = -20;

    const skyGeo = new THREE.SphereGeometry(80, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(settings.zenithColor) },
        bottomColor: { value: new THREE.Color(0x05070c) },
        offset: { value: 4 },
        exponent: { value: 0.55 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(this.sky);

    const moonGeo = new THREE.SphereGeometry(1, 24, 16);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xfff8e8,
      // High value feeds UnrealBloomPass (goal walk-preview moon)
      toneMapped: false,
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    // Soft halo disc behind moon
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 24),
      new THREE.MeshBasicMaterial({
        color: 0xdde6ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    halo.name = 'moon-halo';
    this.moonMesh.add(halo);
    this.group.add(this.moonMesh);

    this.group.add(this.ambient, this.hemi, this.moonLight);
    this.apply(settings);
  }

  apply(settings: WeatherSettings): void {
    this.settings = { ...settings };
    this.ambient.intensity = settings.ambientIntensity;
    this.moonLight.intensity = settings.moonlightIntensity;
    this.moonMesh.scale.setScalar(settings.moonSize * 2.4);
    const glow = Math.min(1.4, settings.moonBrightness / 5);
    (this.moonMesh.material as THREE.MeshBasicMaterial).color.setRGB(glow, glow * 0.98, glow * 0.92);

    const az = THREE.MathUtils.degToRad(settings.azimuthDeg);
    const el = THREE.MathUtils.degToRad(settings.elevationDeg);
    const dist = 40;
    const x = Math.cos(el) * Math.sin(az) * dist;
    const y = Math.sin(el) * dist;
    const z = Math.cos(el) * Math.cos(az) * dist;
    this.moonLight.position.set(x, y, z);
    this.moonMesh.position.copy(this.moonLight.position).normalize().multiplyScalar(55);

    const skyMat = this.sky.material as THREE.ShaderMaterial;
    (skyMat.uniforms.topColor.value as THREE.Color).set(settings.zenithColor);
  }

  applyFog(scene: THREE.Scene): void {
    const c = new THREE.Color(this.settings.fogColor);
    scene.fog = new THREE.FogExp2(c, this.settings.fogDensity * 0.55);
    scene.background = c.clone().multiplyScalar(0.22);
  }

  getSettings(): WeatherSettings {
    return { ...this.settings };
  }

  dispose(): void {
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.moonMesh.geometry.dispose();
    (this.moonMesh.material as THREE.Material).dispose();
  }
}
