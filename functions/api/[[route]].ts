import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from '../types';
import { authRoutes } from '../routes/auth';
import { teamRoutes } from '../routes/teams';
import { playerRoutes } from '../routes/players';
import { seriesRoutes } from '../routes/series';
import { atBatRoutes } from '../routes/at-bats';
import { statsRoutes } from '../routes/stats';

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

export const onRequest = app.fetch;
