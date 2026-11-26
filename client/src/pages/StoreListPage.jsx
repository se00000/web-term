import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import StoreCards, { StoreCarousel } from '../components/StoreCards.jsx';
import CategoryRow from '../components/CategoryRow.jsx';

/** 홈: 검색, 음식 종류 아이콘 줄, 추천 섹션(가로 카드), 전체 매장 목록 */
export default function StoreListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const { data: stores, error, loading } = usePolling(() => api(`/stores${query}`), 10000, [query]);
  const { data: catalog } = usePolling(() => api('/catalog'), 30000);

  function submit(e) {
    e.preventDefault();
    const v = input.trim();
    setParams(v ? { q: v } : {});
  }

  const enterNow = stores?.filter(s => s.isAccepting && s.waitingCount === 0) ?? [];
  const busy = [...(stores ?? [])].filter(s => s.isAccepting && s.waitingCount > 0)
    .sort((a, b) => b.waitingCount - a.waitingCount);
  const popularSidos = catalog?.sidos.filter(s => s.count > 0) ?? [];

  return (
    <div className="home">
      {/* 상단 배너 + 검색 (PC: 넓은 배너 안에 큰 검색창 / 모바일: 같은 구성을 한 단으로) */}
      <section className="promo">
        <div className="promo-text">
          <p className="promo-eyebrow">원격 줄서기</p>
          <h1 className="promo-title">줄 서지 말고, 번호표만 받아두세요</h1>
          <p className="promo-sub">내 앞에 몇 팀 남았는지 실시간으로 확인할 수 있어요.</p>
          <form className="search-pill" onSubmit={submit} role="search">
            <span className="search-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </span>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="매장 이름, 주소로 검색해보세요" maxLength={40} aria-label="검색어" />
            {input && <button type="button" className="search-clear" aria-label="검색어 지우기" onClick={() => { setInput(''); setParams({}); }}>×</button>}
            <button className="search-submit">검색</button>
          </form>
        </div>
        <span className="promo-art" aria-hidden="true">🎫</span>
      </section>

      {q ? (
        <section className="section">
          <h2 className="section-title">'{q}' 검색 결과 <span className="muted">{stores ? stores.length : ''}</span></h2>
          <StoreCards stores={stores} loading={loading} error={error} emptyText="검색 결과가 없어요. 다른 이름으로 찾아보세요." />
        </section>
      ) : (
        <>
          {catalog && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">무엇을 먹을까요?</h2>
                <Link to="/category" className="section-more">음식 종류로 찾기</Link>
              </div>
              <CategoryRow categories={catalog.categories} linkTo={name => `/category?category=${encodeURIComponent(name)}`} />
            </section>
          )}

          {enterNow.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">지금 바로 입장 가능</h2>
                <span className="section-note">대기 0팀</span>
              </div>
              <StoreCarousel stores={enterNow} />
            </section>
          )}

          {busy.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">지금 줄 서는 인기 매장</h2>
                <span className="section-note">대기 많은 순</span>
              </div>
              <StoreCarousel stores={busy} />
            </section>
          )}

          {popularSidos.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">지역별 매장</h2>
                <Link to="/region" className="section-more">전체 지역</Link>
              </div>
              <div className="chip-scroll">
                {popularSidos.map(s => (
                  <Link key={s.name} to={`/region?sido=${encodeURIComponent(s.name)}`} className="chip">
                    {s.name}<span className="chip-count">{s.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">전체 매장</h2>
              <span className="section-note">접수 중 · 대기 짧은 순</span>
            </div>
            <StoreCards stores={stores} loading={loading} error={error} emptyText="등록된 매장이 없습니다." />
          </section>
        </>
      )}
    </div>
  );
}
