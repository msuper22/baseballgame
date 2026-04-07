import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { authRoutes } from './routes/auth';
import { teamRoutes } from './routes/teams';
import { playerRoutes } from './routes/players';
import { seriesRoutes } from './routes/series';
import { atBatRoutes } from './routes/at-bats';
import { statsRoutes } from './routes/stats';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api/teams', teamRoutes);
app.route('/api/players', playerRoutes);
app.route('/api/series', seriesRoutes);
app.route('/api/at-bats', atBatRoutes);
app.route('/api/stats', statsRoutes);

export const onRequest = app.fetch;
