import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import StoreCards from '../components/StoreCards.jsx';

/**
 * 지역으로 찾기: 왼쪽 시·도 목록 + 오른쪽 구·군 목록(2단 선택) → 매장 목록
 * 선택 상태는 주소(?sido=&district=)에 남겨서 새로고침·뒤로 가기에도 유지됩니다.
 */
export default function RegionPage() {
  const [params, setParams] = useSearchParams();
  const sido = params.get('sido') ?? '';
  const district = params.get('district') ?? '';

  const { data: catalog, error: catalogError } = usePolling(() => api('/catalog'), 30000);

  const query = new URLSearchParams();
  if (sido) query.set('sido', sido);
  if (district) query.set('district', district);
  const qs = query.toString();
  const { data: stores, error, loading } = usePolling(
    () => (sido ? api(`/stores?${qs}`) : Promise.resolve(null)), 10000, [qs]);

  const districts = (sido && catalog?.districts[sido]) || [];
  const sidoCount = catalog?.sidos.find(s => s.name === sido)?.count ?? 0;

  return (
    <div className="page">
      <h1 className="page-title">지역으로 찾기</h1>
      {catalogError && <p className="error">{catalogError.message}</p>}

      <div className="region-layout">
      <div className="region-picker">
        <ul className="region-col sidos" aria-label="시·도">
          {catalog?.sidos.map(s => (
            <li key={s.name}>
              <button type="button"
                className={`region-item ${s.name === sido ? 'active' : ''}`}
                disabled={s.count === 0 && s.name !== sido}
                onClick={() => setParams({ sido: s.name })}>
                {s.name}{s.count > 0 && <span className="region-count">{s.count}</span>}
              </button>
            </li>
          ))}
        </ul>
        <ul className="region-col districts" aria-label="구·군">
          {!sido && <li className="region-hint">왼쪽에서 시·도를 골라주세요</li>}
          {sido && (
            <li>
              <button type="button" className={`region-item ${!district ? 'active' : ''}`} onClick={() => setParams({ sido })}>
                {sido} 전체<span className="region-count">{sidoCount}</span>
              </button>
            </li>
          )}
          {districts.map(d => (
            <li key={d.name}>
              <button type="button" className={`region-item ${d.name === district ? 'active' : ''}`}
                onClick={() => setParams({ sido, district: d.name })}>
                {d.name}<span className="region-count">{d.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="region-results">
      {!sido && <div className="empty"><span>📍</span><p>시·도를 고르면 그 지역 매장이 보여요</p></div>}
      {sido && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{sido}{district && ` ${district}`} <span className="muted">{stores ? stores.length : ''}</span></h2>
            <span className="section-note">접수 중 · 대기 짧은 순</span>
          </div>
          <StoreCards stores={stores} loading={loading} error={error} emptyText="이 지역에는 아직 등록된 매장이 없어요." />
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
