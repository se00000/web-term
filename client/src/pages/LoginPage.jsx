import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ACCOUNT, other } from '../accountTypes.js';

/** type: 'customer' | 'owner' */
export default function LoginPage({ type }) {
  const acc = ACCOUNT[type];
  const otherAcc = ACCOUNT[other(type)];
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(type, email, password);
      navigate(location.state?.from || acc.homePath, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`card narrow account-${type}`} onSubmit={submit}>
      <span className="account-chip">{acc.label} 전용</span>
      <h1>{acc.loginTitle}</h1>
      <p className="muted">{acc.loginLead}</p>
      <label>이메일
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
      </label>
      <label>비밀번호
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && (
        <p className="error">
          {error.message}
          {error.code === 'WRONG_ACCOUNT_TYPE' && <> <Link to={otherAcc.loginPath}>{otherAcc.loginTitle}으로 이동</Link></>}
        </p>
      )}
      <button className="primary" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      <p className="muted">계정이 없나요? <Link to={acc.signupPath}>{acc.signupTitle}</Link></p>
      <p className="switch-account">
        {otherAcc.label}이신가요? <Link to={otherAcc.loginPath}>{otherAcc.loginTitle}</Link>
      </p>
    </form>
  );
}
