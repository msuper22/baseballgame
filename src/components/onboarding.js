const STORAGE_KEY = 'onboarded_v1';

const STEPS = [
  {
    title: 'Welcome to the LBCS',
    body: `
      <p>This is a 2-week production competition played as a baseball game.</p>
      <p>Every credit pull you log becomes an at-bat for your team. Hits move runners around the bases, runs put you ahead on the scoreboard, and at the end of each series the winning team takes the prize.</p>
    `,
  },
  {
    title: 'How hits work',
    body: `
      <ul class="onboarding-list">
        <li><strong>1B — App Taken</strong> · one base</li>
        <li><strong>2B — Light House</strong> · two bases</li>
        <li><strong>3B — Out</strong> · three bases</li>
        <li><strong>HR — Out + Docs Back</strong> · clears the bases, every runner scores</li>
      </ul>
      <p>When your team is on defense, those same actions push strikes and outs onto the other team. A defensive HR instantly swaps sides — your team goes up to bat.</p>
    `,
  },
  {
    title: 'Logging events',
    body: `
      <p>Open your team page or the live game and hit the action that matches what you did. You must enter:</p>
      <ul class="onboarding-list">
        <li>The <strong>Lead ID</strong> for that pull</li>
        <li>The <strong>Credit Pull Time</strong> — this is when it actually happened</li>
      </ul>
      <p>Events always apply to the current inning. You can't back-date a pull into an inning that already ended.</p>
      <p>Questions? Ask your team lead.</p>
    `,
  },
];

export function maybeShowOnboarding(user) {
  if (!user || user.role !== 'player') return;
  if (localStorage.getItem(STORAGE_KEY)) return;
  showOnboarding();
}

export function showOnboarding() {
  if (document.querySelector('.onboarding-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  let step = 0;

  const render = () => {
    const s = STEPS[step];
    overlay.innerHTML = `
      <div class="onboarding-modal">
        <div class="onboarding-progress">
          ${STEPS.map((_, i) => `<span class="onboarding-dot ${i === step ? 'active' : ''}"></span>`).join('')}
        </div>
        <h2 class="onboarding-title">${s.title}</h2>
        <div class="onboarding-body">${s.body}</div>
        <div class="onboarding-actions">
          <button class="btn onboarding-skip" data-act="skip">Skip</button>
          ${step > 0 ? '<button class="btn" data-act="back">Back</button>' : ''}
          <button class="btn btn-primary" data-act="next">${step === STEPS.length - 1 ? 'Got it' : 'Next'}</button>
        </div>
      </div>`;

    overlay.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      if (step === STEPS.length - 1) {
        localStorage.setItem(STORAGE_KEY, '1');
        overlay.remove();
      } else {
        step++;
        render();
      }
    });
    overlay.querySelector('[data-act="back"]')?.addEventListener('click', () => { step--; render(); });
    overlay.querySelector('[data-act="skip"]')?.addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, '1');
      overlay.remove();
    });
  };

  render();
  document.body.appendChild(overlay);
}
