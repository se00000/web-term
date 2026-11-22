import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(email, password);
      navigate(location.state?.from || (user.role === 'STAFF' ? '/staff' : '/'), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>로그인</h1>
      <label>이메일
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
      </label>
      <label>비밀번호
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      <p className="muted">계정이 없나요? <Link to="/signup">회원가입</Link></p>
    </form>
  );
}
