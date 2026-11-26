// 음식 종류별 아이콘과 커버 색 (화면 표시용). 종류 목록 자체는 서버 /api/catalog 가 기준입니다.
// 매장 사진이 없으므로 음식 종류마다 정해진 그라데이션 + 아이콘을 커버 이미지 대신 씁니다.
const THEMES = {
  한식: { icon: '🍚', from: '#ffd8a8', to: '#ff922b' },
  중식: { icon: '🥟', from: '#ffc9c9', to: '#f03e3e' },
  일식: { icon: '🍣', from: '#d0ebff', to: '#4dabf7' },
  양식: { icon: '🍝', from: '#ffec99', to: '#fab005' },
  분식: { icon: '🍢', from: '#fcc2d7', to: '#f06595' },
  '고기·구이': { icon: '🥩', from: '#ffc9c9', to: '#c92a2a' },
  해산물: { icon: '🦐', from: '#c5f6fa', to: '#15aabf' },
  아시안: { icon: '🍜', from: '#d3f9d8', to: '#40c057' },
  패스트푸드: { icon: '🍔', from: '#fff3bf', to: '#f59f00' },
  '카페·디저트': { icon: '🍰', from: '#f3d9fa', to: '#be4bdb' },
  술집: { icon: '🍺', from: '#e5dbff', to: '#7950f2' },
  기타: { icon: '🍽️', from: '#e9ecef', to: '#868e96' },
};
const DEFAULT = THEMES.기타;

export const categoryTheme = name => THEMES[name] ?? DEFAULT;
export const categoryIcon = name => categoryTheme(name).icon;
export const coverStyle = name => {
  const t = categoryTheme(name);
  return { backgroundImage: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)` };
};
