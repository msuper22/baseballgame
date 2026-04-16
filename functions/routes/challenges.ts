import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, captainRequired } from '../middleware/auth';
import { logAudit } from '../services/audit';

export const challengeRoutes = new Hono<{ Bindings: Env }>();

// List challenges for current user's team
challengeRoutes.get('/', authRequired, async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');

  if (!user.team_id) return c.json({ challenges: [] });

  // Expire any pending challenges past their deadline
  await c.env.DB.prepare(
    `UPDATE challenges SET status = 'expired'
     WHERE status = 'pending' AND expires_at < datetime('now')`
  ).run();

  let query = `SELECT ch.*,
    ct.name as challenger_team_name, cdt.name as challenged_team_name,
    cp.display_name as challenger_captain_name,
    rp.display_name as responded_by_name
    FROM challenges ch
    JOIN teams ct ON ch.challenger_team_id = ct.id
    JOIN teams cdt ON ch.challenged_team_id = cdt.id
    JOIN players cp ON ch.challenger_captain_id = cp.id
    LEFT JOIN players rp ON ch.responded_by = rp.id
    WHERE (ch.challenger_team_id = ? OR ch.challenged_team_id = ?)`;
  const params: any[] = [user.team_id, user.team_id];

  if (status) {
    query += ' AND ch.status = ?';
    params.push(status);
  }

  query += ' ORDER BY ch.created_at DESC';

  const challenges = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ challenges: challenges.results });
});

// Get count of pending incoming challenges
challengeRoutes.get('/pending-count', authRequired, async (c) => {
  const user = c.get('user');
  if (!user.team_id) return c.json({ count: 0 });

  // Expire old challenges first
  await c.env.DB.prepare(
    `UPDATE challenges SET status = 'expired'
     WHERE status = 'pending' AND expires_at < datetime('now')`
  ).run();

  const result = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM challenges
     WHERE challenged_team_id = ? AND status = 'pending'`
  ).bind(user.team_id).first<{ count: number }>();

  return c.json({ count: result?.count || 0 });
});

// Create a challenge (captain or admin)
challengeRoutes.post('/', authRequired, captainRequired, async (c) => {
  const user = c.get('user');
  const { challenged_team_id, proposed_date, proposed_time, message } = await c.req.json();

  if (!challenged_team_id || !proposed_date) {
    return c.json({ error: 'challenged_team_id and proposed_date required' }, 400);
  }

  if (!user.team_id) {
    return c.json({ error: 'You must be on a team to send challenges' }, 400);
  }

  if (challenged_team_id === user.team_id) {
    return c.json({ error: 'Cannot challenge your own team' }, 400);
  }

  // Check for active series
  const series = await c.env.DB.prepare(
    'SELECT id FROM series WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).first<{ id: number }>();
  if (!series) return c.json({ error: 'No active series' }, 400);

  // Check for existing pending challenge between these teams
  const existing = await c.env.DB.prepare(
    `SELECT id FROM challenges
     WHERE status = 'pending'
     AND ((challenger_team_id = ? AND challenged_team_id = ?) OR (challenger_team_id = ? AND challenged_team_id = ?))`
  ).bind(user.team_id, challenged_team_id, challenged_team_id, user.team_id).first();

  if (existing) {
    return c.json({ error: 'There is already a pending challenge between these teams' }, 400);
  }

  // Check for scheduling conflicts
  const conflict = await c.env.DB.prepare(
    `SELECT id FROM games
     WHERE series_id = ? AND scheduled_date = ?
     AND status NOT IN ('cancelled', 'completed')
     AND (home_team_id IN (?, ?) OR away_team_id IN (?, ?))`
  ).bind(series.id, proposed_date, user.team_id, challenged_team_id, user.team_id, challenged_team_id).first();

  if (conflict) {
    return c.json({ error: 'One of the teams already has a game scheduled on this date' }, 400);
  }

  // 48-hour expiry
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  const result = await c.env.DB.prepare(
    `INSERT INTO challenges (series_id, challenger_team_id, challenged_team_id, challenger_captain_id,
     proposed_date, proposed_time, message, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(
    series.id, user.team_id, challenged_team_id, user.sub,
    proposed_date, proposed_time || null, message || null, expiresAt
  ).run();

  await logAudit(c.env.DB, user.sub, 'create_challenge', 'challenge', result.meta.last_row_id as number,
    `Challenged team ${challenged_team_id} for ${proposed_date}`);

  return c.json({
    challenge: { id: result.meta.last_row_id, status: 'pending', expires_at: expiresAt },
  }, 201);
});

// Accept challenge (captain of challenged team)
challengeRoutes.put('/:id/accept', authRequired, captainRequired, async (c) => {
  const id = parseInt(c.req.param('id') as string);
  const user = c.get('user');

  const challenge = await c.env.DB.prepare(
    'SELECT * FROM challenges WHERE id = ?'
  ).bind(id).first<any>();

  if (!challenge) return c.json({ error: 'Challenge not found' }, 404);
  if (challenge.status !== 'pending') {
    return c.json({ error: `Challenge is already ${challenge.status}` }, 400);
  }

  // Verify user is captain of the challenged team (or admin)
  if (user.role !== 'admin' && user.team_id !== challenge.challenged_team_id) {
    return c.json({ error: 'Only the challenged team captain can accept' }, 403);
  }

  // Check expiration
  if (new Date(challenge.expires_at + 'Z') < new Date()) {
    await c.env.DB.prepare("UPDATE challenges SET status = 'expired' WHERE id = ?").bind(id).run();
    return c.json({ error: 'Challenge has expired' }, 400);
  }

  // Check for scheduling conflicts again
  const conflict = await c.env.DB.prepare(
    `SELECT id FROM games
     WHERE series_id = ? AND scheduled_date = ?
     AND status NOT IN ('cancelled', 'completed')
     AND (home_team_id IN (?, ?) OR away_team_id IN (?, ?))`
  ).bind(
    challenge.series_id, challenge.proposed_date,
    challenge.challenger_team_id, challenge.challenged_team_id,
    challenge.challenger_team_id, challenge.challenged_team_id
  ).first();

  if (conflict) {
    return c.json({ error: 'A scheduling conflict now exists for this date' }, 400);
  }

  // Create the game
  const gameResult = await c.env.DB.prepare(
    `INSERT INTO games (series_id, home_team_id, away_team_id, scheduled_date, scheduled_time, status)
     VALUES (?, ?, ?, ?, ?, 'scheduled')`
  ).bind(
    challenge.series_id, challenge.challenger_team_id, challenge.challenged_team_id,
    challenge.proposed_date, challenge.proposed_time
  ).run();

  const gameId = gameResult.meta.last_row_id as number;

  // Create base state rows for both teams
  await c.env.DB.prepare('INSERT INTO game_base_state (game_id, team_id) VALUES (?, ?)').bind(gameId, challenge.challenger_team_id).run();
  await c.env.DB.prepare('INSERT INTO game_base_state (game_id, team_id) VALUES (?, ?)').bind(gameId, challenge.challenged_team_id).run();

  // Update the challenge
  await c.env.DB.prepare(
    `UPDATE challenges SET status = 'accepted', responded_by = ?, responded_at = datetime('now'), game_id = ?
     WHERE id = ?`
  ).bind(user.sub, gameId, id).run();

  await logAudit(c.env.DB, user.sub, 'accept_challenge', 'challenge', id,
    `Accepted challenge, created game ${gameId}`);

  return c.json({ success: true, game_id: gameId });
});

// Decline challenge
challengeRoutes.put('/:id/decline', authRequired, captainRequired, async (c) => {
  const id = parseInt(c.req.param('id') as string);
  const user = c.get('user');

  const challenge = await c.env.DB.prepare(
    'SELECT * FROM challenges WHERE id = ?'
  ).bind(id).first<any>();

  if (!challenge) return c.json({ error: 'Challenge not found' }, 404);
  if (challenge.status !== 'pending') {
    return c.json({ error: `Challenge is already ${challenge.status}` }, 400);
  }

  if (user.role !== 'admin' && user.team_id !== challenge.challenged_team_id) {
    return c.json({ error: 'Only the challenged team captain can decline' }, 403);
  }

  await c.env.DB.prepare(
    `UPDATE challenges SET status = 'declined', responded_by = ?, responded_at = datetime('now')
     WHERE id = ?`
  ).bind(user.sub, id).run();

  await logAudit(c.env.DB, user.sub, 'decline_challenge', 'challenge', id, 'Declined challenge');

  return c.json({ success: true });
});

// Cancel own outgoing challenge
challengeRoutes.put('/:id/cancel', authRequired, captainRequired, async (c) => {
  const id = parseInt(c.req.param('id') as string);
  const user = c.get('user');

  const challenge = await c.env.DB.prepare(
    'SELECT * FROM challenges WHERE id = ?'
  ).bind(id).first<any>();

  if (!challenge) return c.json({ error: 'Challenge not found' }, 404);
  if (challenge.status !== 'pending') {
    return c.json({ error: `Challenge is already ${challenge.status}` }, 400);
  }

  if (user.role !== 'admin' && user.team_id !== challenge.challenger_team_id) {
    return c.json({ error: 'Only the challenger team captain can cancel' }, 403);
  }

  await c.env.DB.prepare(
    `UPDATE challenges SET status = 'cancelled', responded_by = ?, responded_at = datetime('now')
     WHERE id = ?`
  ).bind(user.sub, id).run();

  await logAudit(c.env.DB, user.sub, 'cancel_challenge', 'challenge', id, 'Cancelled challenge');

  return c.json({ success: true });
});
