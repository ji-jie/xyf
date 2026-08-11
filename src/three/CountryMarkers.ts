import * as THREE from 'three';
import { EARTH_RADIUS } from './Earth';
import { latLonToVec3 } from './coords';
import type { Country } from '../types';

const NODE_ELEVATION = EARTH_RADIUS * 1.002;

function makeGlowTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,244,214,0.9)');
  g.addColorStop(0.25, 'rgba(255,216,138,0.5)');
  g.addColorStop(0.55, 'rgba(255,201,107,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Marker {
  country: Country;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  localPos: THREE.Vector3;
  intensity: number;
  target: number;
}

// 国家节点 —— 柔和光晕（非地图 Pin），hover 时增强。
// 注：真正的“国家边界轮廓高亮”需 GeoJSON，属 Phase 1+ 范畴，受 Gate B 验收控制。
export class CountryMarkers {
  public readonly group: THREE.Group;
  private readonly markers: Marker[] = [];
  private readonly glowTex: THREE.CanvasTexture;
  private readonly worldPos = new THREE.Vector3();

  constructor(countries: Country[]) {
    this.group = new THREE.Group();
    this.glowTex = makeGlowTexture();

    countries.forEach((country) => {
      const localPos = latLonToVec3(
        country.latitude,
        country.longitude,
        NODE_ELEVATION,
      );

      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTex: { value: this.glowTex },
          uIntensity: { value: 0.18 },
          uColor: { value: new THREE.Color('#FFD88A') },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uTex;
          uniform float uIntensity;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            vec4 t = texture2D(uTex, vUv);
            gl_FragColor = vec4(uColor, t.a * uIntensity);
          }
        `,
      });

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.28),
        material,
      );
      // 贴合球面：位置 + 朝向沿法线
      mesh.position.copy(localPos);
      mesh.lookAt(localPos.clone().multiplyScalar(2));
      mesh.name = `country-${country.id}`;

      this.group.add(mesh);
      this.markers.push({
        country,
        mesh,
        material,
        localPos,
        intensity: 0.18,
        target: 0.18,
      });
    });
  }

  setHovered(id: string | null) {
    this.markers.forEach((m) => {
      m.target = m.country.id === id ? 0.95 : 0.18;
    });
  }

  // 附近星光亮度提升由 GlobeScene 调用 Stars 实现（这里只负责节点）
  update(dt: number) {
    for (const m of this.markers) {
      m.intensity = THREE.MathUtils.damp(m.intensity, m.target, 8, dt);
      m.material.uniforms.uIntensity.value = m.intensity;
    }
  }

  // 屏幕空间拾取国家
  pick(
    pointerNdc: THREE.Vector2,
    camera: THREE.Camera,
    globeWorldMatrix: THREE.Matrix4,
    maxScreenDist = 40,
  ): Country | null {
    let best: Country | null = null;
    let bestDist = maxScreenDist;
    const tmp = new THREE.Vector3();
    for (const m of this.markers) {
      tmp.copy(m.localPos).applyMatrix4(globeWorldMatrix);
      const view = tmp.clone().applyMatrix4(camera.matrixWorldInverse);
      if (view.z >= 0) continue;
      tmp.project(camera);
      const dx = (tmp.x - pointerNdc.x) * window.innerWidth * 0.5;
      const dy = (tmp.y - pointerNdc.y) * window.innerHeight * 0.5;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = m.country;
      }
    }
    return best;
  }

  worldPositionOf(country: Country, target: THREE.Vector3, globeWorldMatrix: THREE.Matrix4) {
    const m = this.markers.find((x) => x.country.id === country.id);
    if (m) target.copy(m.localPos).applyMatrix4(globeWorldMatrix);
  }

  dispose() {
    this.glowTex.dispose();
    for (const m of this.markers) {
      m.mesh.geometry.dispose();
      m.material.dispose();
    }
  }
}
