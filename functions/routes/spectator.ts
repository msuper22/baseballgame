import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired } from '../middleware/auth';
import { getGameStateWithNames } from '../services/game-engine';

export const spectatorRoutes = new Hono<{ Bindings: Env }>();

// List all active games for spectating
spectatorRoutes.get('/games', authRequired, async (c) => {
  const games = await c.env.DB.prepare(`
    SELECT g.*, ht.name as home_team_name, at2.name as away_team_name
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at2 ON g.away_team_id = at2.id
    WHERE g.status = 'active'
    ORDER BY g.started_at DESC
  `).all();

  return c.json({ games: games.results });
});

// Get full game state for spectating
spectatorRoutes.get('/games/:id', authRequired, async (c) => {
  const id = parseInt(c.req.param('id') as string);
  const state = await getGameStateWithNames(c.env.DB, id);
  if (!state) return c.json({ error: 'Game not found' }, 404);

  // Get recent plays for this game
  const recentPlays = await c.env.DB.prepare(`
    SELECT ab.*, p.display_name as player_name, t.name as team_name
    FROM at_bats ab
    JOIN players p ON ab.player_id = p.id
    JOIN teams t ON ab.team_id = t.id
    WHERE ab.game_id = ?
    ORDER BY ab.created_at DESC LIMIT 20
  `).bind(id).all();

  return c.json({ ...state, recent_plays: recentPlays.results });
});

// Send chat message
spectatorRoutes.post('/games/:id/chat', authRequired, async (c) => {
  const gameId = parseInt(c.req.param('id') as string);
  const user = c.get('user');
  const { message } = await c.req.json();

  if (!message || message.trim().length === 0) {
    return c.json({ error: 'Message required' }, 400);
  }

  const trimmed = message.trim().slice(0, 200);

  // Rate limit: 1 message per 3 seconds
  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM chat_messages WHERE player_id = ? AND created_at > datetime('now', '-3 seconds')"
  ).bind(user.sub).first<{cnt: number}>();
  if (recent && recent.cnt > 0) {
    return c.json({ error: 'Please wait a few seconds between messages' }, 429);
  }

  await c.env.DB.prepare(
    'INSERT INTO chat_messages (game_id, player_id, message) VALUES (?, ?, ?)'
  ).bind(gameId, user.sub, trimmed).run();

  return c.json({ success: true }, 201);
});

// Delete chat message (mod+)
spectatorRoutes.delete('/chat/:messageId', authRequired, async (c) => {
  const user = c.get('user');
  if (user.role !== 'mod' && user.role !== 'admin') {
    return c.json({ error: 'Mod access required' }, 403);
  }
  const messageId = c.req.param('messageId') as string;
  await c.env.DB.prepare('DELETE FROM chat_messages WHERE id = ?').bind(messageId).run();
  return c.json({ success: true });
});

// Get chat messages (polling)
spectatorRoutes.get('/games/:id/chat', authRequired, async (c) => {
  const gameId = parseInt(c.req.param('id') as string);
  const since = c.req.query('since');

  let query = `SELECT cm.*, p.display_name as player_name
               FROM chat_messages cm
               JOIN players p ON cm.player_id = p.id
               WHERE cm.game_id = ?`;
  const params: any[] = [gameId];

  if (since) {
    query += ' AND cm.created_at > ?';
    params.push(since);
  }

  query += ' ORDER BY cm.created_at DESC LIMIT 50';

  const messages = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ messages: messages.results.reverse() });
});

// Send emoji reaction
spectatorRoutes.post('/games/:id/react', authRequired, async (c) => {
  const gameId = parseInt(c.req.param('id') as string);
  const user = c.get('user');
  const { emoji } = await c.req.json();

  if (!emoji) return c.json({ error: 'emoji required' }, 400);

  await c.env.DB.prepare(
    'INSERT INTO reactions (game_id, player_id, emoji) VALUES (?, ?, ?)'
  ).bind(gameId, user.sub, emoji).run();

  return c.json({ success: true }, 201);
});

// Get recent reactions (last 30 seconds for animation)
spectatorRoutes.get('/games/:id/reactions', authRequired, async (c) => {
  const gameId = parseInt(c.req.param('id') as string);

  const reactions = await c.env.DB.prepare(`
    SELECT r.*, p.display_name as player_name
    FROM reactions r
    JOIN players p ON r.player_id = p.id
    WHERE r.game_id = ? AND r.created_at > datetime('now', '-30 seconds')
    ORDER BY r.created_at DESC LIMIT 50
  `).bind(gameId).all();

  return c.json({ reactions: reactions.results });
});
