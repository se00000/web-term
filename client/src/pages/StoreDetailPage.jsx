import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { usePolling } from '../hooks.js';
import Cover from '../components/Cover.jsx';

/** 매장 상세: 커버 → 매장 정보 → 대기 현황 → (하단 고정) 인원 선택 + 웨이팅 하기 */
export default function StoreDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: store, error: loadError, loading } = usePolling(() => api(`/stores/${id}`), 10000, [id]);
  const [partySize, setPartySize] = useState(2);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function register() {
    if (busy) return; // 화면에서의 연타 방지 (서버도 별도로 중복을 막습니다)
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${id}/waitings`, { method: 'POST', body: { partySize } });
      navigate('/me');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  if (loading && !store) return <div className="detail-skeleton"><div className="cover cover-hero" /></div>;
  if (loadError) {
    return <div className="empty"><span>🍽️</span><p>{loadError.message}</p><Link to="/">홈으로</Link></div>;
  }

  const size = Math.min(partySize, store.maxParty);
  const regionText = `${store.sido}${store.district ? ` ${store.district}` : ''}`;

  return (
    <div className="detail">
      <Cover category={store.category} size="hero" closed={!store.isAccepting}>
        <button type="button" className="hero-back" onClick={goBack} aria-label="뒤로">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      </Cover>

      <section className="detail-head">
        <p className="detail-breadcrumb">
          <Link to={`/category?category=${encodeURIComponent(store.category)}`}>{store.category}</Link>
          <span aria-hidden="true">·</span>
          <Link to={`/region?sido=${encodeURIComponent(store.sido)}${store.district ? `&district=${encodeURIComponent(store.district)}` : ''}`}>{regionText}</Link>
        </p>
        <h1 className="detail-name">{store.name}</h1>
        <p className="detail-address">{store.address}</p>
      </section>

      {/* PC: 오른쪽에 따라다니는 웨이팅 패널 / 모바일: 정보 위 현황판 + 하단 고정 바 */}
      <aside className="detail-aside">
      <section className="wait-board">
        <div className="wait-board-main">
          <span className="wait-board-label">현재 대기</span>
          <span className="wait-board-num"><b>{store.waitingCount}</b>팀</span>
        </div>
        <div className="wait-board-side">
          <span className={`status-dot ${store.isAccepting ? 'on' : ''}`}>{store.isAccepting ? '웨이팅 접수 중' : '접수 마감'}</span>
          <span className="muted">지금 등록하면 <b>{store.waitingCount + 1}번째</b></span>
        </div>
      </section>


      <div className="cta-bar">
        <div className="cta-inner">
          {error && (
            <p className="cta-error">
              {error.message}
              {error.code === 'ALREADY_WAITING' && <> <Link to="/me">내 웨이팅 보기</Link></>}
              {error.code === 'PENALTY_ACTIVE' && error.details?.until &&
                <> (해제: {new Date(error.details.until).toLocaleString('ko-KR')})</>}
            </p>
          )}

          {!user && (
            <Link to="/login" state={{ from: location.pathname }} className="cta-button">로그인하고 웨이팅하기</Link>
          )}
          {user?.role === 'OWNER' && (
            <p className="cta-note">사장님 계정은 웨이팅을 등록할 수 없어요. 손님 계정으로 로그인해주세요.</p>
          )}
          {user?.role === 'CUSTOMER' && !store.isAccepting && (
            <button type="button" className="cta-button" disabled>지금은 웨이팅을 받지 않아요</button>
          )}
          {user?.role === 'CUSTOMER' && store.isAccepting && (
            <div className="cta-row">
              <div className="stepper" role="group" aria-label="인원">
                <button type="button" onClick={() => setPartySize(Math.max(1, size - 1))} disabled={size <= 1} aria-label="인원 줄이기">−</button>
                <span aria-live="polite"><b>{size}</b>명</span>
                <button type="button" onClick={() => setPartySize(Math.min(store.maxParty, size + 1))} disabled={size >= store.maxParty} aria-label="인원 늘리기">+</button>
              </div>
              <button type="button" className="cta-button" onClick={register} disabled={busy}>
                {busy ? '등록 중…' : '웨이팅 하기'}
              </button>
            </div>
          )}
        </div>
      </div>
      </aside>

      <section className="info-list">
        <h2 className="section-title">매장 정보</h2>
        <dl>
          <div><dt>주소</dt><dd>{store.address}</dd></div>
          <div><dt>지역</dt><dd>{regionText}</dd></div>
          <div><dt>음식 종류</dt><dd>{store.category}</dd></div>
          <div><dt>최대 인원</dt><dd>{store.maxParty}명까지 웨이팅 가능</dd></div>
          <div><dt>호출 안내</dt><dd>호출 후 10분 안에 입장하지 않으면 노쇼로 처리될 수 있어요.</dd></div>
        </dl>
      </section>
    </div>
  );
}
