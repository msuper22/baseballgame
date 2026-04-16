import { Context, Next } from 'hono';
import { Env, JwtPayload } from '../types';
import { verifyToken } from '../services/auth';

// Extend Hono context with user info
declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export async function authRequired(c: Context<{ Bindings: Env }>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = header.slice(7);
  const secret = c.env.JWT_SECRET || 'dev-secret-change-in-production';
  const payload = await verifyToken(token, secret);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('user', payload);
  await next();
}

export async function modRequired(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user');
  if (user.role !== 'mod' && user.role !== 'admin') {
    return c.json({ error: 'Mod or admin access required' }, 403);
  }
  await next();
}

export async function adminRequired(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
}

export async function captainRequired(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user');
  if (!user.is_captain && user.role !== 'admin') {
    return c.json({ error: 'Team captain or admin access required' }, 403);
  }
  await next();
}
