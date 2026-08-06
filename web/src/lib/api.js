import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ftech_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    // A dead session should drop you at the sign-in screen, not a blank page.
    if (status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('ftech_token');
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    err.message = err.response?.data?.error || err.message || 'Something went wrong';
    err.details = err.response?.data?.details;
    return Promise.reject(err);
  }
);

export default api;

export const setToken = (token) => {
  if (token) localStorage.setItem('ftech_token', token);
  else localStorage.removeItem('ftech_token');
};
