import * as THREE from 'three';
import { createEarthTexture } from './EarthTexture';

// 地球半径单位（场景内统一参考）
export const EARTH_RADIUS = 1;

export class Earth {
  public readonly group: THREE.Group;
  public readonly mesh: THREE.Mesh;
  public readonly atmosphere: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;

  constructor() {
    this.group = new THREE.Group();

    const texture = createEarthTexture();

    this.material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.0,
      emissive: new THREE.Color('#0A1018'),
      emissiveIntensity: 0.35,
      emissiveMap: texture,
    });

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 96, 64),
      this.material,
    );
    this.mesh.name = 'earth';
    this.group.add(this.mesh);

    this.atmosphere = this.createAtmosphere();
    this.group.add(this.atmosphere);
  }

  // 大气层 Rim Light —— fresnel + backside + additive
  private createAtmosphere(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(EARTH_RADIUS * 1.06, 64, 48);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color('#FFD88A') }, // 暖白淡金 rim
        uIntensity: { value: 0.9 },
        uPower: { value: 3.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uPower;
        void main() {
          float rim = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), uPower);
          // 暖白内核 + 极淡冰蓝外缘
          vec3 inner = uColor;
          vec3 outer = vec3(0.55, 0.70, 1.0);
          vec3 col = mix(inner, outer, smoothstep(0.4, 1.0, rim));
          gl_FragColor = vec4(col, rim * uIntensity);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'atmosphere';
    return mesh;
  }

  setAtmosphereIntensity(v: number) {
    (this.atmosphere.material as THREE.ShaderMaterial).uniforms.uIntensity.value = v;
  }

  // 加载动画：地球从黑暗中显现
  setReveal(t: number) {
    // t: 0..1
    this.material.opacity = t;
    this.material.transparent = t < 1;
    this.material.emissiveIntensity = 0.15 + t * 0.25;
    this.setAtmosphereIntensity(0.2 + t * 0.7);
    this.group.visible = t > 0.001;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.atmosphere.geometry.dispose();
    (this.atmosphere.material as THREE.Material).dispose();
  }
}
