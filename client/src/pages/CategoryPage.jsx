import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import { categoryIcon } from '../catalogIcons.js';
import StoreCards from '../components/StoreCards.jsx';

/**
 * 음식 종류로 찾기: 종류 선택 → (선택) 지역으로 좁히기 → 매장 목록
 * 선택 상태는 주소(?category=&sido=)에 남깁니다.
 */
export default function CategoryPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const sido = params.get('sido') ?? '';

  const { data: catalog, error: catalogError } = usePolling(() => api('/catalog'), 30000);

  const query = new URLSearchParams();
  if (category) query.set('category', category);
  if (sido) query.set('sido', sido);
  const qs = query.toString();
  const { data: stores, error, loading } = usePolling(
    () => (category ? api(`/stores?${qs}`) : Promise.resolve(null)), 10000, [qs]);

  return (
    <section>
      <h1>음식 종류로 찾기</h1>
      {catalogError && <p className="error">{catalogError.message}</p>}

      <div className="category-grid">
        {catalog?.categories.map(c => (
          <button key={c.name} type="button"
            className={`category-tile ${c.name === category ? 'active' : ''}`}
            disabled={c.count === 0 && c.name !== category}
            onClick={() => setParams(c.name === category ? {} : { category: c.name, ...(sido ? { sido } : {}) })}>
            <span className="category-icon" aria-hidden="true">{categoryIcon(c.name)}</span>
            <span className="category-name">{c.name}</span>
            <span className="chip-count">{c.count}곳</span>
          </button>
        ))}
      </div>

      {!category && <p className="muted center">먹고 싶은 음식 종류를 골라보세요.</p>}
      {category && (
        <>
          <div className="result-head row-between">
            <span><b>{categoryIcon(category)} {category}</b> 매장 {stores ? `${stores.length}곳` : ''}</span>
            <label className="inline-select">지역
              <select value={sido} onChange={e => setParams(e.target.value ? { category, sido: e.target.value } : { category })}>
                <option value="">전국</option>
                {catalog?.sidos.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <StoreCards stores={stores} loading={loading} error={error}
            emptyText={sido ? `${sido}에는 아직 ${category} 매장이 없습니다.` : `아직 ${category} 매장이 없습니다.`} />
        </>
      )}
    </section>
  );
}
