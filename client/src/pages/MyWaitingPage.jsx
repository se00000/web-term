import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime, STATUS_LABEL } from '../api.js';
import { useAuth } from '../auth.jsx';
import { usePolling } from '../hooks.js';
import { categoryIcon, coverStyle } from '../catalogIcons.js';

const ACTIVE = ['WAITING', 'CALLED'];

export default function MyWaitingPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = usePolling(() => api('/me/waiting'), 5000);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const w = data?.waiting;

  async function cancel() {
    if (!window.confirm('웨이팅을 취소할까요? 취소하면 순번이 사라집니다.')) return;
    setBusy(true);
    setActionError('');
    try {
      await api(`/waitings/${w.id}/cancel`, { method: 'POST', body: {} });
      await reload();
    } catch (err) {
      setActionError(err.message);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <p className="muted center">불러오는 중…</p>;
  if (error) return <p className="error">{error.message}</p>;

  return (
    <div className="page">
      <h1 className="page-title">내 웨이팅</h1>
      {user.penaltyUntil && new Date(user.penaltyUntil) > new Date() && (
        <div className="alert">노쇼 누적으로 {new Date(user.penaltyUntil).toLocaleString('ko-KR')}까지 웨이팅을 등록할 수 없어요.</div>
      )}

      {!w && (
        <div className="empty">
          <span>🎫</span>
          <p>아직 웨이팅 내역이 없어요</p>
          <Link to="/" className="cta-button inline">매장 둘러보기</Link>
        </div>
      )}

      {w && (
        <div className="ticket-layout">
        <article className={`ticket status-${w.status.toLowerCase()}`}>
          <Link to={`/stores/${w.storeId}`} className="ticket-top" style={coverStyle(w.storeCategory)}>
            <span className="ticket-top-icon" aria-hidden="true">{categoryIcon(w.storeCategory)}</span>
            <span className="ticket-store">{w.storeName}</span>
            <span className="ticket-date">{w.serviceDate}</span>
          </Link>

          <div className="ticket-body">
            <span className="ticket-status">{STATUS_LABEL[w.status]}</span>
            <p className="ticket-label">내 번호</p>
            <div className="ticket-no">{w.ticketNo}</div>

            {w.status === 'WAITING' && (
              <>
                <QueueDots ahead={w.aheadCount} />
                <p className="ahead">
                  {w.aheadCount === 0 ? <>다음 차례예요! <br />매장 근처에서 기다려주세요</> : <>내 앞에 <b>{w.aheadCount}팀</b> 남았어요</>}
                </p>
              </>
            )}
            {w.status === 'CALLED' && (
              <p className="ahead called">
                <b>지금 매장으로 와주세요!</b><br />
                <span>{formatTime(w.calledAt)} 호출 · 10분 안에 입장하지 않으면 노쇼 처리될 수 있어요</span>
              </p>
            )}
            {w.status === 'SEATED' && <p className="ahead">입장 완료! 맛있게 드세요 😋</p>}
          </div>

          <div className="ticket-cut" aria-hidden="true" />

          <dl className="ticket-facts">
            <div><dt>인원</dt><dd>{w.partySize}명</dd></div>
            <div><dt>등록</dt><dd>{formatTime(w.createdAt)}</dd></div>
            <div><dt>{w.finishedAt ? '종료' : '상태'}</dt><dd>{w.finishedAt ? formatTime(w.finishedAt) : STATUS_LABEL[w.status]}</dd></div>
          </dl>

          <div className="ticket-actions">
            {ACTIVE.includes(w.status)
              ? <button type="button" className="text-danger" onClick={cancel} disabled={busy}>{busy ? '취소 중…' : '웨이팅 취소하기'}</button>
              : <Link to="/" className="cta-button">다른 매장 둘러보기</Link>}
            {actionError && <p className="error">{actionError}</p>}
            <p className="refresh-note">5초마다 자동으로 새로고침돼요</p>
          </div>
        </article>
        <aside className="guide">
          <h2>이용 안내</h2>
          <ol>
            <li><b>순서대로 호출돼요</b><span>매장에서 앞 순번부터 호출합니다. 이 화면은 5초마다 새로고침돼요.</span></li>
            <li><b>호출되면 10분 안에 입장</b><span>시간 안에 오지 않으면 노쇼로 처리되고 다음 순번이 호출돼요.</span></li>
            <li><b>노쇼가 쌓이면 이용 제한</b><span>최근 30일 노쇼 2회면 7일 동안 웨이팅을 등록할 수 없어요.</span></li>
            <li><b>한 번에 한 곳만</b><span>다른 매장에 줄 서려면 지금 웨이팅을 먼저 취소해주세요.</span></li>
          </ol>
          <Link to={`/stores/${w.storeId}`} className="guide-link">매장 정보 보기</Link>
        </aside>
        </div>
      )}
    </div>
  );
}

/** 내 앞 대기 팀을 점으로 표시 (최대 8개, 넘으면 +N) */
function QueueDots({ ahead }) {
  const shown = Math.min(ahead, 8);
  return (
    <div className="queue-dots" aria-hidden="true">
      <span className="door">입구</span>
      {Array.from({ length: shown }, (_, i) => <i key={i} />)}
      {ahead > shown && <span className="more">+{ahead - shown}</span>}
      <i className="me">나</i>
    </div>
  );
}
