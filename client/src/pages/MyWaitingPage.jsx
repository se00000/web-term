import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime, STATUS_LABEL } from '../api.js';
import { useAuth } from '../auth.jsx';
import { usePolling } from '../hooks.js';

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

  if (loading && !data) return <p className="muted">불러오는 중…</p>;
  if (error) return <p className="error">{error.message}</p>;

  return (
    <section>
      <h1>내 웨이팅</h1>
      {user.penaltyUntil && new Date(user.penaltyUntil) > new Date() && (
        <div className="alert">노쇼 누적으로 {new Date(user.penaltyUntil).toLocaleString('ko-KR')}까지 웨이팅을 등록할 수 없습니다.</div>
      )}

      {!w && <div className="card">아직 웨이팅 기록이 없습니다. <Link to="/">매장 둘러보기</Link></div>}

      {w && (
        <div className={`card ticket status-${w.status.toLowerCase()}`}>
          <p className="muted">{w.storeName} · {w.serviceDate}</p>
          <div className="ticket-no">{w.ticketNo}<small>번</small></div>
          <p className="ticket-status">{STATUS_LABEL[w.status]}</p>

          {w.status === 'WAITING' && (
            <p className="ahead">{w.aheadCount === 0 ? '다음 차례입니다! 매장 근처에서 기다려주세요.' : <>내 앞에 <b>{w.aheadCount}팀</b> 남았어요</>}</p>
          )}
          {w.status === 'CALLED' && (
            <p className="ahead called">지금 매장으로 와주세요! ({formatTime(w.calledAt)} 호출 · 10분 안에 도착하지 않으면 노쇼 처리될 수 있어요)</p>
          )}

          <dl className="facts">
            <div><dt>인원</dt><dd>{w.partySize}명</dd></div>
            <div><dt>등록</dt><dd>{formatTime(w.createdAt)}</dd></div>
            {w.finishedAt && <div><dt>종료</dt><dd>{formatTime(w.finishedAt)}</dd></div>}
          </dl>

          {ACTIVE.includes(w.status) && (
            <button className="danger" onClick={cancel} disabled={busy}>{busy ? '취소 중…' : '웨이팅 취소'}</button>
          )}
          {!ACTIVE.includes(w.status) && <Link to="/" className="button">다른 매장 웨이팅하기</Link>}
          {actionError && <p className="error">{actionError}</p>}
          <p className="muted small">5초마다 자동으로 갱신됩니다.</p>
        </div>
      )}
    </section>
  );
}
