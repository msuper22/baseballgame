import { Hono } from 'hono';
import { Env, Player } from '../types';
import { hashPassword, comparePassword, signToken } from '../services/auth';
import { authRequired } from '../middleware/auth';
import { containsProfanity } from '../services/profanity';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Login
authRoutes.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const player = await c.env.DB.prepare(
    'SELECT * FROM players WHERE username = ? AND is_active = 1'
  ).bind(username).first<Player>();

  if (!player) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await comparePassword(password, player.password);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const secret = c.env.JWT_SECRET || 'dev-secret-change-in-production';
  const token = await signToken(
    { sub: player.id, role: player.role, team_id: player.team_id, is_captain: !!player.is_captain },
    secret
  );

  return c.json({
    token,
    user: {
      id: player.id,
      username: player.username,
      display_name: player.display_name,
      team_id: player.team_id,
      role: player.role,
      is_captain: !!player.is_captain,
    },
  });
});

// Self-register with invite code
authRoutes.post('/register', async (c) => {
  const { username, password, display_name, invite_code } = await c.req.json();
  if (!username || !password || !display_name || !invite_code) {
    return c.json({ error: 'All fields required: username, password, display_name, invite_code' }, 400);
  }

  if (containsProfanity(username) || containsProfanity(display_name)) {
    return c.json({ error: 'Username or display name contains inappropriate language' }, 400);
  }

  // Find team by invite code
  const team = await c.env.DB.prepare(
    'SELECT id, name FROM teams WHERE invite_code = ?'
  ).bind(invite_code).first<{ id: number; name: string }>();

  if (!team) {
    return c.json({ error: 'Invalid invite code' }, 400);
  }

  // Check username uniqueness
  const existing = await c.env.DB.prepare(
    'SELECT id FROM players WHERE username = ?'
  ).bind(username).first();

  if (existing) {
    return c.json({ error: 'Username already taken' }, 400);
  }

  const hashed = await hashPassword(password);
  const result = await c.env.DB.prepare(
    'INSERT INTO players (username, password, display_name, team_id, role) VALUES (?, ?, ?, ?, ?)'
  ).bind(username, hashed, display_name, team.id, 'player').run();

  const secret = c.env.JWT_SECRET || 'dev-secret-change-in-production';
  const playerId = result.meta.last_row_id;
  const token = await signToken(
    { sub: playerId as number, role: 'player', team_id: team.id, is_captain: false },
    secret
  );

  return c.json({
    token,
    user: {
      id: playerId,
      username,
      display_name,
      team_id: team.id,
      role: 'player',
      is_captain: false,
      team_name: team.name,
    },
  });
});

// Register as spectator (no invite code needed)
authRoutes.post('/register-spectator', async (c) => {
  const { username, password, display_name } = await c.req.json();
  if (!username || !password || !display_name) {
    return c.json({ error: 'All fields required: username, password, display_name' }, 400);
  }

  if (containsProfanity(username) || containsProfanity(display_name)) {
    return c.json({ error: 'Username or display name contains inappropriate language' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM players WHERE username = ?'
  ).bind(username).first();

  if (existing) {
    return c.json({ error: 'Username already taken' }, 400);
  }

  const hashed = await hashPassword(password);
  const result = await c.env.DB.prepare(
    'INSERT INTO players (username, password, display_name, team_id, role) VALUES (?, ?, ?, NULL, ?)'
  ).bind(username, hashed, display_name, 'spectator').run();

  const secret = c.env.JWT_SECRET || 'dev-secret-change-in-production';
  const playerId = result.meta.last_row_id;
  const token = await signToken(
    { sub: playerId as number, role: 'spectator', team_id: 0, is_captain: false },
    secret
  );

  return c.json({
    token,
    user: {
      id: playerId,
      username,
      display_name,
      team_id: null,
      role: 'spectator',
      is_captain: false,
    },
  });
});

// Look up a reset token (public). Returns the player's display name if the
// token is valid + unused + unexpired so the reset page can show "Resetting
// password for X". Doesn't reveal anything for invalid tokens.
authRoutes.get('/reset/:token', async (c) => {
  const token = c.req.param('token');
  const row = await c.env.DB.prepare(
    `SELECT t.expires_at, t.used_at, p.display_name, p.username
     FROM password_reset_tokens t
     JOIN players p ON p.id = t.player_id
     WHERE t.token = ? AND p.is_active = 1`
  ).bind(token).first<any>();
  if (!row) return c.json({ error: 'Invalid or expired link' }, 404);
  if (row.used_at) return c.json({ error: 'This link has already been used' }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return c.json({ error: 'This link has expired' }, 400);
  }
  return c.json({ display_name: row.display_name, username: row.username });
});

// Consume a reset token to set a new password (public).
authRoutes.post('/reset', async (c) => {
  const { token, password } = await c.req.json();
  if (!token || !password) return c.json({ error: 'Token and new password required' }, 400);
  if (password.length < 4) return c.json({ error: 'Password must be at least 4 characters' }, 400);

  const row = await c.env.DB.prepare(
    `SELECT t.player_id, t.expires_at, t.used_at
     FROM password_reset_tokens t
     JOIN players p ON p.id = t.player_id
     WHERE t.token = ? AND p.is_active = 1`
  ).bind(token).first<any>();
  if (!row) return c.json({ error: 'Invalid link' }, 404);
  if (row.used_at) return c.json({ error: 'This link has already been used' }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return c.json({ error: 'This link has expired' }, 400);
  }

  const hashed = await hashPassword(password);
  await c.env.DB.prepare('UPDATE players SET password = ? WHERE id = ?').bind(hashed, row.player_id).run();
  await c.env.DB.prepare(
    "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE token = ?"
  ).bind(token).run();

  return c.json({ success: true });
});

// Get current user
authRoutes.get('/me', authRequired, async (c) => {
  const user = c.get('user');
  const player = await c.env.DB.prepare(
    `SELECT p.id, p.username, p.display_name, p.team_id, p.role, p.is_captain, t.name as team_name
     FROM players p LEFT JOIN teams t ON p.team_id = t.id
     WHERE p.id = ?`
  ).bind(user.sub).first();

  if (!player) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user: player });
});
