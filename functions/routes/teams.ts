import { Hono } from 'hono';
import { Env } from '../types';
import { authRequired, adminRequired } from '../middleware/auth';

export const teamRoutes = new Hono<{ Bindings: Env }>();

// List all teams
teamRoutes.get('/', authRequired, async (c) => {
  const teams = await c.env.DB.prepare(
    `SELECT t.*, COUNT(p.id) as player_count
     FROM teams t LEFT JOIN players p ON p.team_id = t.id AND p.is_active = 1
     GROUP BY t.id ORDER BY t.name`
  ).all();
  return c.json({ teams: teams.results });
});

// Get single team
teamRoutes.get('/:id', authRequired, async (c) => {
  const id = c.req.param('id');
  const team = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first();
  if (!team) return c.json({ error: 'Team not found' }, 404);
  return c.json({ team });
});

// Create team (admin)
teamRoutes.post('/', authRequired, adminRequired, async (c) => {
  const { name } = await c.req.json();
  if (!name) return c.json({ error: 'Team name required' }, 400);

  const invite_code = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO teams (name, invite_code) VALUES (?, ?)'
    ).bind(name, invite_code).run();

    return c.json({
      team: { id: result.meta.last_row_id, name, invite_code },
    }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ error: 'Team name already exists' }, 400);
    }
    throw e;
  }
});

// Update team (admin)
teamRoutes.put('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const { name } = await c.req.json();
  if (!name) return c.json({ error: 'Team name required' }, 400);

  await c.env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(name, id).run();
  return c.json({ success: true });
});

// Delete team (admin) — cascades through all team-related data
teamRoutes.delete('/:id', authRequired, adminRequired, async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  // Null out nullable references
  await db.prepare('UPDATE games SET winner_team_id = NULL WHERE winner_team_id = ?').bind(id).run();
  await db.prepare('UPDATE players SET team_id = NULL WHERE team_id = ?').bind(id).run();

  // Delete rows that reference games involving this team (must precede games delete)
  const gameFilter = '(SELECT id FROM games WHERE home_team_id = ?1 OR away_team_id = ?1)';
  await db.prepare(`DELETE FROM chat_messages WHERE game_id IN ${gameFilter}`).bind(id).run();
  await db.prepare(`DELETE FROM reactions WHERE game_id IN ${gameFilter}`).bind(id).run();
  await db.prepare(`DELETE FROM half_innings WHERE game_id IN ${gameFilter}`).bind(id).run();
  await db.prepare(`DELETE FROM game_base_state WHERE game_id IN ${gameFilter}`).bind(id).run();

  // at_bats: delete by direct team_id or by game_id on deleted games
  await db.prepare(`DELETE FROM at_bats WHERE team_id = ?1 OR game_id IN ${gameFilter}`).bind(id).run();

  // Challenges reference team directly and may also reference a game
  await db.prepare(
    `DELETE FROM challenges WHERE challenger_team_id = ?1 OR challenged_team_id = ?1 OR game_id IN ${gameFilter}`
  ).bind(id).run();

  // Team-scoped standings / base state
  await db.prepare('DELETE FROM tournament_standings WHERE team_id = ?').bind(id).run();
  await db.prepare('DELETE FROM base_state WHERE team_id = ?').bind(id).run();

  // Now safe to delete games, then the team
  await db.prepare('DELETE FROM games WHERE home_team_id = ? OR away_team_id = ?').bind(id, id).run();
  await db.prepare('DELETE FROM teams WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});
