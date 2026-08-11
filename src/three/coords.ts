import * as THREE from 'three';

// 经纬度 → 球面 3D 坐标
// 约定：与 equirectangular 贴图一致，贴图 u=0 对应 lon=-180
export function latLonToVec3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// 平滑插值（帧率无关）
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

// cubic-bezier(0.22, 1, 0.36, 1) 近似 —— 用于 UI 过渡
export const EASE_CINEMATIC = 'cubic-bezier(0.22, 1, 0.36, 1)';
