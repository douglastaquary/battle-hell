import * as THREE from 'three';

/** Entrada FPS + toque paisagem (joystick + botão de tiro). */

export class FpsInput {
  private readonly keys = new Set<string>();
  readonly look = new THREE.Vector2();
  private pointerLocked = false;
  private fireHeld = false;
  private firePressed = false;
  private reloadPressed = false;
  private readonly moveTouch = new THREE.Vector2();
  private touchId: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    fireBtn: HTMLElement,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
    canvas.addEventListener('click', this.requestLock);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mouseup', this.onMouseUp);
    stick.addEventListener('pointerdown', this.onStickDown);
    stick.addEventListener('pointermove', this.onStickMove);
    stick.addEventListener('pointerup', this.onStickUp);
    stick.addEventListener('pointercancel', this.onStickUp);
    fireBtn.addEventListener('pointerdown', this.onFireDown);
    fireBtn.addEventListener('pointerup', this.onFireUp);
    fireBtn.addEventListener('pointercancel', this.onFireUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.canvas.removeEventListener('click', this.requestLock);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
  }

  movement(): THREE.Vector2 {
    const v = new THREE.Vector2();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v.y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v.y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v.x += 1;
    if (v.lengthSq() > 0) v.normalize();
    if (this.moveTouch.lengthSq() > 0) {
      v.add(this.moveTouch);
      if (v.lengthSq() > 1) v.normalize();
    }
    return v;
  }

  isRunning(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeFire(): boolean {
    if (this.firePressed) {
      this.firePressed = false;
      return true;
    }
    return this.fireHeld;
  }

  consumeReload(): boolean {
    if (this.reloadPressed) {
      this.reloadPressed = false;
      return true;
    }
    return false;
  }

  consumeLook(): THREE.Vector2 {
    const out = this.look.clone();
    this.look.set(0, 0);
    return out;
  }

  private readonly requestLock = () => {
    if (!this.pointerLocked) void this.canvas.requestPointerLock();
  };

  private readonly onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.look.x += e.movementX;
    this.look.y += e.movementY;
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.fireHeld = true;
      this.firePressed = true;
    }
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyR') this.reloadPressed = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onStickDown = (e: PointerEvent) => {
    e.preventDefault();
    this.touchId = e.pointerId;
    try {
      this.stick.setPointerCapture(e.pointerId);
    } catch {
      /* test hooks */
    }
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onStickMove = (e: PointerEvent) => {
    if (e.pointerId !== this.touchId) return;
    e.preventDefault();
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onStickUp = (e: PointerEvent) => {
    if (e.pointerId !== this.touchId) return;
    this.touchId = null;
    this.moveTouch.set(0, 0);
    this.knob.style.transform = 'translate(-50%, -50%)';
  };

  private updateStick(clientX: number, clientY: number): void {
    const rect = this.stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.4;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.moveTouch.set(dx / max, -dy / max);
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private readonly onFireDown = (e: PointerEvent) => {
    e.preventDefault();
    this.fireHeld = true;
    this.firePressed = true;
  };

  private readonly onFireUp = () => {
    this.fireHeld = false;
  };
}
