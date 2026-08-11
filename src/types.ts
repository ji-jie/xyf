// ANIME EARTH — 类型定义（对应规范 Section 47 / 48）

export type WorkType =
  | 'Anime'
  | 'Manga'
  | 'Comics'
  | 'Animated Film'
  | 'Independent Animation';

// 星光等级（规范 Section 10 / 14）
export type StarTier = 'S' | 'A' | 'B' | 'C';

export interface Work {
  id: string;
  title: string;            // 英文 / 通用标题
  originalTitle: string;    // 原文标题
  country: string;          // 国家 id（如 'japan'）
  city: string;
  type: WorkType;
  genres: string[];
  year: number;
  highlight: string;        // 一句亮点（每部仅一个）
  popularityLevel: StarTier;
  globalPopularity: number; // 0–100
  culturalInfluence: number;
  currentHeat: number;
  latitude: number;
  longitude: number;
}

export interface Country {
  id: string;
  name: string;          // 中文
  englishName: string;   // 英文
  storyCount: number;
  cultureIntro: string;  // 动漫文化简介
  cultureTags: string[]; // 如 ['Anime', 'Manga', 'Film']
  latitude: number;
  longitude: number;
}

// 星光视觉基线（规范 Section 10）—— 不得由 AI 自由发挥
export interface StarVisual {
  size: number;       // 视觉直径 px（屏幕空间基准）
  opacity: number;    // 默认透明度
  glow: number;       // 光晕半径 px
  lod: number;        // LOD 等级，0 = 始终可见
}

export const STAR_VISUALS: Record<StarTier, StarVisual> = {
  S: { size: 6.5, opacity: 1.0, glow: 14, lod: 0 },
  A: { size: 4.5, opacity: 0.9, glow: 9, lod: 1 },
  B: { size: 3.5, opacity: 0.76, glow: 6, lod: 2 },
  C: { size: 2.5, opacity: 0.58, glow: 4, lod: 3 },
};

// 类型色相仅极轻微偏移（规范 Section 9）—— 整体仍属同一套暖白 / 淡金星图
export const GENRE_HUE: Record<string, [number, number, number]> = {
  Action:      [1.00, 0.93, 0.74], // 暖金
  Fantasy:     [0.96, 0.94, 1.00], // 暖白偏浅紫
  Romance:     [1.00, 0.88, 0.90], // 浅粉金
  'Sci-Fi':    [0.86, 0.93, 1.00], // 冰蓝白
  Cyberpunk:   [0.80, 0.90, 1.00], // 冰蓝白（偏冷）
  Mystery:     [0.92, 0.93, 0.95], // 冷白灰
  'Dark Fantasy': [0.95, 0.90, 0.78],
  Supernatural: [0.97, 0.93, 0.86],
  Adventure:   [1.00, 0.92, 0.76],
  Comedy:      [1.00, 0.95, 0.82],
  Drama:       [0.96, 0.90, 0.82],
  Horror:      [0.86, 0.86, 0.84], // 冷灰金
  Historical:  [0.98, 0.90, 0.74],
  Thriller:    [0.92, 0.91, 0.88],
  'Slice of Life': [1.00, 0.97, 0.90], // 奶白
  Sports:      [1.00, 0.93, 0.80],
  'Magical Girl': [1.00, 0.90, 0.92],
  default:     [1.00, 0.96, 0.84], // 暖白淡金（基线）
};

export type AppState = 'LOADING' | 'GLOBAL_VIEW' | 'IMMERSIVE_GLOBE';

export type HoverTarget =
  | { kind: 'none' }
  | { kind: 'globe' }
  | { kind: 'country'; country: Country }
  | { kind: 'star'; work: Work };
