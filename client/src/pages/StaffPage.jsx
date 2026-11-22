import { useEffect, useState } from 'react';
import { api, formatTime, STATUS_LABEL } from '../api.js';
import { useNow, usePolling } from '../hooks.js';

const CALL_TIMEOUT_MIN = 10; // 서버 규칙과 같은 값 (화면 안내용, 최종 검사는 서버)

export default function StaffPage() {
  const { data: stores, error, reload: reloadStores } = usePolling(() => api('/staff/stores'), 0);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (stores?.length && !stores.some(s => s.id === selectedId)) setSelectedId(stores[0].id);
  }, [stores, selectedId]);

  const store = stores?.find(s => s.id === selectedId);

  return (
    <section>
      <div className="row-between">
        <h1>매장 관리</h1>
        <button onClick={() => setShowCreate(v => !v)}>{showCreate ? '닫기' : '+ 매장 등록'}</button>
      </div>
      {error && <p className="error">{error.message}</p>}
      {showCreate && <StoreForm onSaved={async s => { setShowCreate(false); await reloadStores(); setSelectedId(s.id); }} />}

      {stores?.length === 0 && !showCreate && <div className="card muted">관리 중인 매장이 없습니다. 매장을 등록해주세요.</div>}
      {stores?.length > 1 && (
        <div className="tabs">
          {stores.map(s => (
            <button key={s.id} className={s.id === selectedId ? 'tab active' : 'tab'} onClick={() => setSelectedId(s.id)}>{s.name}</button>
          ))}
        </div>
      )}
      {store && <StoreDashboard key={store.id} store={store} onStoreChanged={reloadStores} />}
    </section>
  );
}

function StoreDashboard({ store, onStoreChanged }) {
  const { data: waitings, error, reload } = usePolling(() => api(`/staff/stores/${store.id}/waitings`), 5000, [store.id]);
  const [message, setMessage] = useState(null);
  const [pending, setPending] = useState(null);
  const [editing, setEditing] = useState(false);
  const now = useNow();

  async function run(key, fn, success) {
    setPending(key);
    setMessage(null);
    try {
      const r = await fn();
      setMessage({ type: 'ok', text: typeof success === 'function' ? success(r) : success });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPending(null);
      await Promise.all([reload(), onStoreChanged()]);
    }
  }

  const act = (w, action, label) => run(`${w.id}-${action}`,
    () => api(`/staff/waitings/${w.id}/${action}`, { method: 'POST', body: {} }),
    r => action === 'no-show'
      ? `${w.ticketNo}번 노쇼 처리했습니다.${r.nextCalled ? ` 다음 순번 ${r.nextCalled.ticketNo}번을 자동 호출했습니다.` : ''}${r.penaltyUntil ? ' (해당 손님은 노쇼 누적으로 이용 제한)' : ''}`
      : `${w.ticketNo}번 ${label} 처리했습니다.`);

  const toggleAccepting = () => run('toggle',
    () => api(`/staff/stores/${store.id}`, { method: 'PATCH', body: { isAccepting: !store.isAccepting } }),
    store.isAccepting ? '접수를 마감했습니다.' : '접수를 시작했습니다.');

  const closeDay = () => {
    if (!window.confirm('영업을 종료할까요? 접수가 마감되고, 남은 웨이팅이 모두 취소됩니다.')) return;
    run('close', () => api(`/staff/stores/${store.id}/close-day`, { method: 'POST', body: {} }),
      r => `영업 종료: 남은 웨이팅 ${r.closedCount}건을 종료했습니다.`);
  };

  const deactivate = () => {
    if (!window.confirm(`'${store.name}' 매장을 닫을까요? 손님 목록에서 사라집니다. (기록은 보존됩니다)`)) return;
    run('delete', () => api(`/staff/stores/${store.id}`, { method: 'DELETE' }), '매장을 닫았습니다.');
  };

  const active = waitings?.filter(w => w.status === 'WAITING' || w.status === 'CALLED') ?? [];
  const done = waitings?.filter(w => !(w.status === 'WAITING' || w.status === 'CALLED')) ?? [];
  const firstWaitingId = active.find(w => w.status === 'WAITING')?.id;

  return (
    <>
      <div className="card">
        <div className="row-between">
          <div>
            <h2>{store.name}</h2>
            <p className="muted small">{store.address} · 최대 {store.maxParty}명</p>
          </div>
          <span className={store.isAccepting ? 'badge ok' : 'badge off'}>{store.isAccepting ? '접수 중' : '접수 마감'}</span>
        </div>
        <div className="button-row">
          <button onClick={toggleAccepting} disabled={pending === 'toggle'}>{store.isAccepting ? '접수 마감' : '접수 시작'}</button>
          <button onClick={closeDay} disabled={pending === 'close'}>영업 종료</button>
          <button onClick={() => setEditing(v => !v)}>{editing ? '수정 닫기' : '정보 수정'}</button>
          <button className="danger ghost" onClick={deactivate} disabled={pending === 'delete'}>매장 닫기</button>
        </div>
        {editing && <StoreForm store={store} onSaved={async () => { setEditing(false); await onStoreChanged(); }} />}
      </div>

      {message && <div className={message.type === 'ok' ? 'alert ok' : 'alert'}>{message.text}</div>}
      {error && <p className="error">{error.message}</p>}

      <div className="card">
        <h2>대기 중 <span className="muted">({active.length}팀)</span></h2>
        {active.length === 0 && <p className="muted">대기 중인 손님이 없습니다.</p>}
        <ul className="queue">
          {active.map(w => {
            const elapsed = w.calledAt ? (now - new Date(w.calledAt).getTime()) / 60000 : 0;
            const remain = Math.max(0, CALL_TIMEOUT_MIN - elapsed);
            return (
              <li key={w.id} className={`queue-item status-${w.status.toLowerCase()}`}>
                <div className="queue-no">{w.ticketNo}</div>
                <div className="queue-info">
                  <strong>{w.customerName}</strong> · {w.partySize}명
                  <p className="muted small">
                    {STATUS_LABEL[w.status]} · 등록 {formatTime(w.createdAt)}
                    {w.calledAt && <> · 호출 {formatTime(w.calledAt)} ({Math.floor(elapsed)}분 경과)</>}
                  </p>
                </div>
                <div className="queue-actions">
                  {w.status === 'WAITING' && (
                    <button className="primary" onClick={() => act(w, 'call', '호출')}
                      disabled={pending === `${w.id}-call` || w.id !== firstWaitingId}
                      title={w.id !== firstWaitingId ? '선착순: 앞 순번부터 호출할 수 있습니다' : ''}>호출</button>
                  )}
                  {w.status === 'CALLED' && <>
                    <button className="primary" onClick={() => act(w, 'seat', '입장')} disabled={pending === `${w.id}-seat`}>입장</button>
                    <button className="danger" onClick={() => act(w, 'no-show', '노쇼')} disabled={pending === `${w.id}-no-show`}
                      title={remain > 0 ? `호출 후 ${CALL_TIMEOUT_MIN}분이 지나야 노쇼 처리할 수 있습니다` : ''}>
                      {remain > 0 ? `노쇼 (${Math.ceil(remain)}분 후)` : '노쇼'}
                    </button>
                  </>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {done.length > 0 && (
        <div className="card">
          <h2>오늘 처리 완료 <span className="muted">({done.length}건)</span></h2>
          <ul className="queue compact">
            {done.map(w => (
              <li key={w.id} className={`queue-item status-${w.status.toLowerCase()}`}>
                <div className="queue-no">{w.ticketNo}</div>
                <div className="queue-info">{w.customerName} · {w.partySize}명</div>
                <span className="badge">{STATUS_LABEL[w.status]} {formatTime(w.finishedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function StoreForm({ store, onSaved }) {
  const [form, setForm] = useState({ name: store?.name ?? '', address: store?.address ?? '', maxParty: store?.maxParty ?? 4 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = key => e => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { name: form.name, address: form.address, maxParty: Number(form.maxParty) };
      const saved = store
        ? await api(`/staff/stores/${store.id}`, { method: 'PATCH', body })
        : await api('/staff/stores', { method: 'POST', body });
      await onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={store ? 'subform' : 'card'} onSubmit={submit}>
      {!store && <h2>새 매장 등록</h2>}
      <label>매장 이름<input value={form.name} onChange={set('name')} maxLength={40} required /></label>
      <label>주소<input value={form.address} onChange={set('address')} maxLength={100} required /></label>
      <label>최대 인원 (1~20)<input type="number" min={1} max={20} value={form.maxParty} onChange={set('maxParty')} required /></label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      {!store && <p className="muted small">등록 직후에는 접수 마감 상태입니다. '접수 시작'을 눌러 웨이팅을 받으세요.</p>}
    </form>
  );
}
