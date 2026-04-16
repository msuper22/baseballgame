import { route, startRouter } from './router.js';
import { renderNav } from './components/nav.js';
import { loginPage } from './pages/login.js';
import { registerPage } from './pages/register.js';
import { dashboardPage } from './pages/dashboard.js';
import { teamPage } from './pages/team.js';
import { leaderboardPage } from './pages/leaderboard.js';
import { logEventPage } from './pages/log-event.js';
import { adminPage } from './pages/admin.js';
import { historyPage } from './pages/history.js';
import { seriesDetailPage } from './pages/series-detail.js';
import { rulesPage } from './pages/rules.js';
import { playerPage } from './pages/player.js';
import { comparePage } from './pages/compare.js';
import { schedulePage } from './pages/schedule.js';
import { gamePage } from './pages/game.js';
import { challengesPage } from './pages/challenges.js';
import { tournamentPage } from './pages/tournament.js';
import { initTheme } from './theme.js';
import './style.css';

// Init theme before anything renders
initTheme();

// Register routes
route('/', dashboardPage);
route('/login', loginPage);
route('/register', registerPage);
route('/team/:id', teamPage);
route('/player/:id', playerPage);
route('/leaderboard', leaderboardPage);
route('/history', historyPage);
route('/rules', rulesPage);
route('/series/:id', seriesDetailPage);
route('/log-event', logEventPage);
route('/compare', comparePage);
route('/schedule', schedulePage);
route('/game/:id', gamePage);
route('/challenges', challengesPage);
route('/tournament/:id', tournamentPage);
route('/admin', adminPage);

// Init
renderNav();
startRouter();

// Re-render nav on route changes
window.addEventListener('hashchange', () => renderNav());
