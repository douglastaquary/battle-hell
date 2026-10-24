import * as THREE from 'three';
import { Materials, getGunMarkTexture } from '../engine/render/MaterialKit';
import type { WorldBuilder } from '../engine/scene/WorldBuilder';
import type { FpsInput } from './FpsInput';

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  readonly yawObject = new THREE.Object3D();
  readonly pitchObject = new THREE.Object3D();
  readonly weapon = new THREE.Group();
  position = new THREE.Vector3(0, 1.6, 6);
  velocity = new THREE.Vector3();
  health = 100;
  maxHealth = 100;
  armor = 0;
  shells = 2;
  maxShells = 2;
  reloading = 0;
  fireCooldown = 0;
  private bob = 0;
  private readonly eye = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(camera);
    camera.position.set(0, 0, 0);
    this.pitchObject.add(this.weapon);
    this.buildWeaponProxy();
  }

  private buildWeaponProxy(): void {
    // Authoring aligned to walk-preview: angular dark metal + brass trim + >< mark.
    while (this.weapon.children.length) this.weapon.remove(this.weapon.children[0]);
    const bodyMat = Materials.gunBody();
    const brass = Materials.brass();
    const iron = Materials.iron();

    // Centered lower like walk-preview FPS gun.
    const ox = 0.12;
    const oy = -0.28;
    const oz = -0.5;

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.5), bodyMat);
    receiver.position.set(ox, oy, oz);
    receiver.castShadow = true;

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.42), brass);
    topRail.position.set(ox, oy + 0.075, oz);

    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.07),
      new THREE.MeshBasicMaterial({
        map: getGunMarkTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: true,
      }),
    );
    mark.position.set(ox, oy + 0.095, oz + 0.08);
    mark.rotation.x = -0.2;

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.2), bodyMat);
    stock.position.set(ox, oy - 0.02, oz + 0.28);

    const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.52, 8), iron);
    barrelL.rotation.x = Math.PI / 2;
    barrelL.position.set(ox - 0.04, oy + 0.01, oz - 0.38);
    const barrelR = barrelL.clone();
    barrelR.position.x = ox + 0.04;

    const band = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.05), brass);
    band.position.set(ox, oy + 0.01, oz - 0.18);

    this.weapon.add(receiver, topRail, mark, stock, barrelL, barrelR, band);
  }

  async attachWeaponGlb(_loader: (kind: string) => Promise<THREE.Object3D | null>): Promise<void> {
    // Keep authored viewmodel (goal image). GLB kit remains for world props/enemies.
    this.buildWeaponProxy();
  }

  syncRig(): void {
    this.yawObject.position.copy(this.position);
  }

  update(
    dt: number,
    input: FpsInput,
    world: WorldBuilder,
    arenaRadius: number,
  ): {
    fired: boolean;
    dryFire: boolean;
    reloadStarted: boolean;
    muzzle: THREE.Vector3 | null;
    moving: boolean;
    running: boolean;
  } {
    const look = input.consumeLook();
    this.yawObject.rotation.y -= look.x * 0.0022;
    this.pitchObject.rotation.x -= look.y * 0.0022;
    this.pitchObject.rotation.x = THREE.MathUtils.clamp(this.pitchObject.rotation.x, -1.2, 1.2);

    const move = input.movement();
    const speed = input.isRunning() ? 6.2 : 3.8;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.yawObject.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.yawObject.quaternion);
    const wish = forward.multiplyScalar(move.y).add(right.multiplyScalar(move.x));
    wish.y = 0;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x, 12, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z, 12, dt);

    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    if (!world.collides(nextX, this.position.z, 0.4, arenaRadius)) this.position.x = nextX;
    if (!world.collides(this.position.x, nextZ, 0.4, arenaRadius)) this.position.z = nextZ;

    const moving = move.lengthSq() > 0.01;
    this.bob += dt * (moving ? 10 : 2);
    this.position.y = 1.6 + Math.sin(this.bob) * (moving ? 0.035 : 0.01);
    this.weapon.position.y = -0.02 + Math.sin(this.bob * 1.1) * 0.01;
    this.weapon.rotation.x = THREE.MathUtils.damp(this.weapon.rotation.x, 0, 8, dt);

    if (this.reloading > 0) {
      this.reloading -= dt;
      this.weapon.rotation.x = 0.35;
      if (this.reloading <= 0) this.shells = this.maxShells;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    let fired = false;
    let dryFire = false;
    let reloadStarted = false;
    let muzzle: THREE.Vector3 | null = null;
    if (input.consumeReload() && this.shells < this.maxShells && this.reloading <= 0) {
      this.reloading = 1.55;
      reloadStarted = true;
    }
    if (input.consumeFire() && this.fireCooldown <= 0 && this.reloading <= 0) {
      if (this.shells > 0) {
        this.shells -= 1;
        this.fireCooldown = 0.35;
        this.weapon.rotation.x = -0.25;
        fired = true;
        muzzle = this.getMuzzleWorld();
        if (this.shells === 0) {
          this.reloading = 1.55;
          reloadStarted = true;
        }
      } else {
        dryFire = true;
        this.fireCooldown = 0.25;
      }
    }

    this.syncRig();
    return { fired, dryFire, reloadStarted, muzzle, moving, running: input.isRunning() };
  }

  getMuzzleWorld(): THREE.Vector3 {
    this.eye.set(0.22, -0.15, -0.85);
    this.pitchObject.localToWorld(this.eye);
    return this.eye.clone();
  }

  getForward(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.pitchObject.getWorldQuaternion(new THREE.Quaternion()));
    return dir.normalize();
  }

  takeDamage(amount: number): void {
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.6);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health = Math.max(0, this.health - dmg);
  }
}
