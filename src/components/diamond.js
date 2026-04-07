/**
 * Renders a baseball field SVG with runners, team name, and stats.
 * Accurate fan-shaped layout matching real field proportions.
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
  const grassLight = isLight ? '#66bb6a' : '#3a9e5c';
  const dirt = isLight ? '#d4a84b' : '#c49a3c';
  const dirtDark = isLight ? '#c49a3c' : '#a88030';
  const wallColor = isLight ? '#2e7d32' : '#1a3a1a';
  const wallStroke = isLight ? '#1b5e20' : '#0d2a0d';
  const labelColor = isLight ? '#444' : '#aaa';

  // Key coordinates - diamond centered, home at bottom
  // Home=200,310  1B=290,210  2B=200,110  3B=110,210
  const hx = 200, hy = 310; // home
  const fx = 290, fy = 210; // first
  const sx = 200, sy = 110; // second
  const tx = 110, ty = 210; // third

  function renderRunner(x, y, name, labelX, labelY) {
    if (!name) return '';
    const pillW = getTextWidth(name, 11) + 22;
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
        <rect x="${labelX - pillW/2}" y="${labelY - 14}" width="${pillW}" height="28" rx="14"
              fill="${teamColor}" opacity="0.92"/>
        <text x="${labelX}" y="${labelY + 6}" text-anchor="middle" font-size="19" font-weight="700" fill="white" class="runner-label">
          ${name}
        </text>
      </g>`;
  }

  container.innerHTML = `
    <div class="diamond-card" style="--team-color: ${teamColor}">
      <h3 class="diamond-team-name">${teamName}</h3>
      <svg viewBox="0 0 400 420" class="diamond-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <!-- Card background -->
        <rect x="0" y="0" width="400" height="420" fill="${bg}" rx="12"/>

        <!-- Outfield wall + grass - fan shape, edges on foul lines (home through 1B/3B extended) -->
        <!-- Foul line direction: home(200,310)->1B(290,210) = (+90,-100), extended to wall edge ~(362,130) -->
        <!-- Foul line direction: home(200,310)->3B(110,210) = (-90,-100), extended to wall edge ~(38,130) -->
        <path d="M ${hx} ${hy}
               L 38 130
               Q 15 40 ${sx} 15
               Q 385 40 362 130
               Z"
              fill="${wallColor}" stroke="${wallStroke}" stroke-width="3"/>

        <!-- Grass fill (inside wall) -->
        <path d="M ${hx} ${hy}
               L 42 134
               Q 22 48 ${sx} 24
               Q 378 48 358 134
               Z"
              fill="${grassDark}"/>

        <!-- Grass below home - the bottom wedge -->
        <path d="M ${hx} ${hy}
               L 42 134
               Q 60 340 ${hx} 380
               Q 340 340 358 134
               Z"
              fill="${grassDark}"/>

        <!-- Mowing stripes -->
        <g opacity="0.08">
          <line x1="130" y1="30" x2="130" y2="370" stroke="${grassLight}" stroke-width="16"/>
          <line x1="170" y1="25" x2="170" y2="375" stroke="${grassLight}" stroke-width="16"/>
          <line x1="230" y1="25" x2="230" y2="375" stroke="${grassLight}" stroke-width="16"/>
          <line x1="270" y1="30" x2="270" y2="370" stroke="${grassLight}" stroke-width="16"/>
        </g>

        <!-- Infield dirt - large arc from 1B side to 3B side -->
        <path d="M ${tx - 8} ${ty + 10}
               Q ${tx - 8} ${sy - 10} ${sx} ${sy - 20}
               Q ${fx + 8} ${sy - 10} ${fx + 8} ${fy + 10}
               L ${fx} ${fy + 8}
               L ${hx} ${hy}
               L ${tx} ${ty + 8}
               Z"
              fill="${dirt}"/>

        <!-- Infield grass (diamond shape inside dirt) -->
        <polygon points="${hx},${hy - 50} ${fx - 38},${fy + 8} ${sx},${sy + 42} ${tx + 38},${ty + 8}"
                 fill="${grassDark}"/>

        <!-- Pitcher's mound circle -->
        <circle cx="${hx}" cy="${(sy + hy) / 2 + 12}" r="16" fill="${dirt}" stroke="${dirtDark}" stroke-width="1.5"/>
        <rect x="${hx - 6}" y="${(sy + hy) / 2 + 10}" width="12" height="4" fill="white" rx="1.5" opacity="0.95"/>

        <!-- Dirt basepaths from home to 1B and 3B -->
        <line x1="${hx}" y1="${hy}" x2="${fx}" y2="${fy}" stroke="${dirt}" stroke-width="14" stroke-linecap="round"/>
        <line x1="${hx}" y1="${hy}" x2="${tx}" y2="${ty}" stroke="${dirt}" stroke-width="14" stroke-linecap="round"/>

        <!-- Home plate dirt circle -->
        <circle cx="${hx}" cy="${hy}" r="22" fill="${dirt}"/>

        <!-- Foul lines - from home through 1B/3B extending to outfield wall -->
        <line x1="${hx}" y1="${hy}" x2="362" y2="130" stroke="white" stroke-width="2" opacity="0.9"/>
        <line x1="${hx}" y1="${hy}" x2="38" y2="130" stroke="white" stroke-width="2" opacity="0.9"/>

        <!-- Base path chalk lines -->
        <line x1="${hx}" y1="${hy}" x2="${fx}" y2="${fy}" stroke="white" stroke-width="2" opacity="0.85"/>
        <line x1="${fx}" y1="${fy}" x2="${sx}" y2="${sy}" stroke="white" stroke-width="2" opacity="0.85"/>
        <line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="white" stroke-width="2" opacity="0.85"/>
        <line x1="${tx}" y1="${ty}" x2="${hx}" y2="${hy}" stroke="white" stroke-width="2" opacity="0.85"/>

        <!-- Home plate -->
        <polygon points="${hx},${hy + 2} ${hx - 8},${hy - 5} ${hx - 6},${hy - 10} ${hx + 6},${hy - 10} ${hx + 8},${hy - 5}"
                 fill="white" stroke="#888" stroke-width="1.5"/>

        <!-- Batter's boxes -->
        <rect x="${hx - 22}" y="${hy - 14}" width="12" height="26" fill="none" stroke="white" stroke-width="1.5" opacity="0.6" rx="1"/>
        <rect x="${hx + 10}" y="${hy - 14}" width="12" height="26" fill="none" stroke="white" stroke-width="1.5" opacity="0.6" rx="1"/>

        <!-- On-deck circles -->
        <circle cx="${hx - 55}" cy="${hy + 30}" r="4" fill="${dirt}" opacity="0.7"/>
        <circle cx="${hx + 55}" cy="${hy + 30}" r="4" fill="${dirt}" opacity="0.7"/>

        <!-- Coach's boxes -->
        <rect x="${tx - 45}" y="${ty + 40}" width="16" height="24" fill="none" stroke="white" stroke-width="1" opacity="0.4" rx="1"/>
        <rect x="${fx + 30}" y="${fy + 40}" width="16" height="24" fill="none" stroke="white" stroke-width="1" opacity="0.4" rx="1"/>

        <!-- First base -->
        <rect x="${fx - 10}" y="${fy - 10}" width="20" height="20" rx="2" transform="rotate(45, ${fx}, ${fy})"
              fill="${first ? teamColor : 'white'}" stroke="${first ? 'white' : '#888'}" stroke-width="${first ? 2.5 : 1.5}"/>

        <!-- Second base -->
        <rect x="${sx - 10}" y="${sy - 10}" width="20" height="20" rx="2" transform="rotate(45, ${sx}, ${sy})"
              fill="${second ? teamColor : 'white'}" stroke="${second ? 'white' : '#888'}" stroke-width="${second ? 2.5 : 1.5}"/>

        <!-- Third base -->
        <rect x="${tx - 10}" y="${ty - 10}" width="20" height="20" rx="2" transform="rotate(45, ${tx}, ${ty})"
              fill="${third ? teamColor : 'white'}" stroke="${third ? 'white' : '#888'}" stroke-width="${third ? 2.5 : 1.5}"/>

        <!-- Base labels when empty -->
        ${!first ? `<text x="${fx + 22}" y="${fy + 24}" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">1B</text>` : ''}
        ${!second ? `<text x="${sx}" y="${sy - 20}" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">2B</text>` : ''}
        ${!third ? `<text x="${tx - 22}" y="${ty + 24}" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">3B</text>` : ''}
        <text x="${hx}" y="${hy + 48}" font-size="11" fill="${labelColor}" text-anchor="middle" opacity="0.7">HOME</text>

        <!-- Runners -->
        ${renderRunner(fx, fy, first, fx + 50, fy - 8)}
        ${renderRunner(sx, sy, second, sx, sy - 30)}
        ${renderRunner(tx, ty, third, tx - 50, ty - 8)}
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
