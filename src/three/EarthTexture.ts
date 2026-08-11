import * as THREE from 'three';

// 程序化占位地球贴图 —— Gate A 未通过前的临时资产
// 用简化大陆轮廓 + 海洋渐变 + 细经纬线，视觉上读作“地球”，但不依赖任何外部受版权贴图。
// TODO(Gate A 通过后)：替换为 NASA Blue Marble / 自然地球等公共领域贴图或已授权资产。

// 简化大陆轮廓（[lat, lon] 多边形）—— 仅用于占位识别，非地理精确
const CONTINENTS: [number, number][][] = [
  // North America
  [
    [72, -165], [70, -95], [60, -60], [48, -52], [40, -68], [30, -80],
    [22, -82], [18, -92], [25, -106], [30, -115], [40, -124], [55, -132],
    [60, -140], [68, -165],
  ],
  // Central America stub
  [[18, -92], [12, -85], [10, -78], [14, -90]],
  // South America
  [
    [10, -78], [8, -60], [5, -50], [-5, -35], [-22, -40], [-35, -55],
    [-52, -68], [-50, -73], [-35, -72], [-15, -78], [0, -80], [8, -80],
  ],
  // Greenland
  [[83, -45], [80, -18], [70, -22], [60, -45], [70, -55], [78, -58]],
  // Europe
  [
    [71, 28], [70, 40], [60, 42], [50, 40], [42, 30], [38, 22], [36, 12],
    [40, -6], [44, -10], [55, -10], [62, 5], [68, 18], [71, 28],
  ],
  // Africa
  [
    [36, -8], [36, 12], [32, 24], [20, 38], [10, 42], [-5, 42], [-18, 38],
    [-32, 24], [-34, 18], [-30, 12], [-15, 8], [5, -6], [18, -16], [28, -12],
  ],
  // Asia
  [
    [72, 40], [75, 70], [75, 110], [72, 150], [65, 170], [55, 160], [50, 142],
    [40, 140], [35, 130], [30, 122], [22, 110], [10, 105], [8, 98], [12, 95],
    [22, 88], [26, 78], [32, 70], [40, 60], [45, 50], [55, 50], [65, 55],
    [70, 60], [72, 40],
  ],
  // India stub
  [[28, 72], [22, 68], [10, 78], [22, 88], [28, 82]],
  // Indonesia / SE Asia stub
  [[5, 95], [0, 100], [-8, 115], [-5, 122], [2, 130], [5, 120], [6, 108]],
  // Australia
  [
    [-12, 130], [-12, 142], [-18, 146], [-28, 153], [-38, 146], [-35, 138],
    [-32, 128], [-22, 113], [-15, 122],
  ],
  // Japan
  [[45, 142], [42, 140], [36, 136], [33, 130], [35, 140], [40, 140]],
  // UK / Ireland
  [[58, -6], [55, -2], [50, -5], [50, 1], [55, 2], [58, -3]],
  // Madagascar
  [[-12, 49], [-15, 50], [-25, 47], [-22, 44], [-15, 46]],
];

const W = 2048;
const H = 1024;

function project(lat: number, lon: number): [number, number] {
  const x = ((lon + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return [x, y];
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  poly: [number, number][],
) {
  ctx.beginPath();
  poly.forEach(([lat, lon], i) => {
    const [x, y] = project(lat, lon);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

export function createEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 海洋：极深黑蓝径向渐变（规范 Section 3）
  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#070A10');
  ocean.addColorStop(0.5, '#0A0E16');
  ocean.addColorStop(1, '#050609');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  // 海洋微噪声
  const noiseData = ctx.getImageData(0, 0, W, H);
  const d = noiseData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n + 2));
  }
  ctx.putImageData(noiseData, 0, 0);

  // 大陆：低饱和冷灰蓝（规范 Section 3 / 8）
  ctx.fillStyle = '#1A2230';
  ctx.shadowColor = 'rgba(60,80,110,0.25)';
  ctx.shadowBlur = 14;
  CONTINENTS.forEach((poly) => drawPolygon(ctx, poly));
  ctx.shadowBlur = 0;

  // 大陆内部稍亮一层，营造起伏
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(70,90,120,0.06)';
  CONTINENTS.forEach((poly) => drawPolygon(ctx, poly));
  ctx.globalCompositeOperation = 'source-over';

  // 极细经纬线（规范 Section 8）
  ctx.strokeStyle = 'rgba(120,140,170,0.05)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const [x] = project(0, lon);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const [, y] = project(lat, 0);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // 赤道略亮
  ctx.strokeStyle = 'rgba(255,216,138,0.04)';
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// 极淡星云背景贴图（背景球用，非地球）
export function createSpaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#050609';
  ctx.fillRect(0, 0, 1024, 512);
  // 极淡星云团
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 512;
    const r = 120 + Math.random() * 180;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = Math.random() > 0.5
      ? 'rgba(80,70,110,0.05)'
      : 'rgba(60,80,110,0.04)';
    g.addColorStop(0, hue);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
