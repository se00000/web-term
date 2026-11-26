import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import StoreCards from '../components/StoreCards.jsx';

/**
 * 지역으로 찾기: 시·도 선택 → (선택) 구·군 선택 → 매장 목록
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
    <section>
      <h1>지역으로 찾기</h1>
      {catalogError && <p className="error">{catalogError.message}</p>}

      <div className="card">
        <h2 className="step-title">시·도</h2>
        <div className="chips">
          {catalog?.sidos.map(s => (
            <button key={s.name} type="button"
              className={`chip ${s.name === sido ? 'active' : ''}`}
              disabled={s.count === 0 && s.name !== sido}
              onClick={() => setParams(s.name === sido ? {} : { sido: s.name })}>
              {s.name}<span className="chip-count">{s.count}</span>
            </button>
          ))}
        </div>

        {sido && districts.length > 0 && (
          <>
            <h2 className="step-title">{sido} · 구·군</h2>
            <div className="chips">
              <button type="button" className={`chip ${!district ? 'active' : ''}`} onClick={() => setParams({ sido })}>
                전체<span className="chip-count">{sidoCount}</span>
              </button>
              {districts.map(d => (
                <button key={d.name} type="button"
                  className={`chip ${d.name === district ? 'active' : ''}`}
                  onClick={() => setParams({ sido, district: d.name })}>
                  {d.name}<span className="chip-count">{d.count}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {!sido && <p className="muted center">시·도를 선택하면 그 지역의 매장이 보여요. 숫자는 등록된 매장 수입니다.</p>}
      {sido && (
        <>
          <p className="result-head"><b>{sido}{district && ` ${district}`}</b> 매장 {stores ? `${stores.length}곳` : ''}</p>
          <StoreCards stores={stores} loading={loading} error={error} emptyText="이 지역에는 아직 등록된 매장이 없습니다." />
        </>
      )}
    </section>
  );
}
