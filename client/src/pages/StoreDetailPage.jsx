import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { usePolling } from '../hooks.js';

export default function StoreDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: store, error: loadError, loading } = usePolling(() => api(`/stores/${id}`), 10000, [id]);
  const [partySize, setPartySize] = useState(2);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function register(e) {
    e.preventDefault();
    if (busy) return; // 화면에서의 연타 방지 (서버도 별도로 중복을 막습니다)
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${id}/waitings`, { method: 'POST', body: { partySize: Number(partySize) } });
      navigate('/me');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !store) return <p className="muted">불러오는 중…</p>;
  if (loadError) return <div className="card"><p className="error">{loadError.message}</p><Link to="/">매장 목록으로</Link></div>;

  return (
    <section>
      <Link to="/" className="back">← 매장 목록</Link>
      <div className="card">
        <h1>{store.name}</h1>
        <p className="muted">{store.address}</p>
        <div className="stat-row">
          <div className="stat"><span>현재 대기</span><b>{store.waitingCount}팀</b></div>
          <div className="stat"><span>최대 인원</span><b>{store.maxParty}명</b></div>
          <div className="stat"><span>상태</span><b>{store.isAccepting ? '접수 중' : '접수 마감'}</b></div>
        </div>
      </div>

      <div className="card">
        <h2>웨이팅 등록</h2>
        {!user && <p>웨이팅하려면 <Link to="/login" state={{ from: `/stores/${id}` }}>로그인</Link>해주세요.</p>}
        {user?.role === 'STAFF' && <p className="muted">매장 직원 계정은 웨이팅을 등록할 수 없습니다.</p>}
        {user?.role === 'CUSTOMER' && !store.isAccepting && <p className="muted">지금은 웨이팅을 받지 않습니다.</p>}
        {user?.role === 'CUSTOMER' && store.isAccepting && (
          <form onSubmit={register} className="inline-form">
            <label>인원
              <select value={partySize} onChange={e => setPartySize(e.target.value)}>
                {Array.from({ length: store.maxParty }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}명</option>)}
              </select>
            </label>
            <button className="primary" disabled={busy}>{busy ? '등록 중…' : `${store.waitingCount + 1}번째로 줄서기`}</button>
          </form>
        )}
        {error && (
          <p className="error">
            {error.message}
            {error.code === 'ALREADY_WAITING' && <> <Link to="/me">내 웨이팅 보기</Link></>}
            {error.code === 'PENALTY_ACTIVE' && error.details?.until &&
              <> (해제: {new Date(error.details.until).toLocaleString('ko-KR')})</>}
          </p>
        )}
      </div>
    </section>
  );
}
