import { supabase } from '../../../lib/supabase';
import type { CatalogueGame, GameMatch, GameRoom, GamesPlayer, RoomPlayer } from '../types';

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function listCatalogue(): Promise<CatalogueGame[]> {
  const { data, error } = await client()
    .from('games_catalogue')
    .select('*')
    .eq('status', 'active')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as CatalogueGame[];
}

export async function ensurePlayer(): Promise<GamesPlayer | null> {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await client().rpc('games_ensure_player', { p_user: uid });
  if (error) throw error;
  return data as GamesPlayer;
}

export async function getPlayer(userId: string): Promise<GamesPlayer | null> {
  const { data, error } = await client()
    .from('games_players')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as GamesPlayer | null;
}

export async function getLeaderboard(limit = 20): Promise<GamesPlayer[]> {
  const { data, error } = await client()
    .from('games_players')
    .select('*')
    .order('xp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as GamesPlayer[];
}

export async function createRoom(gameId: string, isPrivate = true, maxSlots = 2): Promise<GameRoom> {
  const { data, error } = await client().rpc('games_create_room', {
    p_game_id: gameId,
    p_private: isPrivate,
    p_max_slots: maxSlots,
  });
  if (error) throw error;
  return data as GameRoom;
}

export async function joinRoomByCode(code: string): Promise<GameRoom> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const c = client();
  const { data: room, error } = await c
    .from('games_rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!room) throw new Error('Room not found');
  if (room.status !== 'lobby') throw new Error('Room is not joinable');
  const { count } = await c
    .from('games_room_players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);
  if ((count ?? 0) >= room.max_slots) throw new Error('Room full');
  const seat = count ?? 0;
  const { error: joinErr } = await c.from('games_room_players').insert({
    room_id: room.id,
    user_id: uid,
    seat,
    is_ready: false,
    is_host: false,
  });
  if (joinErr && joinErr.code !== '23505') throw joinErr;
  return room as GameRoom;
}

export async function getRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await client()
    .from('games_room_players')
    .select('*')
    .eq('room_id', roomId)
    .order('seat');
  if (error) throw error;
  return (data ?? []) as RoomPlayer[];
}

export async function setReady(roomId: string, ready: boolean): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client()
    .from('games_room_players')
    .update({ is_ready: ready })
    .eq('room_id', roomId)
    .eq('user_id', uid);
  if (error) throw error;
}

export async function createMatch(input: {
  gameId: string;
  mode: 'solo' | 'local' | 'online';
  roomId?: string;
  state: Record<string, unknown>;
  playerIds: string[];
}): Promise<GameMatch> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const c = client();
  const { data: match, error } = await c
    .from('games_matches')
    .insert({
      game_id: input.gameId,
      mode: input.mode,
      room_id: input.roomId ?? null,
      state: input.state,
      created_by: uid,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;
  const rows = input.playerIds.map((id, seat) => ({
    match_id: match.id,
    user_id: id,
    seat,
  }));
  await c.from('games_match_players').insert(rows);
  return match as GameMatch;
}

export async function updateMatchState(matchId: string, state: Record<string, unknown>): Promise<void> {
  const { error } = await client()
    .from('games_matches')
    .update({ state })
    .eq('id', matchId)
    .eq('status', 'active');
  if (error) throw error;
}

export async function completeMatch(
  matchId: string,
  winnerId: string | null,
  isDraw: boolean,
  finalState: Record<string, unknown>,
): Promise<GameMatch> {
  const { data, error } = await client().rpc('games_complete_match', {
    p_match_id: matchId,
    p_winner_id: winnerId,
    p_is_draw: isDraw,
    p_final_state: finalState,
  });
  if (error) throw error;
  return data as GameMatch;
}

export async function getMatchHistory(userId: string, limit = 20): Promise<GameMatch[]> {
  const { data, error } = await client()
    .from('games_match_players')
    .select('match_id, games_matches(*)')
    .eq('user_id', userId)
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((r: { games_matches: GameMatch | GameMatch[] | null }) =>
      Array.isArray(r.games_matches) ? r.games_matches[0] : r.games_matches,
    )
    .filter((match): match is GameMatch => Boolean(match));
}

export async function getRecentMatches(limit = 10): Promise<GameMatch[]> {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  return getMatchHistory(uid, limit);
}

export async function submitMatchAction(
  matchId: string,
  expectedVersion: number,
  action: Record<string, unknown>,
): Promise<GameMatch> {
  const { data, error } = await client().rpc('games_submit_action', {
    p_match_id: matchId,
    p_expected_version: expectedVersion,
    p_action: action,
  });
  if (error) throw error;
  return data as GameMatch;
}

export async function startRoomMatch(
  roomId: string,
  initialState: Record<string, unknown>,
): Promise<GameMatch> {
  const { data, error } = await client().rpc('games_start_room_match', {
    p_room_id: roomId,
    p_initial_state: initialState,
  });
  if (error) throw error;
  return data as GameMatch;
}

export async function leaveRoom(roomId: string): Promise<void> {
  const { error } = await client().rpc('games_leave_room', { p_room_id: roomId });
  if (error) throw error;
}

export async function matchmake(gameId: string): Promise<GameRoom> {
  const { data, error } = await client().rpc('games_matchmake', { p_game_id: gameId });
  if (error) throw error;
  return data as GameRoom;
}

export async function inviteToRoom(roomId: string, toUserId: string): Promise<void> {
  const { error } = await client().rpc('games_invite_to_room', {
    p_room_id: roomId,
    p_to_user: toUserId,
  });
  if (error) throw error;
}

export async function listInvitations(): Promise<
  { id: string; room_id: string; from_user_id: string; status: string; created_at: string }[]
> {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await client()
    .from('games_invitations')
    .select('*')
    .eq('to_user_id', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function respondInvitation(id: string, accept: boolean): Promise<void> {
  const { error } = await client()
    .from('games_invitations')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', id);
  if (error) throw error;
}

export async function getMatch(matchId: string): Promise<GameMatch | null> {
  const { data, error } = await client()
    .from('games_matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw error;
  return data as GameMatch | null;
}

/** Subscribe to match row changes (Realtime). Returns unsubscribe. */
export function subscribeMatch(
  matchId: string,
  onUpdate: (match: GameMatch) => void,
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`match:${matchId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games_matches', filter: `id=eq.${matchId}` },
      (payload) => {
        onUpdate(payload.new as GameMatch);
      },
    )
    .subscribe();
  return () => {
    supabase?.removeChannel(channel);
  };
}

export function subscribeRoomPlayers(
  roomId: string,
  onChange: () => void,
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games_room_players', filter: `room_id=eq.${roomId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase?.removeChannel(channel);
  };
}
