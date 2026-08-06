import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ftech_token');
    if (!token) return setLoading(false);
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* signing out locally is what matters */
    }
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  /** Mirrors the server rule: Super Admin passes everything, Admin needs the switch. */
  const can = useCallback(
    (permission) => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      if (user.role !== 'ADMIN') return false;
      return (user.permissions || []).includes(permission);
    },
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh,
      can,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      isAdmin: user?.role === 'ADMIN',
      isStaff: user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN',
      isEmployee: user?.role === 'EMPLOYEE',
    }),
    [user, loading, login, logout, refresh, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
