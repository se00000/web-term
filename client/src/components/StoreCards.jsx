import { Link } from 'react-router-dom';
import { categoryIcon } from '../catalogIcons.js';

/** 매장 카드 목록 (전체 / 지역 / 음식 종류 화면 공통) */
export default function StoreCards({ stores, loading, error, emptyText = '조건에 맞는 매장이 없습니다.' }) {
  if (error) return <p className="error">{error.message}</p>;
  if (loading && !stores) return <p className="muted">불러오는 중…</p>;
  if (!stores?.length) return <div className="card muted">{emptyText}</div>;

  return (
    <ul className="store-list">
      {stores.map(s => (
        <li key={s.id}>
          <Link to={`/stores/${s.id}`} className="card store-card">
            <div className="store-icon" aria-hidden="true">{categoryIcon(s.category)}</div>
            <div className="store-main">
              <strong>{s.name}</strong>
              <p className="tags">
                <span className="tag">{s.category}</span>
                <span className="tag">{s.sido}{s.district && ` ${s.district}`}</span>
              </p>
              <p className="muted small">{s.address}</p>
            </div>
            <div className="store-meta">
              {s.isAccepting
                ? <span className="badge ok">접수 중</span>
                : <span className="badge off">접수 마감</span>}
              <span className="count"><b>{s.waitingCount}</b>팀 대기</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
