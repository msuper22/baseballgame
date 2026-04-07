import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { JwtPayload } from '../types';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { ...payload, sub: String(payload.sub), iat: now, exp: now + TOKEN_EXPIRY } as any,
    secret
  );
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const valid = await jwt.verify(token, secret);
    if (!valid) return null;
    const { payload } = jwt.decode(token);
    const p = payload as any;
    return { ...p, sub: Number(p.sub) } as JwtPayload;
  } catch {
    return null;
  }
}
