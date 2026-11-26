import { categoryIcon, coverStyle } from '../catalogIcons.js';

/** 매장 커버 (사진 대신 음식 종류별 그라데이션 + 아이콘). size: 'thumb' | 'card' | 'hero' */
export default function Cover({ category, size = 'thumb', closed = false, children }) {
  return (
    <div className={`cover cover-${size} ${closed ? 'is-closed' : ''}`} style={coverStyle(category)} aria-hidden={!children}>
      <span className="cover-icon">{categoryIcon(category)}</span>
      {closed && <span className="cover-closed">접수 마감</span>}
      {children}
    </div>
  );
}
