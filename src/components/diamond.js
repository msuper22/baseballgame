/**
 * Renders a baseball field SVG with runners, team name, and stats.
 * Fan-shaped layout matching real field proportions.
 */
export function renderDiamond(container, state) {
  const teamName = state.team_name || 'Team';
  const runs = state.total_runs || 0;
  const totalBases = state.total_bases || 0;
  const first = state.first_base_name || null;
  const second = state.second_base_name || null;
  const third = state.third_base_name || null;

  const isLight = document.documentElement.classList.contains('light');
  const teamColor = getTeamColor(state.team_id);
  const glowId = `glow-${state.team_id || 0}`;

  // Theme colors
  const bg = isLight ? '#e8f5e9' : '#0a1a10';
  const grassDark = isLight ? '#43a047' : '#2d8a4e';
  const grassMid = isLight ? '#4caf50' : '#338a50';
  const grassLight = isLight ? '#66bb6a' : '#3a9e5c';
  const dirtColor = isLight ? '#dbb54c' : '#c9a040';
  const dirtDark = isLight ? '#c9a040' : '#b08530';
  const wallColor = isLight ? '#2e7d32' : '#1a3a1a';
  const wallStroke = isLight ? '#1b5e20' : '#0d2a0d';
  const chalkColor = 'white';
  const chalkOpacity = isLight ? '0.9' : '0.85';
  const labelColor = isLight ? '#444' : '#aaa';

  function renderRunner(x, y, name, labelX, labelY) {
    if (!name) return '';
    const pillW = getTextWidth(name, 9) + 18;
    return `
      <g class="runner-group">
        <circle cx="${x}" cy="${y}" r="20" fill="${teamColor}" opacity="0.2">
          <animate attributeName="r" values="20;25;20" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.2;0.08;0.2" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${x}" cy="${y}" r="14" fill="${teamColor}" filter="url(#${glowId})" opacity="0.9"/>
        <circle cx="${x}" cy="${y}" r="9" fill="white" opacity="0.95"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="9" font-weight="800" fill="${teamColor}">
          ${getInitials(name)}
        </text>
        <rect x="${labelX - pillW/2}" y="${labelY - 12}" width="${pillW}" height="24" rx="12"
              fill="${teamColor}" opacity="0.92"/>
        <text x="${labelX}" y="${labelY + 4}" text-anchor="middle" font-size="15" font-weight="700" fill="white" class="runner-label">
          ${name}
        </text>
      </g>`;
  }

  container.innerHTML = `
    <div class="diamond-card" style="--team-color: ${teamColor}">
      <h3 class="diamond-team-name">${teamName}</h3>
      <svg viewBox="0 0 400 380" class="diamond-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <clipPath id="field-clip-${state.team_id || 0}">
            <path d="M 200 10 Q 390 60 370 250 L 310 320 Q 200 370 90 320 L 30 250 Q 10 60 200 10 Z"/>
          </clipPath>
        </defs>

        <!-- Card background -->
        <rect x="0" y="0" width="400" height="380" fill="${bg}" rx="12"/>

        <!-- Outfield wall -->
        <path d="M 200 10 Q 390 60 370 250 L 310 320 Q 200 370 90 320 L 30 250 Q 10 60 200 10 Z"
              fill="${wallColor}" stroke="${wallStroke}" stroke-width="3"/>

        <!-- Outfield grass - extends below home plate -->
        <path d="M 200 22 Q 378 68 360 245 L 302 312 Q 200 358 98 312 L 40 245 Q 22 68 200 22 Z"
              fill="${grassDark}"/>

        <!-- Mowing stripes -->
        <g clip-path="url(#field-clip-${state.team_id || 0})" opacity="0.1">
          <line x1="120" y1="20" x2="120" y2="360" stroke="${grassLight}" stroke-width="14"/>
          <line x1="160" y1="20" x2="160" y2="360" stroke="${grassLight}" stroke-width="14"/>
          <line x1="240" y1="20" x2="240" y2="360" stroke="${grassLight}" stroke-width="14"/>
          <line x1="280" y1="20" x2="280" y2="360" stroke="${grassLight}" stroke-width="14"/>
        </g>

        <!-- Infield dirt - large arc -->
        <path d="M 100 230 Q 100 130 200 100 Q 300 130 300 230 Z" fill="${dirtColor}"/>

        <!-- Infield grass circle -->
        <circle cx="200" cy="195" r="52" fill="${grassMid}"/>

        <!-- Dirt basepaths (diamond shape on top of grass) -->
        <polygon points="200,105 290,200 200,300 110,200" fill="none" stroke="${dirtDark}" stroke-width="12" opacity="0.3"/>

        <!-- Batter's box dirt -->
        <path d="M 175 290 Q 175 270 200 268 Q 225 270 225 290 L 225 320 Q 225 330 200 332 Q 175 330 175 320 Z"
              fill="${dirtColor}"/>

        <!-- Foul lines -->
        <line x1="200" y1="300" x2="40" y2="225" stroke="${chalkColor}" stroke-width="2" opacity="${chalkOpacity}"/>
        <line x1="200" y1="300" x2="360" y2="225" stroke="${chalkColor}" stroke-width="2" opacity="${chalkOpacity}"/>

        <!-- Base paths (chalk) -->
        <line x1="200" y1="300" x2="290" y2="200" stroke="${chalkColor}" stroke-width="2.5" opacity="${chalkOpacity}"/>
        <line x1="290" y1="200" x2="200" y2="105" stroke="${chalkColor}" stroke-width="2.5" opacity="${chalkOpacity}"/>
        <line x1="200" y1="105" x2="110" y2="200" stroke="${chalkColor}" stroke-width="2.5" opacity="${chalkOpacity}"/>
        <line x1="110" y1="200" x2="200" y2="300" stroke="${chalkColor}" stroke-width="2.5" opacity="${chalkOpacity}"/>

        <!-- Pitcher's mound -->
        <circle cx="200" cy="200" r="12" fill="${dirtColor}" stroke="${dirtDark}" stroke-width="1"/>
        <rect x="195" y="198" width="10" height="4" fill="white" rx="1" opacity="0.95"/>

        <!-- Home plate -->
        <polygon points="200,300 192,293 192,286 208,286 208,293" fill="white" stroke="#888" stroke-width="1.5"/>

        <!-- Batter's boxes -->
        <rect x="175" y="285" width="12" height="24" fill="none" stroke="white" stroke-width="1" opacity="0.5" rx="1"/>
        <rect x="213" y="285" width="12" height="24" fill="none" stroke="white" stroke-width="1" opacity="0.5" rx="1"/>

        <!-- First base -->
        <rect x="280" y="190" width="20" height="20" rx="2" transform="rotate(45, 290, 200)"
              fill="${first ? teamColor : 'white'}" stroke="${first ? 'white' : '#888'}" stroke-width="${first ? 2.5 : 1.5}"/>

        <!-- Second base -->
        <rect x="190" y="95" width="20" height="20" rx="2" transform="rotate(45, 200, 105)"
              fill="${second ? teamColor : 'white'}" stroke="${second ? 'white' : '#888'}" stroke-width="${second ? 2.5 : 1.5}"/>

        <!-- Third base -->
        <rect x="100" y="190" width="20" height="20" rx="2" transform="rotate(45, 110, 200)"
              fill="${third ? teamColor : 'white'}" stroke="${third ? 'white' : '#888'}" stroke-width="${third ? 2.5 : 1.5}"/>

        <!-- Base labels when empty -->
        ${!first ? `<text x="310" y="220" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">1B</text>` : ''}
        ${!second ? `<text x="200" y="128" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">2B</text>` : ''}
        ${!third ? `<text x="90" y="220" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">3B</text>` : ''}
        <text x="200" y="350" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">HOME</text>

        <!-- Runners -->
        ${renderRunner(290, 200, first, 338, 188)}
        ${renderRunner(200, 105, second, 200, 75)}
        ${renderRunner(110, 200, third, 62, 188)}
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
    const eased = 1 - Math.pow(1 - progress, 3);
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

function getTextWidth(text, charWidth = 6) {
  return text ? text.length * charWidth : 0;
}

const TEAM_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];

function getTeamColor(teamId) {
  if (!teamId) return TEAM_COLORS[0];
  return TEAM_COLORS[(teamId - 1) % TEAM_COLORS.length];
}
