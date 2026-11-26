import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePolling } from '../hooks.js';
import StoreCards from '../components/StoreCards.jsx';

/** 전체 매장 + 이름·주소 검색 */
export default function StoreListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const { data: stores, error, loading } = usePolling(() => api(`/stores${query}`), 10000, [query]);

  function submit(e) {
    e.preventDefault();
    const v = input.trim();
    setParams(v ? { q: v } : {});
  }

  return (
    <section>
      <h1>전체 매장</h1>
      <p className="muted">줄 서지 말고 원격으로 웨이팅하세요. 대기 팀 수는 10초마다 갱신됩니다.</p>

      <form className="search-bar" onSubmit={submit} role="search">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="매장 이름이나 주소로 검색" maxLength={40} aria-label="검색어" />
        <button className="primary">검색</button>
      </form>

      <div className="quick-links">
        <Link to="/region" className="quick-link">📍 지역으로 찾기</Link>
        <Link to="/category" className="quick-link">🍽️ 음식 종류로 찾기</Link>
      </div>

      {q && (
        <p className="result-head">
          '<b>{q}</b>' 검색 결과 {stores ? `${stores.length}곳` : ''}
          <button className="link" onClick={() => { setInput(''); setParams({}); }}>검색 지우기</button>
        </p>
      )}
      <StoreCards stores={stores} loading={loading} error={error}
        emptyText={q ? '검색 결과가 없습니다.' : '등록된 매장이 없습니다.'} />
    </section>
  );
}
