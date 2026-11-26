import { Link } from 'react-router-dom';
import Cover from './Cover.jsx';

/** 대기 상태 한 줄: "바로 입장" / "웨이팅 N팀" / "접수 마감" */
export function WaitLabel({ store }) {
  if (!store.isAccepting) return <span className="wait wait-closed">접수 마감</span>;
  if (store.waitingCount === 0) return <span className="wait wait-now">바로 입장</span>;
  return <span className="wait">웨이팅 <b>{store.waitingCount}팀</b></span>;
}

const region = s => `${s.sido}${s.district ? ` ${s.district}` : ''}`;

/** 세로 목록 (썸네일 + 정보) — 전체 / 지역 / 음식 종류 화면 공통 */
export default function StoreCards({ stores, loading, error, emptyText = '조건에 맞는 매장이 없습니다.' }) {
  if (error) return <p className="error">{error.message}</p>;
  if (loading && !stores) return <SkeletonRows />;
  if (!stores?.length) return <div className="empty"><span>🍽️</span><p>{emptyText}</p></div>;

  return (
    <ul className="store-rows">
      {stores.map(s => (
        <li key={s.id}>
          <Link to={`/stores/${s.id}`} className="store-row">
            <Cover category={s.category} size="thumb" closed={!s.isAccepting} />
            <div className="store-row-body">
              <strong className="store-name">{s.name}</strong>
              <p className="store-sub">{s.category} · {region(s)}</p>
              <WaitLabel store={s} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 가로로 넘기는 큰 카드 (홈 섹션용) */
export function StoreCarousel({ stores }) {
  return (
    <ul className="carousel">
      {stores.map(s => (
        <li key={s.id}>
          <Link to={`/stores/${s.id}`} className="carousel-card">
            <Cover category={s.category} size="card" closed={!s.isAccepting} />
            <strong className="store-name">{s.name}</strong>
            <p className="store-sub">{s.category} · {region(s)}</p>
            <WaitLabel store={s} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SkeletonRows() {
  return (
    <ul className="store-rows" aria-label="불러오는 중">
      {[0, 1, 2].map(i => (
        <li key={i} className="store-row skeleton">
          <div className="cover cover-thumb" />
          <div className="store-row-body"><i /><i /><i /></div>
        </li>
      ))}
    </ul>
  );
}
