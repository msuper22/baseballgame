const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

export function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export function isLoggedIn() {
  return !!getToken();
}

export function isAdmin() {
  const user = getUser();
  return user?.role === 'admin';
}

export function isMod() {
  const user = getUser();
  return user?.role === 'mod' || user?.role === 'admin';
}
