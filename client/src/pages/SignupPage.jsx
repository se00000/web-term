import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function SignupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = key => e => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (form.password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    setBusy(true);
    setError('');
    try {
      await api('/auth/signup', { method: 'POST', body: form });
      await login(form.email, form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>회원가입</h1>
      <p className="muted">손님 계정이 만들어집니다. 매장 직원 계정은 운영자가 발급합니다.</p>
      <label>이름
        <input value={form.name} onChange={set('name')} maxLength={20} required />
      </label>
      <label>이메일
        <input type="email" value={form.email} onChange={set('email')} autoComplete="username" required />
      </label>
      <label>비밀번호 (8자 이상)
        <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={8} maxLength={72} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '가입 중…' : '가입하기'}</button>
      <p className="muted">이미 계정이 있나요? <Link to="/login">로그인</Link></p>
    </form>
  );
}
