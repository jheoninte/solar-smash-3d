export const DEFAULT_SKIN = 'earth';

export const SHOP_ITEMS = [
  {
    id: 'earth', name: '푸른 지구', price: 0,
    description: '푸른 바다와 초록빛 대륙. 기본으로 제공되는 외형입니다.',
    swatches: ['#125b91', '#467647', '#d3e5e6'], palette: {}
  },
  {
    id: 'obsidian', name: '흑요석', price: 250,
    description: '검은 바다와 청록빛 광물이 어우러진 어두운 행성.',
    swatches: ['#111827', '#248e94', '#92bcb7'],
    palette: { ocean: 0x111827, coast: 0x246b77, land: 0x248e94, peak: 0x526574, ice: 0x92bcb7, rock: 0x315e68 }
  },
  {
    id: 'ember', name: '잿불 행성', price: 450,
    description: '붉은 바다와 구릿빛 대륙. 타격 흔적은 그대로 유지됩니다.',
    swatches: ['#761e25', '#d36b36', '#f9ce8a'],
    palette: { ocean: 0x761e25, coast: 0xb1432c, land: 0xd36b36, peak: 0x964334, ice: 0xf9ce8a, rock: 0xd36b36 }
  },
  {
    id: 'aurora', name: '오로라', price: 650,
    description: '보랏빛 바다와 민트빛 대륙이 빛나는 우주의 색.',
    swatches: ['#54248c', '#3abfa4', '#b3f1e5'],
    palette: { ocean: 0x54248c, coast: 0x5a77ba, land: 0x3abfa4, peak: 0x9c6fcb, ice: 0xb3f1e5, rock: 0x9461c7 }
  }
];

export function getSkin(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}
