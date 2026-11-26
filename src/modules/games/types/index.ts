export type GameId = 'ludo' | 'tic-tac-toe' | 'chess';

export interface CatalogueGame {
  id: GameId | string;
  slug: string;
  title: string;
  description: string;
  category: string;
  min_players: number;
  max_players: number;
  supports_solo: boolean;
  supports_online: boolean;
  status: string;
  instructions: string;
  play_count: number;
}

export interface GamesPlayer {
  user_id: string;
  xp: number;
  level: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_streak: number;
  best_streak: number;
  favourite_game_id: string | null;
}

export interface GameRoom {
  id: string;
  game_id: string;
  host_id: string;
  code: string;
  is_private: boolean;
  status: string;
  max_slots: number;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface RoomPlayer {
  room_id: string;
  user_id: string;
  seat: number;
  is_ready: boolean;
  is_host: boolean;
}

export interface GameMatch {
  id: string;
  room_id: string | null;
  game_id: string;
  mode: 'solo' | 'local' | 'online';
  status: string;
  state: Record<string, unknown>;
  winner_id: string | null;
  is_draw: boolean;
  started_at: string;
  ended_at: string | null;
  created_by: string;
  version?: number;
  updated_at?: string;
}
