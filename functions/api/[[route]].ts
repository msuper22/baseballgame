import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/cloudflare-pages';
import { Env } from '../types';
import { authRoutes } from '../routes/auth';
import { teamRoutes } from '../routes/teams';
import { playerRoutes } from '../routes/players';
import { seriesRoutes } from '../routes/series';
import { atBatRoutes } from '../routes/at-bats';
import { statsRoutes } from '../routes/stats';
import { tournamentRoutes } from '../routes/tournaments';
import { gameRoutes } from '../routes/games';
import { challengeRoutes } from '../routes/challenges';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/auth', authRoutes);
app.route('/teams', teamRoutes);
app.route('/players', playerRoutes);
app.route('/series', seriesRoutes);
app.route('/at-bats', atBatRoutes);
app.route('/stats', statsRoutes);
app.route('/tournaments', tournamentRoutes);
app.route('/games', gameRoutes);
app.route('/challenges', challengeRoutes);

export const onRequest = handle(app);
