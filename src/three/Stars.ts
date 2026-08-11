import * as THREE from 'three';
import { EARTH_RADIUS } from './Earth';
import { latLonToVec3 } from './coords';
import { GENRE_HUE, STAR_VISUALS, type Work } from '../types';

const STAR_ELEVATION = EARTH_RADIUS * 1.004;

export class Stars {
  public readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly works: Work[];

  private readonly baseSize: Float32Array;
  private readonly baseOpacity: Float32Array;
  private readonly hoverState: Float32Array; // 当前 hover 强度 0..1
  private readonly targetHover: Float32Array; // 目标 hover
  private readonly phase: Float32Array;
  private readonly worldPos: THREE.Vector3;

  private lodBias = 0; // 0 = 远（仅 S/A），1 = 近（全部）

  constructor(works: Work[]) {
    this.works = works;
    const n = works.length;
    this.worldPos = new THREE.Vector3();

    const positions = new Float32Array(n * 3);
    this.baseSize = new Float32Array(n);
    this.baseOpacity = new Float32Array(n);
    this.hoverState = new Float32Array(n);
    this.targetHover = new Float32Array(n);
    this.phase = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const opacities = new Float32Array(n);

    works.forEach((w, i) => {
      const v = latLonToVec3(w.latitude, w.longitude, STAR_ELEVATION);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;

      const vis = STAR_VISUALS[w.popularityLevel];
      this.baseSize[i] = vis.size;
      this.baseOpacity[i] = vis.opacity;
      this.phase[i] = Math.random() * Math.PI * 2;

      sizes[i] = vis.size;
      opacities[i] = vis.opacity;

      const genre = w.genres[0] ?? 'default';
      const c = GENRE_HUE[genre] ?? GENRE_HUE.default;
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    });

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aHover', new THREE.BufferAttribute(this.hoverState, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(this.phase, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uLodBias: { value: 0 },
        uReducedMotion: { value: false },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aOpacity;
        attribute vec3 aColor;
        attribute float aHover;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uLodBias;
        uniform float uReducedMotion;
        varying float vOpacity;
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          // LOD：基于 lod bias 提升 B/C 透明度（远观时压低）
          float lodFactor = aOpacity;
          vColor = aColor;
          // 呼吸（Idle）—— reduced motion 时关闭
          float breathe = uReducedMotion
            ? 1.0
            : 0.88 + 0.12 * sin(uTime * 1.2 + aPhase);
          float hover = aHover;
          vGlow = hover;
          float size = aSize * breathe * (1.0 + hover * 0.35);
          float opacity = lodFactor * (1.0 + hover * 0.6) * breathe;
          vOpacity = clamp(opacity, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixelRatio * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vOpacity;
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          float coreSharp = smoothstep(0.18, 0.0, d);
          float glow = smoothstep(0.5, 0.12, d) * (0.5 + vGlow * 0.6);
          vec3 col = vColor + coreSharp * 0.4; // 中心更白
          float alpha = (core * 0.9 + glow * 0.5) * vOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'stars';
    this.points.frustumCulled = false;
  }

  setTime(t: number) {
    this.material.uniforms.uTime.value = t;
  }

  setPixelRatio(r: number) {
    this.material.uniforms.uPixelRatio.value = r;
  }

  setReducedMotion(v: boolean) {
    this.material.uniforms.uReducedMotion.value = v;
  }

  // LOD：bias 0 = 远观（压低 B/C），1 = 近观（全亮）
  setLodBias(v: number) {
    this.lodBias = THREE.MathUtils.clamp(v, 0, 1);
    this.material.uniforms.uLodBias.value = this.lodBias;
    // 通过重写 aOpacity 来体现 LOD + 国家 boost
    const op = this.geometry.getAttribute('aOpacity') as THREE.BufferAttribute;
    for (let i = 0; i < this.works.length; i++) {
      const tier = this.works[i].popularityLevel;
      let mul = 1;
      if (tier === 'B') mul = 0.35 + 0.65 * this.lodBias;
      else if (tier === 'C') mul = 0.1 + 0.9 * this.lodBias;
      // 国家 hover boost：该国星光 +20%
      if (this.countryBoostId && this.works[i].country === this.countryBoostId) {
        mul *= 1.2;
      }
      op.setX(i, Math.min(1, this.baseOpacity[i] * mul));
    }
    op.needsUpdate = true;
  }

  setHovered(index: number | null) {
    for (let i = 0; i < this.targetHover.length; i++) {
      this.targetHover[i] = i === index ? 1 : 0;
    }
  }

  // 国家 hover 时，该国星光亮度提升 ~20%（规范 Section 19）
  private countryBoostId: string | null = null;
  setCountryBoost(countryId: string | null) {
    if (this.countryBoostId === countryId) return;
    this.countryBoostId = countryId;
    this.setLodBias(this.lodBias); // 重算 opacity（含 country boost）
  }

  update(dt: number) {
    // 平滑过渡 hover 强度
    let changed = false;
    for (let i = 0; i < this.hoverState.length; i++) {
      const cur = this.hoverState[i];
      const tgt = this.targetHover[i];
      const next = THREE.MathUtils.damp(cur, tgt, 12, dt);
      if (Math.abs(next - cur) > 0.001) {
        this.hoverState[i] = next;
        changed = true;
      }
    }
    if (changed) {
      (this.geometry.getAttribute('aHover') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  // 屏幕空间拾取：返回最近星光索引，或 -1
  pick(
    pointerNdc: THREE.Vector2,
    camera: THREE.Camera,
    globeWorldMatrix: THREE.Matrix4,
    maxScreenDist = 22,
  ): number {
    let best = -1;
    let bestDist = maxScreenDist;
    const v = this.worldPos;
    const m = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, globeWorldMatrix);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.works.length; i++) {
      tmp.fromArray([
        (this.geometry.attributes.position as THREE.BufferAttribute).getX(i),
        (this.geometry.attributes.position as THREE.BufferAttribute).getY(i),
        (this.geometry.attributes.position as THREE.BufferAttribute).getZ(i),
      ]);
      // 局部 → 世界
      v.copy(tmp).applyMatrix4(globeWorldMatrix);
      // 世界 → 视图空间，背面剔除
      const view = v.clone().applyMatrix4(camera.matrixWorldInverse);
      if (view.z >= 0) continue; // 在相机后方
      // 投影到 NDC
      tmp.copy(v).project(camera);
      const dx = (tmp.x - pointerNdc.x) * window.innerWidth * 0.5;
      const dy = (tmp.y - pointerNdc.y) * window.innerHeight * 0.5;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
      void m;
    }
    return best;
  }

  worldPositionOf(index: number, target: THREE.Vector3, globeWorldMatrix: THREE.Matrix4) {
    target.set(
      (this.geometry.attributes.position as THREE.BufferAttribute).getX(index),
      (this.geometry.attributes.position as THREE.BufferAttribute).getY(index),
      (this.geometry.attributes.position as THREE.BufferAttribute).getZ(index),
    );
    target.applyMatrix4(globeWorldMatrix);
  }

  getWork(index: number): Work {
    return this.works[index];
  }

  get count(): number {
    return this.works.length;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
