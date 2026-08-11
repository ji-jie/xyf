import './styles.css';
import { GlobeScene } from './three/GlobeScene';
import { UI } from './ui/UI';
import type { AppState, HoverTarget } from './types';

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

const container = document.createElement('div');
container.id = 'globe-container';
app.appendChild(container);

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function showFallback(host: HTMLElement) {
  const div = document.createElement('div');
  div.className = 'fallback';
  div.innerHTML = `
    <div class="fallback-star"></div>
    <div class="fallback-title">ANIME EARTH</div>
    <div class="fallback-desc">3D 地球需要 WebGL 支持。请在支持 WebGL 的浏览器中打开以获得完整体验。</div>
  `;
  host.appendChild(div);
}

let scene: GlobeScene | null = null;
const ui = new UI(app, {
  onEnter: () => scene?.enterImmersive(),
  onExit: () => scene?.exitImmersive(),
});

if (!webglAvailable()) {
  ui.setState('GLOBAL_VIEW');
  ui.finishLoading();
  showFallback(container);
} else {
  try {
    scene = new GlobeScene(container, {
      onStateChange: (s: AppState) => ui.setState(s),
      onHover: (h: HoverTarget) => ui.setHover(h),
    });
    ui.setState('LOADING');
    scene.start();
    runLoadingSequence(scene, ui);
  } catch (err) {
    console.error('[Anime Earth] WebGL 初始化失败：', err);
    scene = null;
    ui.setState('GLOBAL_VIEW');
    ui.finishLoading();
    showFallback(container);
  }
}

// 加载序列（规范 Section 42）：星光亮起 → ANIME EARTH → 地球显现 → Global View
function runLoadingSequence(scene: GlobeScene, ui: UI) {
  const REVEAL_DELAY = 700;
  const REVEAL_DURATION = 1100;
  let revealStart = 0;
  let loadingFaded = false;

  function revealLoop(t: number) {
    if (!revealStart) revealStart = t;
    const elapsed = t - revealStart;
    if (elapsed < REVEAL_DELAY) {
      scene.setReveal(0);
      requestAnimationFrame(revealLoop);
      return;
    }
    const p = Math.min(1, (elapsed - REVEAL_DELAY) / REVEAL_DURATION);
    const eased = 1 - Math.pow(1 - p, 3);
    scene.setReveal(eased);
    // 地球显现到约 40% 时，遮罩开始淡出，呈现“从黑暗中显现”的效果
    if (eased >= 0.4 && !loadingFaded) {
      loadingFaded = true;
      ui.finishLoading();
    }
    if (p < 1) {
      requestAnimationFrame(revealLoop);
    } else {
      ui.setState('GLOBAL_VIEW');
    }
  }
  requestAnimationFrame(revealLoop);
}

// 暴露调试句柄（非生产）
(window as any).__animeEarth = { get scene() { return scene; }, ui };
