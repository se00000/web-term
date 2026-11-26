import { Link } from 'react-router-dom';
import { categoryIcon, coverStyle } from '../catalogIcons.js';

/**
 * 동그란 음식 종류 아이콘 줄.
 * linkTo가 있으면 링크(홈), onSelect가 있으면 버튼(음식 종류 화면)으로 동작합니다.
 */
export default function CategoryRow({ categories, selected, onSelect, linkTo, wrap = false }) {
  return (
    <ul className={`category-row ${wrap ? 'wrap' : ''}`}>
      {categories.map(c => {
        const inner = (
          <>
            <span className="category-circle" style={coverStyle(c.name)}>{categoryIcon(c.name)}</span>
            <span className="category-label">{c.name}</span>
          </>
        );
        const cls = `category-item ${c.name === selected ? 'active' : ''} ${c.count === 0 ? 'is-empty' : ''}`;
        return (
          <li key={c.name}>
            {linkTo
              ? <Link to={linkTo(c.name)} className={cls}>{inner}</Link>
              : <button type="button" className={cls} onClick={() => onSelect(c.name)} aria-pressed={c.name === selected}>{inner}</button>}
          </li>
        );
      })}
    </ul>
  );
}
