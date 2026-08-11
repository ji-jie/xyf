import type { Country } from '../types';

// MVP 极小样本（规范 Section 51）—— 3 国，Gate A 未通过前仅用占位元数据
export const COUNTRIES: Country[] = [
  {
    id: 'japan',
    name: '日本',
    englishName: 'Japan',
    storyCount: 126,
    cultureIntro:
      '从热血少年、奇幻与科幻，到细腻日常与作者动画，日本拥有极其丰富的动画与漫画文化。',
    cultureTags: ['Anime', 'Manga', 'Film'],
    latitude: 36.2048,
    longitude: 138.2529,
  },
  {
    id: 'usa',
    name: '美国',
    englishName: 'United States',
    storyCount: 41,
    cultureIntro:
      '从黄金时代漫画、电视动画到当代视觉实验，美国以多元叙事与工业体系塑造全球流行文化。',
    cultureTags: ['Animation', 'Comics', 'Film'],
    latitude: 39.8283,
    longitude: -98.5795,
  },
  {
    id: 'france',
    name: '法国',
    englishName: 'France',
    storyCount: 37,
    cultureIntro:
      ' bande dessinée 传统与作者动画并存，法国以艺术性、文学性与文化自觉在欧洲独树一帜。',
    cultureTags: ['BD', 'Animation', 'Film'],
    latitude: 46.2276,
    longitude: 2.2137,
  },
];

export function getCountry(id: string): Country | undefined {
  return COUNTRIES.find((c) => c.id === id);
}
