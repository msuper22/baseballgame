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
import { initTheme } from './theme.js';
import './style.css';

// Init theme before anything renders
initTheme();

// Register routes
route('/', dashboardPage);
route('/login', loginPage);
route('/register', registerPage);
route('/team/:id', teamPage);
route('/leaderboard', leaderboardPage);
route('/history', historyPage);
route('/series/:id', seriesDetailPage);
route('/log-event', logEventPage);
route('/admin', adminPage);

// Init
renderNav();
startRouter();

// Re-render nav on route changes
window.addEventListener('hashchange', () => renderNav());
