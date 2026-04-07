import { api, setToken, setUser } from '../api.js';
import { navigate } from '../router.js';
import { renderNav } from '../components/nav.js';
import { showToast } from '../components/toast.js';

export async function loginPage(app) {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h1>&#9918; MLB Tracker</h1>
        <p class="auth-subtitle">Production Competition</p>
        <form id="login-form" class="auth-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" class="form-input" required autocomplete="username">
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" class="form-input" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="login-btn">Sign In</button>
        </form>
        <p class="auth-link">New player? <a href="#/register">Register with invite code</a></p>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value,
        }),
      });
      setToken(res.token);
      setUser(res.user);
      renderNav();
      navigate('/');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}
