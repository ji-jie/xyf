import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Earth, EARTH_RADIUS } from './Earth';
import { Stars } from './Stars';
import { CountryMarkers } from './CountryMarkers';
import { createSpaceTexture } from './EarthTexture';
import { COUNTRIES } from '../data/countries';
import { WORKS } from '../data/works';
import type { AppState, HoverTarget } from '../types';

export interface GlobeSceneCallbacks {
  onStateChange?: (s: AppState) => void;
  onHover?: (h: HoverTarget) => void;
}

export type DeviceTier = 'high' | 'medium' | 'low';

const DIST_GLOBAL = 2.6;
const DIST_IMMERSIVE = 1.62;
const DIST_MIN = 1.5;
const DIST_MAX = 3.2;

function detectTier(): DeviceTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 4;
  const dpr = window.devicePixelRatio || 1;
  if (cores >= 8 && mem >= 4 && dpr <= 2) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

export class GlobeScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly earth: Earth;
  private readonly stars: Stars;
  private readonly markers: CountryMarkers;
  private readonly dust: THREE.Points;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly clock = new THREE.Clock();
  private readonly callbacks: GlobeSceneCallbacks;

  private readonly tier: DeviceTier;
  private readonly reducedMotion: boolean;

  private state: AppState = 'LOADING';
  private rafId = 0;
  private targetDistance = DIST_GLOBAL;
  private currentDistance = DIST_GLOBAL;
  private reveal = 0; // 加载显现进度 0..1

  // 拖拽判定
  private downPos = new THREE.Vector2();
  private dragging = false;
  private moved = false;

  // 当前 hover
  private hoveredStar: number | null = null;
  private hoveredCountryId: string | null = null;
  private isTouch = false;

  constructor(container: HTMLElement, cb: GlobeSceneCallbacks = {}) {
    this.container = container;
    this.callbacks = cb;
    this.tier = detectTier();
    this.reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const dpr =
      this.tier === 'high'
        ? Math.min(window.devicePixelRatio, 2)
        : this.tier === 'medium'
          ? Math.min(window.devicePixelRatio, 1.5)
          : 1;

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.tier !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050609');

    this.camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 0, this.currentDistance);

    // 灯光：暖白主光 + 冷蓝补光 + 环境
    const ambient = new THREE.AmbientLight('#0A0E16', 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight('#FFE9C2', 1.5);
    sun.position.set(5, 2, 4);
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight('#3A4A6B', 0.35);
    rim.position.set(-4, -1, -3);
    this.scene.add(rim);

    // 背景空间球
    const spaceTex = createSpaceTexture();
    const spaceGeo = new THREE.SphereGeometry(50, 32, 24);
    const spaceMat = new THREE.MeshBasicMaterial({
      map: spaceTex,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const spaceSphere = new THREE.Mesh(spaceGeo, spaceMat);
    this.scene.add(spaceSphere);

    // 地球 + 星光 + 国家节点
    this.earth = new Earth();
    this.scene.add(this.earth.group);

    const visibleWorks =
      this.tier === 'low' ? WORKS.filter((w) => w.popularityLevel !== 'C') : WORKS;
    this.stars = new Stars(visibleWorks);
    this.earth.group.add(this.stars.points); // 跟随地球旋转

    this.markers = new CountryMarkers(COUNTRIES);
    this.earth.group.add(this.markers.group);

    // 远景星尘
    this.dust = this.createDust();
    this.scene.add(this.dust);

    // 控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.enableZoom = false; // 自行处理缩放，保证电影感
    this.controls.rotateSpeed = 0.5;
    this.controls.minDistance = DIST_MIN;
    this.controls.maxDistance = DIST_MAX;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.22;

    this.stars.setReducedMotion(this.reducedMotion);
    this.stars.setPixelRatio(dpr);

    this.bindEvents();
  }

  private createDust(): THREE.Points {
    const count = this.tier === 'high' ? 700 : this.tier === 'medium' ? 350 : 150;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // 在球壳内分布
      const r = 6 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.5 + Math.random() * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelRatio: { value: this.renderer.getPixelRatio() } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        uniform float uPixelRatio;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (160.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * 0.5;
          gl_FragColor = vec4(0.85, 0.88, 1.0, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  // ---------- 事件 ----------
  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onResize);
  }

  private updatePointerNdc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.isTouch = e.pointerType === 'touch';
    this.downPos.set(e.clientX, e.clientY);
    this.dragging = true;
    this.moved = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    this.updatePointerNdc(e);
    if (this.dragging) {
      const dx = e.clientX - this.downPos.x;
      const dy = e.clientY - this.downPos.y;
      if (Math.hypot(dx, dy) > 4) this.moved = true;
    }
    if (this.isTouch) return; // 触摸端不做 hover
    this.updateHover();
  };

  private onPointerUp = (e: PointerEvent) => {
    this.updatePointerNdc(e);
    const wasDragging = this.dragging;
    this.dragging = false;
    if (wasDragging && !this.moved) {
      // 视为点击
      this.handleClick();
    }
  };

  private onPointerLeave = () => {
    this.dragging = false;
    this.setHover({ kind: 'none' });
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * 0.12;
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + delta,
      this.state === 'IMMERSIVE_GLOBE' ? DIST_MIN : DIST_IMMERSIVE,
      DIST_MAX,
    );
  };

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ---------- 拾取 ----------
  private globeWorldMatrix(): THREE.Matrix4 {
    return this.earth.group.matrixWorld;
  }

  private updateHover() {
    if (this.state === 'LOADING') return;
    const m = this.globeWorldMatrix();

    // 优先星光
    const starIdx = this.stars.pick(this.pointerNdc, this.camera, m, 22);
    if (starIdx >= 0) {
      if (starIdx !== this.hoveredStar) {
        this.hoveredStar = starIdx;
        this.stars.setHovered(starIdx);
        this.markers.setHovered(null);
        this.stars.setCountryBoost(null);
        this.setHover({ kind: 'star', work: this.stars.getWork(starIdx) });
      }
      return;
    }

    // 再国家
    const country = this.markers.pick(this.pointerNdc, this.camera, m, 40);
    if (country) {
      if (country.id !== this.hoveredCountryId) {
        this.hoveredCountryId = country.id;
        this.hoveredStar = null;
        this.stars.setHovered(null);
        this.markers.setHovered(country.id);
        this.stars.setCountryBoost(country.id);
        this.setHover({ kind: 'country', country });
      }
      return;
    }

    // 地球
    if (this.hoveredStar !== null || this.hoveredCountryId !== null) {
      this.hoveredStar = null;
      this.hoveredCountryId = null;
      this.stars.setHovered(null);
      this.markers.setHovered(null);
      this.stars.setCountryBoost(null);
    }
    // 判断是否指向地球（用于 GLOBAL_VIEW 下的 ENTER 提示）
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObject(this.earth.mesh, false)[0];
    this.setHover(hit ? { kind: 'globe' } : { kind: 'none' });
  }

  private setHover(h: HoverTarget) {
    this.callbacks.onHover?.(h);
  }

  private handleClick() {
    if (this.state !== 'GLOBAL_VIEW') return;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObject(this.earth.mesh, false)[0];
    if (hit) this.enterImmersive();
  }

  // ---------- 状态机 ----------
  enterImmersive() {
    if (this.state !== 'GLOBAL_VIEW') return;
    this.setState('IMMERSIVE_GLOBE');
    this.targetDistance = DIST_IMMERSIVE;
    this.controls.autoRotate = false;
  }

  exitImmersive() {
    if (this.state !== 'IMMERSIVE_GLOBE') return;
    this.setState('GLOBAL_VIEW');
    this.targetDistance = DIST_GLOBAL;
    this.controls.autoRotate = !this.reducedMotion;
  }

  private setState(s: AppState) {
    this.state = s;
    this.callbacks.onStateChange?.(s);
  }

  getState(): AppState {
    return this.state;
  }

  // 加载动画推进
  setReveal(t: number) {
    this.reveal = THREE.MathUtils.clamp(t, 0, 1);
    this.earth.setReveal(this.reveal);
  }

  start() {
    this.clock.start();
    this.loop();
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // 距离平滑
    this.currentDistance = THREE.MathUtils.damp(
      this.currentDistance,
      this.targetDistance,
      4,
      dt,
    );
    // 应用距离到相机（保留用户拖动方向）
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(
      this.controls.target.clone().add(dir.multiplyScalar(this.currentDistance)),
    );

    this.controls.update();

    // LOD：远观压低 B/C
    const lodBias = THREE.MathUtils.clamp(
      (2.6 - this.currentDistance) / (2.6 - 1.6),
      0,
      1,
    );
    this.stars.setLodBias(lodBias);
    this.stars.setTime(t);
    this.stars.update(dt);
    this.markers.update(dt);

    // 大气层强度随沉浸感提升
    const atmoIntensity =
      0.55 + (this.state === 'IMMERSIVE_GLOBE' ? 0.45 : 0.25) * lodBias;
    this.earth.setAtmosphereIntensity(atmoIntensity);

    // 远景星尘极慢自转
    if (!this.reducedMotion) {
      this.dust.rotation.y += dt * 0.005;
      this.dust.rotation.x += dt * 0.002;
    }

    this.renderer.render(this.scene, this.camera);
  };

  getTier(): DeviceTier {
    return this.tier;
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.earth.dispose();
    this.stars.dispose();
    this.markers.dispose();
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (el.parentElement) el.parentElement.removeChild(el);
  }

  // 供 UI 获取地球屏幕位置（用于 tooltip 定位）
  projectWorld(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(world).project(this.camera);
    return out;
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  // 暴露给 UI 用于 tooltip 定位的 hover 元素世界坐标
  hoveredWorldPosition(): THREE.Vector3 | null {
    const m = this.globeWorldMatrix();
    const out = new THREE.Vector3();
    if (this.hoveredStar !== null) {
      this.stars.worldPositionOf(this.hoveredStar, out, m);
      return out;
    }
    if (this.hoveredCountryId) {
      const c = COUNTRIES.find((x) => x.id === this.hoveredCountryId);
      if (c) {
        this.markers.worldPositionOf(c, out, m);
        return out;
      }
    }
    return null;
  }
}

export { EARTH_RADIUS };
