import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { ACCOUNT, typeOfRole } from './accountTypes.js';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import StoreListPage from './pages/StoreListPage.jsx';
import StoreDetailPage from './pages/StoreDetailPage.jsx';
import MyWaitingPage from './pages/MyWaitingPage.jsx';
import OwnerPage from './pages/OwnerPage.jsx';

/** 로그인하지 않았으면 해당 계정 종류의 로그인 화면으로, 다른 종류로 로그인했으면 안내를 보여줍니다. */
function RequireRole({ role, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  const acc = ACCOUNT[typeOfRole(role)];
  if (!ready) return <p className="muted center">불러오는 중…</p>;
  if (!user) return <Navigate to={acc.loginPath} replace state={{ from: location.pathname }} />;
  if (user.role !== role) {
    return (
      <div className="card">
        <p>이 화면은 {acc.label} 계정만 사용할 수 있습니다.</p>
        <p className="muted">로그아웃한 뒤 <Link to={acc.loginPath}>{acc.loginTitle}</Link>을 이용해주세요.</p>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { user, logout, notice } = useAuth();

  return (
    <>
      <header className={`topbar ${user?.role === 'OWNER' ? 'topbar-owner' : ''}`}>
        <div className="topbar-inner">
          <Link to={user?.role === 'OWNER' ? '/owner' : '/'} className="brand">
            줄서기{user?.role === 'OWNER' && <span className="brand-sub">사장님</span>}
          </Link>
          <nav>
            {user?.role !== 'OWNER' && <NavLink to="/" end>매장</NavLink>}
            {user?.role === 'CUSTOMER' && <NavLink to="/me">내 웨이팅</NavLink>}
            {user?.role === 'OWNER' && <NavLink to="/owner" end>매장 관리</NavLink>}
            {user
              ? <button className="link" onClick={() => logout()}>로그아웃</button>
              : <>
                  <NavLink to="/login">로그인</NavLink>
                  <NavLink to="/owner/login" className="owner-link">사장님</NavLink>
                </>}
          </nav>
        </div>
      </header>

      <main className="container">
        {user && <p className="whoami">{user.name}님 · {ACCOUNT[typeOfRole(user.role)].label}</p>}
        {notice && <div className="alert">{notice}</div>}
        <Routes>
          <Route path="/" element={<StoreListPage />} />
          <Route path="/stores/:id" element={<StoreDetailPage />} />
          <Route path="/login" element={<LoginPage key="customer" type="customer" />} />
          <Route path="/signup" element={<SignupPage key="customer" type="customer" />} />
          <Route path="/owner/login" element={<LoginPage key="owner" type="owner" />} />
          <Route path="/owner/signup" element={<SignupPage key="owner" type="owner" />} />
          <Route path="/me" element={<RequireRole role="CUSTOMER"><MyWaitingPage /></RequireRole>} />
          <Route path="/owner" element={<RequireRole role="OWNER"><OwnerPage /></RequireRole>} />
          <Route path="*" element={<div className="card">페이지를 찾을 수 없습니다. <Link to="/">처음으로</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
