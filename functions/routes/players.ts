import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, adminRequired } from '../middleware/auth';
import { hashPassword } from '../services/auth';

export const playerRoutes = new Hono<{ Bindings: Env }>();

// List all players (optionally filter by team)
playerRoutes.get('/', authRequired, async (c) => {
  const teamId = c.req.query('team_id');
  let query = `SELECT p.id, p.username, p.display_name, p.team_id, p.role, p.is_active, p.is_captain, t.name as team_name
               FROM players p LEFT JOIN teams t ON p.team_id = t.id`;
  const params: any[] = [];

  if (teamId) {
    query += ' WHERE p.team_id = ?';
    params.push(teamId);
  }
  query += ' ORDER BY p.display_name';

  const stmt = params.length
    ? c.env.DB.prepare(query).bind(...params)
    : c.env.DB.prepare(query);
  const players = await stmt.all();
  return c.json({ players: players.results });
});

// Admin create player
playerRoutes.post('/', authRequired, adminRequired, async (c) => {
  const { username, password, display_name, team_id, role } = await c.req.json();
  if (!username || !password || !display_name) {
    return c.json({ error: 'username, password, display_name required' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM players WHERE username = ?'
  ).bind(username).first();
  if (existing) return c.json({ error: 'Username already taken' }, 400);

  const hashed = await hashPassword(password);
  const playerRole = role || 'player';

  const result = await c.env.DB.prepare(
    'INSERT INTO players (username, password, display_name, team_id, role) VALUES (?, ?, ?, ?, ?)'
  ).bind(username, hashed, display_name, team_id || null, playerRole).run();

  return c.json({
    player: { id: result.meta.last_row_id, username, display_name, team_id, role: playerRole },
  }, 201);
});

// Update player (admin)
playerRoutes.put('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updates: string[] = [];
  const values: any[] = [];

  if (body.display_name !== undefined) { updates.push('display_name = ?'); values.push(body.display_name); }
  if (body.team_id !== undefined) { updates.push('team_id = ?'); values.push(body.team_id); }
  if (body.role !== undefined) { updates.push('role = ?'); values.push(body.role); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active); }
  if (body.is_captain !== undefined) { updates.push('is_captain = ?'); values.push(body.is_captain); }
  if (body.password) {
    const hashed = await hashPassword(body.password);
    updates.push('password = ?');
    values.push(hashed);
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE players SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true });
});

// Bulk import players (admin)
playerRoutes.post('/bulk', authRequired, adminRequired, async (c) => {
  const { players } = await c.req.json();
  if (!Array.isArray(players) || !players.length) {
    return c.json({ error: 'players array required' }, 400);
  }

  const results: { display_name: string; status: string; error?: string }[] = [];

  for (const p of players) {
    if (!p.username || !p.display_name || !p.team_id) {
      results.push({ display_name: p.display_name || 'unknown', status: 'error', error: 'Missing required fields' });
      continue;
    }

    try {
      const existing = await c.env.DB.prepare('SELECT id FROM players WHERE username = ?').bind(p.username).first();
      if (existing) {
        results.push({ display_name: p.display_name, status: 'skipped', error: 'Username exists' });
        continue;
      }

      const password = p.password || p.username; // Default password = username
      const hashed = await hashPassword(password);
      await c.env.DB.prepare(
        'INSERT INTO players (username, password, display_name, team_id, role) VALUES (?, ?, ?, ?, ?)'
      ).bind(p.username, hashed, p.display_name, p.team_id, p.role || 'player').run();

      results.push({ display_name: p.display_name, status: 'created' });
    } catch (e: any) {
      results.push({ display_name: p.display_name, status: 'error', error: e.message });
    }
  }

  return c.json({
    results,
    summary: {
      created: results.filter(r => r.status === 'created').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
    },
  });
});

// Delete (deactivate) player (admin)
playerRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE players SET is_active = 0 WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// Generate a one-time password reset link for a player (admin only).
// Token is 32 hex chars, valid for 24 hours, single-use. Admin shares the
// returned URL with the player; the public reset page consumes it.
playerRoutes.post('/:id/reset-link', authRequired, adminRequired, async (c) => {
  const id = parseInt(c.req.param('id'));
  const admin = c.get('user');

  const player = await c.env.DB.prepare(
    'SELECT id, display_name FROM players WHERE id = ? AND is_active = 1'
  ).bind(id).first<{ id: number; display_name: string }>();
  if (!player) return c.json({ error: 'Player not found or inactive' }, 404);

  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  const token = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO password_reset_tokens (token, player_id, created_by, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, id, admin.sub, expiresAt).run();

  const origin = new URL(c.req.url).origin;
  return c.json({
    token,
    expires_at: expiresAt,
    url: `${origin}/#/reset/${token}`,
    player: { id: player.id, display_name: player.display_name },
  });
});
