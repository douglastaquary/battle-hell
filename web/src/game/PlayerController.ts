import * as THREE from 'three';
import { Materials, getGunMarkTexture } from '../engine/render/MaterialKit';
import type { WorldBuilder } from '../engine/scene/WorldBuilder';
import type { FpsInput } from './FpsInput';
import { WEAPONS, type WeaponDef, type WeaponId } from './Weapons';

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
  weaponDef: WeaponDef = WEAPONS.double_barrel;
  private bob = 0;
  private readonly eye = new THREE.Vector3();
  private weaponGlb: THREE.Object3D | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(camera);
    camera.position.set(0, 0, 0);
    this.pitchObject.add(this.weapon);
    this.applyWeapon('double_barrel');
  }

  applyWeapon(id: WeaponId): void {
    this.weaponDef = WEAPONS[id];
    this.maxShells = this.weaponDef.shells;
    this.shells = this.weaponDef.shells;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.buildViewmodel(this.weaponDef.view);
  }

  private buildViewmodel(view: WeaponDef['view']): void {
    while (this.weapon.children.length) this.weapon.remove(this.weapon.children[0]);
    if (view === 'blade') this.buildBlade();
    else if (view === 'lantern') this.buildLantern();
    else if (this.weaponGlb) this.mountRifleGlb();
    else this.buildShotgun();
  }

  private mountRifleGlb(): void {
    if (!this.weaponGlb) return;
    const root = this.weaponGlb.clone(true);
    // Blender +Y barrel → glTF −Z; orient toward camera forward (−Z) with FPS hold pose.
    root.scale.setScalar(0.55);
    root.rotation.set(0.08, Math.PI, 0.04);
    root.position.set(0.14, -0.22, -0.42);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    this.weapon.add(root);
  }

  private buildShotgun(): void {
    const bodyMat = Materials.gunBody();
    const brass = Materials.brass();
    const iron = Materials.iron();
    const ox = 0.08;
    const oy = -0.26;
    const oz = -0.48;

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.46), bodyMat);
    receiver.position.set(ox, oy, oz);
    receiver.castShadow = true;
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.36), bodyMat);
    cheek.position.set(ox, oy + 0.09, oz + 0.02);
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.028, 0.34), brass);
    topRail.position.set(ox, oy + 0.115, oz - 0.02);
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.065, 0.065),
      new THREE.MeshBasicMaterial({
        map: getGunMarkTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: true,
      }),
    );
    mark.position.set(ox, oy + 0.132, oz + 0.04);
    mark.rotation.x = -Math.PI / 2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.22), bodyMat);
    stock.position.set(ox, oy - 0.01, oz + 0.3);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), bodyMat);
    grip.position.set(ox, oy - 0.1, oz + 0.12);
    grip.rotation.x = 0.35;
    const barrelL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.5), iron);
    barrelL.position.set(ox - 0.045, oy + 0.02, oz - 0.42);
    const barrelR = barrelL.clone();
    barrelR.position.x = ox + 0.045;
    const muzzlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.04), brass);
    muzzlePlate.position.set(ox, oy + 0.02, oz - 0.68);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.045), brass);
    band.position.set(ox, oy + 0.02, oz - 0.2);
    this.weapon.add(
      receiver,
      cheek,
      topRail,
      mark,
      stock,
      grip,
      barrelL,
      barrelR,
      muzzlePlate,
      band,
    );
  }

  private buildBlade(): void {
    const iron = Materials.iron();
    const brass = Materials.brass();
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.18), Materials.gunBody());
    grip.position.set(0.22, -0.22, -0.35);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), brass);
    guard.position.set(0.22, -0.2, -0.46);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.7), iron);
    blade.position.set(0.22, -0.195, -0.82);
    this.weapon.add(grip, guard, blade);
  }

  private buildLantern(): void {
    const brass = Materials.brass();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.22, 0.16),
      Materials.gunBody(),
    );
    body.position.set(0.2, -0.24, -0.45);
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x221008,
        emissive: 0xffaa44,
        emissiveIntensity: 2.4,
        toneMapped: false,
      }),
    );
    pane.position.set(0.2, -0.22, -0.45);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.18), brass);
    cap.position.set(0.2, -0.12, -0.45);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), Materials.iron());
    skull.position.set(0.2, -0.14, -0.36);
    this.weapon.add(body, pane, cap, skull);
  }

  async attachWeaponGlb(loader: (kind: string) => Promise<THREE.Object3D | null>): Promise<void> {
    const glb = await loader('weapon');
    if (glb) this.weaponGlb = glb;
    this.buildViewmodel(this.weaponDef.view);
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

    const usesAmmo = this.maxShells > 0;

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

    if (
      usesAmmo &&
      input.consumeReload() &&
      this.shells < this.maxShells &&
      this.reloading <= 0
    ) {
      this.reloading = this.weaponDef.reloadTime;
      reloadStarted = true;
    }

    if (input.consumeFire() && this.fireCooldown <= 0 && this.reloading <= 0) {
      if (!usesAmmo || this.shells > 0) {
        if (usesAmmo) this.shells -= 1;
        this.fireCooldown = this.weaponDef.fireCooldown;
        this.weapon.rotation.x = this.weaponDef.view === 'blade' ? -0.55 : -0.25;
        fired = true;
        muzzle = this.getMuzzleWorld();
        if (usesAmmo && this.shells === 0 && this.weaponDef.reloadTime > 0) {
          this.reloading = this.weaponDef.reloadTime;
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
    if (this.weaponDef.view === 'blade') this.eye.set(0.22, -0.2, -1.05);
    else if (this.weaponDef.view === 'lantern') this.eye.set(0.2, -0.2, -0.7);
    else this.eye.set(0.14, -0.18, -1.15); // longwatch muzzle tip
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
