import { api } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export async function resetPage(app, params) {
  const token = params.token;

  app.innerHTML = `
    <div class="container reset-container">
      <div class="reset-card">
        <h1>Reset Password</h1>
        <div id="reset-status">Checking link...</div>
      </div>
    </div>`;

  const status = document.getElementById('reset-status');

  let info;
  try {
    info = await api(`/auth/reset/${token}`);
  } catch (e) {
    status.innerHTML = `<p class="error">${e.message}</p>
      <p><a href="#/login" class="btn btn-primary">Back to login</a></p>`;
    return;
  }

  status.innerHTML = `
    <p>Setting a new password for <strong>${info.display_name}</strong> (<code>${info.username}</code>).</p>
    <div class="form-group">
      <label for="new-pw">New password</label>
      <input type="password" id="new-pw" class="form-input" autocomplete="new-password" placeholder="At least 4 characters">
    </div>
    <div class="form-group">
      <label for="confirm-pw">Confirm</label>
      <input type="password" id="confirm-pw" class="form-input" autocomplete="new-password">
    </div>
    <button id="reset-submit" class="btn btn-primary">Set new password</button>`;

  document.getElementById('reset-submit').addEventListener('click', async () => {
    const pw = document.getElementById('new-pw').value;
    const cf = document.getElementById('confirm-pw').value;
    if (pw.length < 4) { showToast('Password must be at least 4 characters', 'error'); return; }
    if (pw !== cf) { showToast('Passwords don\'t match', 'error'); return; }
    try {
      await api('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password: pw }) });
      showToast('Password updated! Sign in with the new password.', 'success');
      setTimeout(() => navigate('/login'), 1200);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}
