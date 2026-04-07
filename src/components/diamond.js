/**
 * Renders a visually rich SVG baseball stadium with runners, team name, and stats.
 * @param {HTMLElement} container
 * @param {object} state - { team_name, first_base_name, second_base_name, third_base_name, total_runs, total_bases, team_id }
 */
export function renderDiamond(container, state) {
  const teamName = state.team_name || 'Team';
  const runs = state.total_runs || 0;
  const totalBases = state.total_bases || 0;
  const first = state.first_base_name || null;
  const second = state.second_base_name || null;
  const third = state.third_base_name || null;

  const teamColor = getTeamColor(state.team_id);
  const teamColorLight = teamColor + '40';
  const glowId = `glow-${state.team_id || 0}`;
  const grassId = `grass-${state.team_id || 0}`;
  const dirtId = `dirt-${state.team_id || 0}`;

  function renderRunner(x, y, name, labelX, labelY, anchor) {
    if (!name) return '';
    return `
      <g class="runner-group">
        <circle cx="${x}" cy="${y}" r="18" fill="${teamColor}" opacity="0.25">
          <animate attributeName="r" values="18;22;18" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.25;0.1;0.25" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${x}" cy="${y}" r="12" fill="${teamColor}" filter="url(#${glowId})" opacity="0.9"/>
        <circle cx="${x}" cy="${y}" r="7" fill="white" opacity="0.9"/>
        <text x="${x}" y="${y + 3}" text-anchor="middle" font-size="7" font-weight="700" fill="${teamColor}">
          ${getInitials(name)}
        </text>
        <rect x="${labelX - getTextWidth(name)/2 - 6}" y="${labelY - 10}" width="${getTextWidth(name) + 12}" height="18" rx="9"
              fill="${teamColor}" opacity="0.9"/>
        <text x="${labelX}" y="${labelY + 2}" text-anchor="${anchor}" font-size="10" font-weight="600" fill="white" class="runner-label">
          ${name}
        </text>
      </g>`;
  }

  container.innerHTML = `
    <div class="diamond-card" style="--team-color: ${teamColor}">
      <h3 class="diamond-team-name">${teamName}</h3>
      <svg viewBox="0 0 340 320" class="diamond-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Glow filter for runners -->
          <filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>

          <!-- Grass gradient -->
          <radialGradient id="${grassId}" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stop-color="#3a9e5c"/>
            <stop offset="60%" stop-color="#2d8a4e"/>
            <stop offset="100%" stop-color="#1e6b3a"/>
          </radialGradient>

          <!-- Dirt gradient -->
          <radialGradient id="${dirtId}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#d4a84b"/>
            <stop offset="100%" stop-color="#b8913d"/>
          </radialGradient>

          <!-- Outfield wall pattern -->
          <linearGradient id="wall-${state.team_id || 0}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#1a3a1a"/>
            <stop offset="100%" stop-color="#0d2a0d"/>
          </linearGradient>
        </defs>

        <!-- Stadium background -->
        <rect x="0" y="0" width="340" height="320" fill="#0a1a10" rx="12"/>

        <!-- Outfield wall -->
        <path d="M 170 15 Q 320 50 310 195 L 280 215 Q 170 240 60 215 L 30 195 Q 20 50 170 15 Z"
              fill="url(#wall-${state.team_id || 0})" stroke="#2a5a2a" stroke-width="2"/>

        <!-- Outfield grass -->
        <path d="M 170 28 Q 305 58 298 190 L 270 208 Q 170 230 70 208 L 42 190 Q 35 58 170 28 Z"
              fill="url(#${grassId})"/>

        <!-- Mowing stripes -->
        <path d="M 170 28 Q 305 58 298 190 L 270 208 Q 170 230 70 208 L 42 190 Q 35 58 170 28 Z"
              fill="none" stroke="#35a858" stroke-width="0.5" opacity="0.3"/>
        <line x1="100" y1="60" x2="100" y2="200" stroke="#35a858" stroke-width="8" opacity="0.08"/>
        <line x1="140" y1="40" x2="140" y2="210" stroke="#35a858" stroke-width="8" opacity="0.08"/>
        <line x1="200" y1="40" x2="200" y2="210" stroke="#35a858" stroke-width="8" opacity="0.08"/>
        <line x1="240" y1="60" x2="240" y2="200" stroke="#35a858" stroke-width="8" opacity="0.08"/>

        <!-- Infield dirt -->
        <polygon points="170,95 255,180 170,268 85,180" fill="url(#${dirtId})" opacity="0.85"/>

        <!-- Infield grass (center) -->
        <circle cx="170" cy="182" r="48" fill="#2d8a4e" opacity="0.9"/>

        <!-- Base paths (white chalk lines) -->
        <line x1="170" y1="268" x2="255" y2="180" stroke="white" stroke-width="2.5" opacity="0.85"/>
        <line x1="255" y1="180" x2="170" y2="95" stroke="white" stroke-width="2.5" opacity="0.85"/>
        <line x1="170" y1="95" x2="85" y2="180" stroke="white" stroke-width="2.5" opacity="0.85"/>
        <line x1="85" y1="180" x2="170" y2="268" stroke="white" stroke-width="2.5" opacity="0.85"/>

        <!-- Batter's box area -->
        <rect x="158" y="267" width="24" height="30" fill="#d4a84b" opacity="0.6" rx="2"/>

        <!-- Foul lines extending to outfield -->
        <line x1="170" y1="268" x2="42" y2="190" stroke="white" stroke-width="1.5" opacity="0.5"/>
        <line x1="170" y1="268" x2="298" y2="190" stroke="white" stroke-width="1.5" opacity="0.5"/>

        <!-- Pitcher's mound -->
        <circle cx="170" cy="182" r="10" fill="#d4a84b" opacity="0.9"/>
        <rect x="166" y="180" width="8" height="3" fill="white" rx="1" opacity="0.9"/>

        <!-- Home plate -->
        <polygon points="170,268 163,262 163,256 177,256 177,262" fill="white" stroke="#999" stroke-width="1"/>

        <!-- First base -->
        <rect x="245" y="170" width="18" height="18" rx="2" transform="rotate(45, 255, 180)"
              fill="${first ? teamColor : 'white'}" stroke="${first ? 'white' : '#999'}" stroke-width="${first ? 2 : 1}"/>

        <!-- Second base -->
        <rect x="160" y="85" width="18" height="18" rx="2" transform="rotate(45, 170, 95)"
              fill="${second ? teamColor : 'white'}" stroke="${second ? 'white' : '#999'}" stroke-width="${second ? 2 : 1}"/>

        <!-- Third base -->
        <rect x="75" y="170" width="18" height="18" rx="2" transform="rotate(45, 85, 180)"
              fill="${third ? teamColor : 'white'}" stroke="${third ? 'white' : '#999'}" stroke-width="${third ? 2 : 1}"/>

        <!-- Base labels when empty -->
        ${!first ? `<text x="270" y="200" font-size="9" fill="#aaa" text-anchor="middle" opacity="0.6">1B</text>` : ''}
        ${!second ? `<text x="170" y="115" font-size="9" fill="#aaa" text-anchor="middle" opacity="0.6">2B</text>` : ''}
        ${!third ? `<text x="70" y="200" font-size="9" fill="#aaa" text-anchor="middle" opacity="0.6">3B</text>` : ''}
        <text x="170" y="305" font-size="9" fill="#aaa" text-anchor="middle" opacity="0.6">HOME</text>

        <!-- Runners -->
        ${renderRunner(255, 180, first, 290, 170, 'middle')}
        ${renderRunner(170, 95, second, 170, 70, 'middle')}
        ${renderRunner(85, 180, third, 50, 170, 'middle')}

        <!-- Stadium lights effect (corner dots) -->
        <circle cx="30" cy="20" r="3" fill="white" opacity="0.15"/>
        <circle cx="310" cy="20" r="3" fill="white" opacity="0.15"/>
        <circle cx="20" cy="180" r="2" fill="white" opacity="0.1"/>
        <circle cx="320" cy="180" r="2" fill="white" opacity="0.1"/>
      </svg>

      <div class="diamond-stats">
        <div class="stat">
          <span class="stat-value stat-animate" data-target="${runs}">0</span>
          <span class="stat-label">Runs</span>
        </div>
        <div class="stat stat-divider">
          <span class="stat-value stat-animate" data-target="${totalBases}">0</span>
          <span class="stat-label">Total Bases</span>
        </div>
        <div class="stat">
          <span class="stat-value">${countRunners(first, second, third)}</span>
          <span class="stat-label">On Base</span>
        </div>
      </div>
    </div>`;

  // Animate the stat counters
  requestAnimationFrame(() => {
    container.querySelectorAll('.stat-animate').forEach(el => {
      const target = parseInt(el.dataset.target) || 0;
      if (target === 0) { el.textContent = '0'; return; }
      animateCounter(el, target);
    });
  });
}

function animateCounter(el, target) {
  const duration = 800;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function countRunners(...runners) {
  return runners.filter(Boolean).length;
}

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getTextWidth(text) {
  return text ? text.length * 6 : 0;
}

const TEAM_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];

function getTeamColor(teamId) {
  if (!teamId) return TEAM_COLORS[0];
  return TEAM_COLORS[(teamId - 1) % TEAM_COLORS.length];
}
