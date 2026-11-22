import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import StoreListPage from './pages/StoreListPage.jsx';
import StoreDetailPage from './pages/StoreDetailPage.jsx';
import MyWaitingPage from './pages/MyWaitingPage.jsx';
import StaffPage from './pages/StaffPage.jsx';

function RequireRole({ role, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="muted center">불러오는 중…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) {
    return <div className="card"><p>이 화면은 {role === 'STAFF' ? '매장 직원' : '손님'} 계정만 사용할 수 있습니다.</p></div>;
  }
  return children;
}

export default function App() {
  const { user, logout, notice } = useAuth();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">줄서기</Link>
          <nav>
            <NavLink to="/" end>매장</NavLink>
            {user?.role === 'CUSTOMER' && <NavLink to="/me">내 웨이팅</NavLink>}
            {user?.role === 'STAFF' && <NavLink to="/staff">매장 관리</NavLink>}
            {user
              ? <button className="link" onClick={() => logout()}>로그아웃</button>
              : <NavLink to="/login">로그인</NavLink>}
          </nav>
        </div>
      </header>

      <main className="container">
        {user && <p className="whoami">{user.name}님 · {user.role === 'STAFF' ? '매장 직원' : '손님'}</p>}
        {notice && <div className="alert">{notice}</div>}
        <Routes>
          <Route path="/" element={<StoreListPage />} />
          <Route path="/stores/:id" element={<StoreDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/me" element={<RequireRole role="CUSTOMER"><MyWaitingPage /></RequireRole>} />
          <Route path="/staff" element={<RequireRole role="STAFF"><StaffPage /></RequireRole>} />
          <Route path="*" element={<div className="card">페이지를 찾을 수 없습니다. <Link to="/">처음으로</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
