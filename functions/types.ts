export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export interface Team {
  id: number;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface Player {
  id: number;
  username: string;
  password: string;
  display_name: string;
  team_id: number | null;
  role: 'player' | 'mod' | 'admin';
  is_active: number;
  created_at: string;
}

export interface Series {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
  created_at: string;
}

export interface AtBat {
  id: number;
  series_id: number;
  player_id: number;
  team_id: number;
  hit_type: 'single' | 'double' | 'triple' | 'home_run';
  bases: number;
  runs_scored: number;
  description: string | null;
  entered_by: number | null;
  created_at: string;
}

export interface BaseState {
  id: number;
  series_id: number;
  team_id: number;
  first_base: number | null;
  second_base: number | null;
  third_base: number | null;
  total_runs: number;
  total_bases: number;
}

export type HitType = 'single' | 'double' | 'triple' | 'home_run';

export const HIT_BASES: Record<HitType, number> = {
  single: 1,
  double: 2,
  triple: 3,
  home_run: 4,
};

export interface JwtPayload {
  sub: number;
  role: string;
  team_id: number | null;
  iat: number;
  exp: number;
}
