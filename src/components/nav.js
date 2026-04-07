import { isLoggedIn, isAdmin, isMod, getUser, clearToken } from '../api.js';
import { navigate } from '../router.js';
import { toggleTheme, getTheme } from '../theme.js';

export function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const themeIcon = getTheme() === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';

  if (!isLoggedIn()) {
    nav.innerHTML = `
      <div class="nav-inner">
        <a href="#/" class="nav-logo">&#9918; LBCS</a>
        <button id="theme-btn" class="theme-toggle">${themeIcon}</button>
      </div>`;
    document.getElementById('theme-btn')?.addEventListener('click', () => {
      toggleTheme();
      renderNav();
    });
    return;
  }

  const user = getUser();
  const adminLink = isAdmin() ? '<a href="#/admin" class="nav-link">Admin</a>' : '';
  const logEventLink = isMod() || isLoggedIn() ? '<a href="#/log-event" class="nav-link">Log Event</a>' : '';

  nav.innerHTML = `
    <div class="nav-inner">
      <a href="#/" class="nav-logo">&#9918; LBCS</a>
      <div class="nav-links">
        <a href="#/" class="nav-link">Dashboard</a>
        <a href="#/leaderboard" class="nav-link">Leaderboard</a>
        <a href="#/history" class="nav-link">History</a>
        <a href="#/rules" class="nav-link">Rules</a>
        ${logEventLink}
        ${adminLink}
        <span class="nav-user">${user?.display_name || user?.username}</span>
        <button id="theme-btn" class="theme-toggle">${themeIcon}</button>
        <button id="logout-btn" class="btn btn-sm">Logout</button>
      </div>
      <button id="nav-toggle" class="nav-toggle">&#9776;</button>
    </div>`;

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    clearToken();
    navigate('/login');
    renderNav();
  });

  document.getElementById('theme-btn')?.addEventListener('click', () => {
    toggleTheme();
    renderNav();
  });

  document.getElementById('nav-toggle')?.addEventListener('click', () => {
    nav.querySelector('.nav-links')?.classList.toggle('open');
  });
}
