import type { AppState, HoverTarget } from '../types';

interface UICallbacks {
  onEnter?: () => void;
  onExit?: () => void;
}

export class UI {
  private readonly el: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly cursor: HTMLElement;
  private readonly cursorDot: HTMLElement;
  private readonly cursorRing: HTMLElement;
  private readonly cursorLabel: HTMLElement;
  private loading!: HTMLElement;
  private nav!: HTMLElement;
  private hero!: HTMLElement;
  private immersiveChrome!: HTMLElement;
  private readonly cb: UICallbacks;

  private pointerX = 0;
  private pointerY = 0;
  private finePointer = false;
  private currentHover: HoverTarget = { kind: 'none' };

  constructor(root: HTMLElement, cb: UICallbacks = {}) {
    this.cb = cb;
    this.el = root;
    // 注意：不要 innerHTML='' —— #globe-container 已由 main.ts 提前挂到 #app，
    // 清空会把地球容器一并移除，导致 canvas 脱离 DOM。

    this.buildLoading();
    this.buildNav();
    this.buildHero();
    this.buildImmersiveChrome();
    this.tooltip = this.buildTooltip();
    this.cursor = this.buildCursor();
    this.cursorDot = this.cursor.querySelector('.dot')!;
    this.cursorRing = this.cursor.querySelector('.ring')!;
    this.cursorLabel = this.cursor.querySelector('.label')!;
    void this.cursorDot;
    void this.cursorRing;

    this.finePointer = window.matchMedia('(pointer: fine)').matches;
    if (this.finePointer) document.body.classList.add('has-custom-cursor');

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
  }

  // ---------- DOM 构建 ----------
  private buildLoading() {
    const div = document.createElement('div');
    div.className = 'loading';
    div.innerHTML = `
      <div class="loading-star"></div>
      <div class="loading-brand">ANIME EARTH</div>
    `;
    this.el.appendChild(div);
    this.loading = div;
  }

  private buildNav() {
    const nav = document.createElement('header');
    nav.className = 'nav';
    nav.innerHTML = `
      <div class="nav-left">
        <div class="nav-logo"></div>
        <div class="nav-brand">ANIME EARTH</div>
      </div>
      <nav class="nav-center">
        <a class="nav-link" data-action="enter">Explore</a>
        <a class="nav-link" data-action="enter">World</a>
        <a class="nav-link is-disabled" title="Phase 1+">Genres</a>
        <a class="nav-link is-disabled" title="Phase 1+">Collections</a>
        <a class="nav-link is-disabled" title="Phase 1+">Random Journey</a>
      </nav>
      <div class="nav-right">
        <span class="nav-icon is-disabled" title="Phase 1+">SEARCH</span>
        <span class="nav-icon">EN / 中</span>
      </div>
    `;
    this.el.appendChild(nav);
    this.nav = nav;
    nav.querySelectorAll('[data-action="enter"]').forEach((a) => {
      a.addEventListener('click', () => this.cb.onEnter?.());
    });
  }

  private buildHero() {
    const hero = document.createElement('section');
    hero.className = 'hero';
    hero.innerHTML = `
      <div class="hero-eyebrow">GLOBAL ANIME CULTURE</div>
      <h1 class="hero-title">沿着<span class="accent">星光</span><br/>探索世界动漫</h1>
      <div class="hero-sub">EXPLORE STORIES ACROSS THE WORLD</div>
      <p class="hero-desc">每一颗星，都是一个值得发现的故事。</p>
      <button class="hero-cta" type="button">
        <span>Enter the Planet</span>
        <span class="arrow">→</span>
      </button>
    `;
    this.el.appendChild(hero);
    this.hero = hero;
    hero.querySelector('.hero-cta')!.addEventListener('click', () => {
      this.cb.onEnter?.();
    });
  }

  private buildImmersiveChrome() {
    const chrome = document.createElement('div');
    chrome.className = 'immersive-chrome';
    chrome.innerHTML = `
      <div class="immersive-back clickable"><span>←</span><span>WORLD</span></div>
      <div class="immersive-search clickable">SEARCH</div>
      <div class="immersive-hint">
        <span>Drag to Explore</span><span class="dot">·</span><span>Click a Country</span>
      </div>
    `;
    this.el.appendChild(chrome);
    this.immersiveChrome = chrome;
    chrome.querySelector('.immersive-back')!.addEventListener('click', () => {
      this.cb.onExit?.();
    });
  }

  private buildTooltip(): HTMLElement {
    const t = document.createElement('div');
    t.className = 'tooltip';
    this.el.appendChild(t);
    return t;
  }

  private buildCursor(): HTMLElement {
    const c = document.createElement('div');
    c.className = 'cursor';
    c.innerHTML = `
      <div class="dot"></div>
      <div class="ring"></div>
      <div class="label">EXPLORE</div>
    `;
    this.el.appendChild(c);
    return c;
  }

  // ---------- 状态 ----------
  setState(s: AppState) {
    this.loading.classList.toggle('is-done', s !== 'LOADING');
    const immersive = s === 'IMMERSIVE_GLOBE';
    this.nav.classList.toggle('is-immersive', immersive);
    this.hero.classList.toggle('is-hidden', immersive || s === 'LOADING');
    this.immersiveChrome.classList.toggle('is-visible', immersive);
    if (s === 'LOADING') this.hero.classList.add('is-hidden');
  }

  // ---------- Hover ----------
  setHover(h: HoverTarget) {
    this.currentHover = h;
    // 光标
    this.cursor.classList.remove('is-country', 'is-star');
    if (h.kind === 'country') {
      this.cursor.classList.add('is-country');
      this.cursorLabel.textContent = 'EXPLORE';
    } else if (h.kind === 'star') {
      this.cursor.classList.add('is-star');
      this.cursorLabel.textContent = 'DISCOVER';
    } else {
      this.cursorLabel.textContent = '';
    }

    // tooltip
    if (h.kind === 'country') {
      this.renderCountryTooltip(h.country);
      this.showTooltip();
    } else if (h.kind === 'star') {
      this.renderStarTooltip(h.work);
      this.showTooltip();
    } else {
      this.hideTooltip();
    }
  }

  private renderCountryTooltip(c: import('../types').Country) {
    this.tooltip.className = 'tooltip country is-visible';
    this.tooltip.innerHTML = `
      <div class="t-name">${c.englishName.toUpperCase()}</div>
      <div class="t-count">${c.storyCount} STORIES · ${c.cultureTags.join(' · ')}</div>
      <div class="t-action">EXPLORE →</div>
    `;
  }

  private renderStarTooltip(w: import('../types').Work) {
    this.tooltip.className = 'tooltip is-visible';
    this.tooltip.innerHTML = `
      <div class="t-original">${w.originalTitle}</div>
      <div class="t-title">${w.title}</div>
      <div class="t-meta">${w.type} · ${w.year}</div>
      <div class="t-genres">${w.genres.join(' · ')}</div>
      <div class="t-action">VIEW STORY →</div>
    `;
  }

  private showTooltip() {
    this.positionTooltip();
    this.tooltip.classList.add('is-visible');
  }
  private hideTooltip() {
    this.tooltip.classList.remove('is-visible');
  }

  private positionTooltip() {
    const pad = 18;
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    let x = this.pointerX + pad;
    let y = this.pointerY + pad;
    if (x + tw > window.innerWidth - 12) x = this.pointerX - tw - pad;
    if (y + th > window.innerHeight - 12) y = this.pointerY - th - pad;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  // ---------- 光标 ----------
  private onPointerMove = (e: PointerEvent) => {
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
    if (this.finePointer) {
      this.cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    }
    if (this.currentHover.kind !== 'none') this.positionTooltip();
  };

  finishLoading() {
    this.loading.classList.add('is-done');
  }
}
