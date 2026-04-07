import { api, setToken, setUser } from '../api.js';
import { navigate } from '../router.js';
import { renderNav } from '../components/nav.js';
import { showToast } from '../components/toast.js';

export async function registerPage(app) {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h1>&#9918; Join the Game</h1>
        <p class="auth-subtitle">Register with your team invite code</p>
        <form id="register-form" class="auth-form">
          <div class="form-group">
            <label for="invite_code">Team Invite Code</label>
            <input type="text" id="invite_code" class="form-input" required placeholder="e.g. ABC123" maxlength="6" style="text-transform:uppercase">
          </div>
          <div class="form-group">
            <label for="display_name">Display Name</label>
            <input type="text" id="display_name" class="form-input" required placeholder="Your name">
          </div>
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" class="form-input" required autocomplete="username">
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" class="form-input" required autocomplete="new-password" minlength="4">
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="register-btn">Register</button>
        </form>
        <p class="auth-link">Already have an account? <a href="#/login">Sign in</a></p>
      </div>
    </div>`;

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = 'Registering...';

    try {
      const res = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          invite_code: document.getElementById('invite_code').value.toUpperCase(),
          display_name: document.getElementById('display_name').value,
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
      btn.textContent = 'Register';
    }
  });
}
