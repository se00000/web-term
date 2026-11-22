import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');

  const logout = useCallback((message = '') => {
    tokenStore.clear();
    setUser(null);
    setNotice(message);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout('로그인이 만료되었습니다. 다시 로그인해주세요.'));
    if (!tokenStore.get()) { setReady(true); return; }
    api('/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setReady(true));
  }, [logout]);

  async function login(email, password) {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(r.accessToken);
    setUser(r.user);
    setNotice('');
    return r.user;
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, notice, setNotice }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
