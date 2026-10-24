import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Pipeline pós-processo barato: bloom para lua/fogo + env map para metais da arma.
 * Mobile: bloom mais fraco; 1 pass além do render.
 */
export class PostPipeline {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly pmrem: THREE.PMREMGenerator;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    const size = new THREE.Vector2();
    renderer.getSize(size);
    // Threshold high so moon/fire bloom; metals/HUD stay readable (goal walk-preview).
    this.bloom = new UnrealBloomPass(size, 0.42, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setMobile(mobile: boolean): void {
    this.bloom.strength = mobile ? 0.28 : 0.42;
    this.bloom.threshold = mobile ? 0.92 : 0.9;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.bloom.setSize(width * dpr, height * dpr);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.pmrem.dispose();
  }
}
