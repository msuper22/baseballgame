import { isLoggedIn } from '../api.js';
import { navigate } from '../router.js';
import { renderEventForm } from '../components/event-form.js';

export async function logEventPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <a href="#/" class="back-link">&larr; Dashboard</a>
      <div id="event-form-container"></div>
    </div>`;

  await renderEventForm(document.getElementById('event-form-container'), {
    onSuccess: () => {
      // Could auto-refresh or show updated state
    },
  });
}
