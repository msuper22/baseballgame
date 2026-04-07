/**
 * Renders an SVG baseball diamond with runners, team name, and stats.
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

  const firstClass = first ? 'base occupied' : 'base';
  const secondClass = second ? 'base occupied' : 'base';
  const thirdClass = third ? 'base occupied' : 'base';

  const teamColor = getTeamColor(state.team_id);

  container.innerHTML = `
    <div class="diamond-card" style="--team-color: ${teamColor}">
      <h3 class="diamond-team-name">${teamName}</h3>
      <svg viewBox="0 0 300 280" class="diamond-svg">
        <!-- Outfield grass -->
        <path d="M 150 30 Q 280 80 270 200 L 150 250 L 30 200 Q 20 80 150 30 Z" fill="#2d8a4e" opacity="0.3"/>

        <!-- Infield diamond -->
        <polygon points="150,60 230,150 150,240 70,150" fill="#c4a35a" opacity="0.4" stroke="#8b7332" stroke-width="1.5"/>

        <!-- Base paths -->
        <line x1="150" y1="240" x2="230" y2="150" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="230" y1="150" x2="150" y2="60" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="150" y1="60" x2="70" y2="150" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="70" y1="150" x2="150" y2="240" stroke="white" stroke-width="2" opacity="0.6"/>

        <!-- Pitcher's mound -->
        <circle cx="150" cy="155" r="6" fill="#c4a35a" stroke="#8b7332" stroke-width="1"/>

        <!-- Home plate -->
        <polygon points="150,240 143,233 143,227 157,227 157,233" fill="white" stroke="#666" stroke-width="1"/>

        <!-- First base -->
        <rect x="220" y="140" width="20" height="20" rx="2" transform="rotate(45, 230, 150)"
              class="${firstClass}" fill="${first ? teamColor : 'white'}" stroke="#666" stroke-width="1.5"/>
        ${first ? `<text x="258" y="148" class="runner-name" text-anchor="start" font-size="11" fill="white">${first}</text>` : ''}

        <!-- Second base -->
        <rect x="140" y="50" width="20" height="20" rx="2" transform="rotate(45, 150, 60)"
              class="${secondClass}" fill="${second ? teamColor : 'white'}" stroke="#666" stroke-width="1.5"/>
        ${second ? `<text x="150" y="38" class="runner-name" text-anchor="middle" font-size="11" fill="white">${second}</text>` : ''}

        <!-- Third base -->
        <rect x="60" y="140" width="20" height="20" rx="2" transform="rotate(45, 70, 150)"
              class="${thirdClass}" fill="${third ? teamColor : 'white'}" stroke="#666" stroke-width="1.5"/>
        ${third ? `<text x="42" y="148" class="runner-name" text-anchor="end" font-size="11" fill="white">${third}</text>` : ''}

        <!-- Labels -->
        <text x="240" y="175" font-size="9" fill="#ccc" text-anchor="middle">1B</text>
        <text x="150" y="80" font-size="9" fill="#ccc" text-anchor="middle">2B</text>
        <text x="60" y="175" font-size="9" fill="#ccc" text-anchor="middle">3B</text>
        <text x="150" y="264" font-size="9" fill="#ccc" text-anchor="middle">HOME</text>
      </svg>
      <div class="diamond-stats">
        <div class="stat">
          <span class="stat-value">${runs}</span>
          <span class="stat-label">Runs</span>
        </div>
        <div class="stat">
          <span class="stat-value">${totalBases}</span>
          <span class="stat-label">Total Bases</span>
        </div>
        <div class="stat">
          <span class="stat-value">${[first, second, third].filter(Boolean).length}</span>
          <span class="stat-label">On Base</span>
        </div>
      </div>
    </div>`;
}

const TEAM_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];

function getTeamColor(teamId) {
  if (!teamId) return TEAM_COLORS[0];
  return TEAM_COLORS[(teamId - 1) % TEAM_COLORS.length];
}
