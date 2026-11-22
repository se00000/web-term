import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';

export default function StoreListPage() {
  const { data: stores, error, loading } = usePolling(() => api('/stores'), 10000);

  return (
    <section>
      <h1>매장</h1>
      <p className="muted">줄 서지 말고 원격으로 웨이팅하세요. 대기 팀 수는 10초마다 갱신됩니다.</p>
      {loading && !stores && <p className="muted">불러오는 중…</p>}
      {error && <p className="error">{error.message}</p>}
      {stores?.length === 0 && <div className="card muted">등록된 매장이 없습니다.</div>}
      <ul className="store-list">
        {stores?.map(s => (
          <li key={s.id}>
            <Link to={`/stores/${s.id}`} className="card store-card">
              <div>
                <strong>{s.name}</strong>
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
    </section>
  );
}
