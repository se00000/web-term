import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import StoreCards from '../components/StoreCards.jsx';
import CategoryRow from '../components/CategoryRow.jsx';

/**
 * 음식 종류로 찾기: 종류 아이콘 선택 → (선택) 지역 칩으로 좁히기 → 매장 목록
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

  const select = name => setParams(name === category ? {} : { category: name, ...(sido ? { sido } : {}) });
  const sidosWithStores = catalog?.sidos.filter(s => s.count > 0) ?? [];

  return (
    <div className="page">
      <h1 className="page-title">음식 종류로 찾기</h1>
      {catalogError && <p className="error">{catalogError.message}</p>}

      {catalog && <CategoryRow categories={catalog.categories} selected={category} onSelect={select} wrap />}

      {!category && <div className="empty"><span>😋</span><p>먹고 싶은 음식을 골라보세요</p></div>}

      {category && (
        <section className="section">
          <div className="chip-scroll" role="group" aria-label="지역으로 좁히기">
            <button type="button" className={`chip ${!sido ? 'active' : ''}`} onClick={() => setParams({ category })}>전국</button>
            {sidosWithStores.map(s => (
              <button key={s.name} type="button" className={`chip ${s.name === sido ? 'active' : ''}`}
                onClick={() => setParams({ category, sido: s.name })}>{s.name}</button>
            ))}
          </div>
          <div className="section-head">
            <h2 className="section-title">{category}{sido && ` · ${sido}`} <span className="muted">{stores ? stores.length : ''}</span></h2>
            <span className="section-note">접수 중 · 대기 짧은 순</span>
          </div>
          <StoreCards stores={stores} loading={loading} error={error}
            emptyText={sido ? `${sido}에는 아직 ${category} 매장이 없어요.` : `아직 ${category} 매장이 없어요.`} />
        </section>
      )}
    </div>
  );
}
