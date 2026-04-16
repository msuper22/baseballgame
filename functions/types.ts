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
  is_captain: number;
  created_at: string;
}

export interface Series {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
  is_locked: number;
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
  game_id: number | null;
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
  is_captain: boolean;
  iat: number;
  exp: number;
}

export type GameStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type TournamentStatus = 'draft' | 'active' | 'completed';
export type TournamentFormat = 'round_robin';

export interface Tournament {
  id: number;
  name: string;
  series_id: number;
  format: TournamentFormat;
  status: TournamentStatus;
  start_date: string;
  end_date: string;
  created_by: number;
  created_at: string;
}

export interface Game {
  id: number;
  tournament_id: number | null;
  series_id: number;
  home_team_id: number;
  away_team_id: number;
  scheduled_date: string;
  scheduled_time: string | null;
  status: GameStatus;
  home_runs: number;
  away_runs: number;
  home_bases: number;
  away_bases: number;
  winner_team_id: number | null;
  round: number | null;
  game_number: number | null;
  created_at: string;
}

export interface GameBaseState {
  id: number;
  game_id: number;
  team_id: number;
  first_base: number | null;
  second_base: number | null;
  third_base: number | null;
  total_runs: number;
  total_bases: number;
}

export interface Challenge {
  id: number;
  series_id: number;
  challenger_team_id: number;
  challenged_team_id: number;
  challenger_captain_id: number;
  proposed_date: string;
  proposed_time: string | null;
  message: string | null;
  status: ChallengeStatus;
  responded_by: number | null;
  responded_at: string | null;
  game_id: number | null;
  expires_at: string;
  created_at: string;
}

export interface TournamentStanding {
  id: number;
  tournament_id: number;
  team_id: number;
  wins: number;
  losses: number;
  ties: number;
  runs_for: number;
  runs_against: number;
  games_played: number;
}
