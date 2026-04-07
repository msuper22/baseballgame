import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, adminRequired } from '../middleware/auth';

export const seriesRoutes = new Hono<{ Bindings: Env }>();

// List all series
seriesRoutes.get('/', authRequired, async (c) => {
  const series = await c.env.DB.prepare(
    'SELECT * FROM series ORDER BY created_at DESC'
  ).all();
  return c.json({ series: series.results });
});

// Get active series
seriesRoutes.get('/active', authRequired, async (c) => {
  const series = await c.env.DB.prepare(
    'SELECT * FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).first();
  if (!series) return c.json({ error: 'No active series' }, 404);
  return c.json({ series });
});

// Create series (admin)
seriesRoutes.post('/', authRequired, adminRequired, async (c) => {
  const { name, start_date, end_date } = await c.req.json();
  if (!name || !start_date || !end_date) {
    return c.json({ error: 'name, start_date, end_date required' }, 400);
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO series (name, start_date, end_date) VALUES (?, ?, ?)'
  ).bind(name, start_date, end_date).run();

  // Initialize base_state for all teams
  const teams = await c.env.DB.prepare('SELECT id FROM teams').all();
  const seriesId = result.meta.last_row_id;

  for (const team of teams.results as any[]) {
    await c.env.DB.prepare(
      'INSERT INTO base_state (series_id, team_id) VALUES (?, ?)'
    ).bind(seriesId, team.id).run();
  }

  return c.json({ series: { id: seriesId, name, start_date, end_date, is_active: 1 } }, 201);
});

// Delete series (admin) - cascades to at_bats and base_state
seriesRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');

  const series = await c.env.DB.prepare('SELECT id FROM series WHERE id = ?').bind(id).first();
  if (!series) return c.json({ error: 'Series not found' }, 404);

  // Delete associated data first, then the series
  await c.env.DB.prepare('DELETE FROM at_bats WHERE series_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM base_state WHERE series_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM series WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// Update series (admin)
seriesRoutes.put('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.start_date !== undefined) { updates.push('start_date = ?'); values.push(body.start_date); }
  if (body.end_date !== undefined) { updates.push('end_date = ?'); values.push(body.end_date); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active); }
  if (body.is_locked !== undefined) { updates.push('is_locked = ?'); values.push(body.is_locked); }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE series SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true });
});
