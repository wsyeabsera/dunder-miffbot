// One rig, three views. Isometric is an orthographic camera (so it can pan, zoom and rotate over the big building);
// follow and POV are one perspective camera. Switching modes fades through a short overlay instead of a hard cut.
import * as THREE from "three";
import { BOUNDS } from "./world/level.ts";
import type { Walker } from "./engine/physics.ts";

export type Mode = "iso" | "follow" | "pov" | "walk";

/** What the rig needs to know about the employee it follows. */
export type Subject = {
  /** Feet position. */
  position: THREE.Vector3;
  /** Direction the body faces, radians (0 faces +z). */
  heading: number;
  /** Eye position in the world. */
  eye: THREE.Vector3;
  /** Head tilt: positive looks down. */
  pitch: number;
  /** Head turn, radians, relative to the body. */
  turn: number;
};

type Hooks = {
  onTap(ev: PointerEvent): void;
  onHover(ev: PointerEvent): void;
  onMode(mode: Mode): void;
  /** True when a point on the floor is inside a wall or furniture, so the follow camera can stay out of it. */
  blocked(x: number, z: number): boolean;
  /** The boss character for walk mode (physics capsule), and where it appears. */
  walker: Walker;
  spawn: { x: number; z: number; heading: number };
  fade?: HTMLElement;
};

const ELEVATION = Math.atan(1 / Math.SQRT2); // true isometric
const ISO_DISTANCE = 80;
const VIEW_MIN = 8;
const VIEW_MAX = 52;
const TAU = Math.PI * 2;
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);

export class CameraRig {
  mode: Mode = "iso";
  readonly iso = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  readonly persp = new THREE.PerspectiveCamera(60, 1, 0.05, 300);

  private viewH = 50;
  private target = new THREE.Vector3(0, 0, 0);
  private yaw = Math.PI / 4;
  private yawGoal = Math.PI / 4;
  private aspect = 1;
  private height = 1;
  private followDistance = 5.5;
  private look = { yaw: 0, pitch: 0 };
  private walkLook = { yaw: 0, pitch: 0 };
  private keys = new Set<string>();
  private hooks: Hooks;
  private canvas: HTMLCanvasElement;
  private smooth = new THREE.Vector3();
  private smoothReady = false;

  constructor(canvas: HTMLCanvasElement, hooks: Hooks) {
    this.hooks = hooks;
    this.canvas = canvas;
    this.persp.rotation.order = "YXZ";

    let down: { x: number; y: number } | null = null;
    let last = { x: 0, y: 0 };
    let dragged = false;
    canvas.addEventListener("pointerdown", (e) => {
      down = last = { x: e.clientX, y: e.clientY };
      dragged = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!down) return hooks.onHover(e);
      if (!dragged && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) dragged = true;
      if (dragged) this.drag(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!dragged) {
        // In walk mode a click grabs the mouse; once grabbed, clicks are interactions (office.ts listens for those).
        if (this.mode === "walk" && document.pointerLockElement !== canvas) this.lockMouse();
        else if (this.mode !== "walk") hooks.onTap(e);
      }
      down = null;
    });
    document.addEventListener("mousemove", (e) => {
      if (this.mode !== "walk" || document.pointerLockElement !== canvas) return;
      this.walkLook.yaw -= e.movementX * 0.0022;
      this.walkLook.pitch = Math.max(-1.25, Math.min(1.25, this.walkLook.pitch - e.movementY * 0.0022));
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.mode === "iso") this.viewH = Math.min(VIEW_MAX, Math.max(VIEW_MIN, this.viewH * Math.exp(e.deltaY * 0.0012)));
      else if (this.mode === "follow") this.followDistance = Math.min(14, Math.max(2.5, this.followDistance * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "q" && this.mode === "iso") this.yawGoal += Math.PI / 2;
      else if (k === "e" && this.mode === "iso") this.yawGoal -= Math.PI / 2;
      else if (k === "c") this.look = { yaw: 0, pitch: 0 };
      else this.keys.add(k);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  get camera(): THREE.Camera {
    return this.mode === "iso" ? this.iso : this.persp;
  }

  resize(width: number, height: number) {
    this.aspect = width / height;
    this.height = height;
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    this.applyIsoFrustum();
  }

  /** Switch view, fading through the overlay so there is no visible pop. */
  setMode(mode: Mode) {
    if (mode === this.mode) return;
    const apply = () => {
      this.mode = mode;
      this.smoothReady = false;
      if (mode === "walk") {
        const sp = this.hooks.spawn;
        this.hooks.walker.place(sp.x, sp.z);
        this.walkLook = { yaw: Math.PI + sp.heading, pitch: 0 };
        this.lockMouse();
      } else if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock();
      }
      this.hooks.onMode(mode);
    };
    const fade = this.hooks.fade;
    if (!fade) return apply();
    fade.classList.add("on");
    setTimeout(() => {
      apply();
      fade.classList.remove("on");
    }, 140);
  }

  /** Move the overhead view to look at a point. */
  focus(x: number, z: number) {
    this.target.set(x, 0, z);
  }

  private applyIsoFrustum() {
    this.iso.left = (-this.viewH * this.aspect) / 2;
    this.iso.right = (this.viewH * this.aspect) / 2;
    this.iso.top = this.viewH / 2;
    this.iso.bottom = -this.viewH / 2;
    this.iso.updateProjectionMatrix();
  }

  private drag(dx: number, dy: number) {
    if (this.mode === "iso") {
      const upp = this.viewH / this.height; // world units per pixel
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.target.addScaledVector(right, -dx * upp).addScaledVector(forward, (dy * upp) / Math.sin(ELEVATION));
    } else if (this.mode === "pov") {
      this.look.yaw = Math.max(-1.3, Math.min(1.3, this.look.yaw - dx * 0.005));
      this.look.pitch = Math.max(-0.9, Math.min(0.9, this.look.pitch + dy * 0.005));
    }
  }

  update(dt: number, subject: Subject | null) {
    if (this.mode === "iso") this.updateIso(dt);
    else if (this.mode === "walk") this.updateWalk(dt);
    else if (subject) this.mode === "follow" ? this.updateFollow(dt, subject) : this.updatePov(subject);
  }

  private updateIso(dt: number) {
    const speed = this.viewH * 0.9 * dt;
    const dir = new THREE.Vector3();
    const has = (...k: string[]) => k.some((x) => this.keys.has(x));
    if (has("w", "arrowup")) dir.z -= 1;
    if (has("s", "arrowdown")) dir.z += 1;
    if (has("a", "arrowleft")) dir.x -= 1;
    if (has("d", "arrowright")) dir.x += 1;
    if (has("=", "+")) this.viewH = Math.max(VIEW_MIN, this.viewH * (1 - dt * 1.2));
    if (has("-", "_")) this.viewH = Math.min(VIEW_MAX, this.viewH * (1 + dt * 1.2));
    if (dir.lengthSq()) {
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.target.addScaledVector(right, dir.x * speed).addScaledVector(forward, -dir.z * speed);
    }
    this.target.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, this.target.x));
    this.target.z = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, this.target.z));
    const d = ((this.yawGoal - this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.yaw += d * Math.min(1, dt * 8);
    const c = Math.cos(ELEVATION) * ISO_DISTANCE;
    this.iso.position.set(this.target.x + Math.sin(this.yaw) * c, Math.sin(ELEVATION) * ISO_DISTANCE, this.target.z + Math.cos(this.yaw) * c);
    this.iso.lookAt(this.target.x, 0, this.target.z);
    this.applyIsoFrustum();
  }

  /** Grab the mouse for looking around. Browsers refuse without a recent click or key press; that is fine, a click will grab it. */
  private lockMouse() {
    try {
      const attempt = this.canvas.requestPointerLock() as unknown;
      if (attempt instanceof Promise) attempt.catch(() => {});
    } catch {
      /* not allowed right now */
    }
  }

  /** Where the camera is looking on the floor, and how much of the floor the shadow light needs to cover. */
  shadowFocus(subject: { x: number; z: number } | null): { x: number; z: number; half: number } {
    if (this.mode === "iso") return { x: this.target.x, z: this.target.z, half: Math.min(50, Math.max(16, this.viewH * 1.1 + 6)) };
    if (this.mode === "walk") {
      const p = this.hooks.walker.position();
      return { x: p.x, z: p.z, half: 24 };
    }
    return { x: subject?.x ?? 0, z: subject?.z ?? 0, half: 24 };
  }

  /** True while the overhead view is zoomed out far enough to read room names without them covering the furniture. */
  get overview(): boolean {
    return this.mode === "iso" && this.viewH > 24;
  }

  /** A size factor for things drawn over the scene (bubbles): constant on screen whatever the zoom or distance. 1 is about 2.3 units wide. */
  labelScale(distance: number): number {
    const k = this.mode === "iso" ? this.viewH / 50 : distance / 9;
    return Math.min(2, Math.max(0.3, k));
  }

  /** Where the walking boss stands (feet), for the minimap. */
  walkPosition() {
    return this.hooks.walker.position();
  }

  private updateWalk(dt: number) {
    const has = (...k: string[]) => k.some((x) => this.keys.has(x));
    const fwd = (has("w", "arrowup") ? 1 : 0) - (has("s", "arrowdown") ? 1 : 0);
    const side = (has("d", "arrowright") ? 1 : 0) - (has("a", "arrowleft") ? 1 : 0);
    const { yaw, pitch } = this.walkLook;
    if (fwd || side) {
      const speed = (this.keys.has("shift") ? 5.5 : 3.2) * dt;
      let dx = -Math.sin(yaw) * fwd + Math.cos(yaw) * side;
      let dz = -Math.cos(yaw) * fwd - Math.sin(yaw) * side;
      const len = Math.hypot(dx, dz) || 1;
      dx = (dx / len) * speed;
      dz = (dz / len) * speed;
      this.hooks.walker.move(dx, dz);
    }
    const p = this.hooks.walker.position();
    this.persp.fov = 78;
    this.persp.updateProjectionMatrix();
    this.persp.position.set(p.x, 1.65, p.z);
    this.persp.rotation.set(pitch, yaw, 0);
  }

  private updateFollow(dt: number, s: Subject) {
    // Behind them, but pulled in until the camera is out of any wall
    const dir = new THREE.Vector3(-Math.sin(s.heading), 0, -Math.cos(s.heading));
    let d = this.followDistance;
    for (let t = 0.6; t <= d; t += 0.25) {
      if (this.hooks.blocked(s.position.x + dir.x * t, s.position.z + dir.z * t)) {
        d = Math.max(1.2, t - 0.6);
        break;
      }
    }
    const want = new THREE.Vector3(s.position.x + dir.x * d, 2.2 + d * 0.18, s.position.z + dir.z * d);
    if (!this.smoothReady) {
      this.smooth.copy(want);
      this.smoothReady = true;
    }
    this.smooth.lerp(want, Math.min(1, dt * 3));
    this.persp.fov = 58;
    this.persp.updateProjectionMatrix();
    this.persp.position.copy(this.smooth);
    this.persp.lookAt(s.position.x, 1.3, s.position.z);
  }

  private updatePov(s: Subject) {
    this.persp.fov = 78;
    this.persp.updateProjectionMatrix();
    this.persp.position.copy(s.eye);
    this.persp.rotation.set(-s.pitch + this.look.pitch, s.heading + s.turn + Math.PI + this.look.yaw, 0);
  }
}
