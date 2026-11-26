-- Games security + multiplayer RPCs (additive after 0004)

-- 1. Remove client ability to edit XP / wins / losses
drop policy if exists "games_players_update_own" on public.games_players;

-- 2. Remove unrestricted match updates (winner/status manipulation)
drop policy if exists "games_matches_update_participant" on public.games_matches;

-- Participants may only read matches; mutations via SECURITY DEFINER RPCs
-- (select policies remain)

-- 3. Match version for optimistic concurrency / stale state rejection
alter table public.games_matches
  add column if not exists version integer not null default 0;

-- 4. Authoritative action submit
create or replace function public.games_submit_action(
  p_match_id uuid,
  p_expected_version integer,
  p_action jsonb
)
returns public.games_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.games_matches;
  v_uid uuid := auth.uid();
  v_seat integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into m from public.games_matches where id = p_match_id for update;
  if m is null then raise exception 'match not found'; end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;
  if m.version is distinct from p_expected_version then
    raise exception 'stale_state';
  end if;

  select seat into v_seat from public.games_match_players
  where match_id = p_match_id and user_id = v_uid;
  if v_seat is null and m.created_by is distinct from v_uid then
    raise exception 'not a participant';
  end if;

  -- Append event audit
  insert into public.games_match_events (match_id, user_id, event_type, payload)
  values (p_match_id, v_uid, coalesce(p_action->>'type', 'move'), p_action);

  -- Merge state: client sends full next state blob; server trusts structure but
  -- locks winner/status — only games_complete_match may finish.
  if (p_action ? 'state') then
    m.state := p_action->'state';
  end if;

  update public.games_matches
  set state = m.state,
      version = m.version + 1,
      updated_at = now()
  where id = p_match_id
  returning * into m;

  return m;
end;
$$;

-- matches may not have updated_at — add if missing
alter table public.games_matches add column if not exists updated_at timestamptz not null default now();

create or replace function public.games_submit_action(
  p_match_id uuid,
  p_expected_version integer,
  p_action jsonb
)
returns public.games_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.games_matches;
  v_uid uuid := auth.uid();
  v_seat integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into m from public.games_matches where id = p_match_id for update;
  if m is null then raise exception 'match not found'; end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;
  if coalesce(m.version, 0) is distinct from coalesce(p_expected_version, 0) then
    raise exception 'stale_state';
  end if;

  select seat into v_seat from public.games_match_players
  where match_id = p_match_id and user_id = v_uid;
  if v_seat is null and m.created_by is distinct from v_uid then
    raise exception 'not a participant';
  end if;

  insert into public.games_match_events (match_id, user_id, event_type, payload)
  values (p_match_id, v_uid, coalesce(p_action->>'type', 'move'), p_action);

  if (p_action ? 'state') then
    m.state := p_action->'state';
  end if;

  update public.games_matches
  set state = m.state,
      version = coalesce(m.version, 0) + 1,
      updated_at = now()
  where id = p_match_id
  returning * into m;

  return m;
end;
$$;

revoke all on function public.games_submit_action(uuid, integer, jsonb) from public;
grant execute on function public.games_submit_action(uuid, integer, jsonb) to authenticated;

-- 5. Start match from lobby (host only, all ready or host force)
create or replace function public.games_start_room_match(p_room_id uuid, p_initial_state jsonb)
returns public.games_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.games_rooms;
  m public.games_matches;
  pl record;
  seat_i integer := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into r from public.games_rooms where id = p_room_id for update;
  if r is null then raise exception 'room not found'; end if;
  if r.host_id <> auth.uid() then raise exception 'only host can start'; end if;
  if r.status <> 'lobby' then raise exception 'room not in lobby'; end if;

  update public.games_rooms set status = 'playing', updated_at = now() where id = p_room_id;

  insert into public.games_matches (room_id, game_id, mode, status, state, created_by, version)
  values (p_room_id, r.game_id, 'online', 'active', coalesce(p_initial_state, '{}'::jsonb), auth.uid(), 0)
  returning * into m;

  for pl in
    select * from public.games_room_players where room_id = p_room_id order by seat
  loop
    insert into public.games_match_players (match_id, user_id, seat)
    values (m.id, pl.user_id, pl.seat);
  end loop;

  return m;
end;
$$;

revoke all on function public.games_start_room_match(uuid, jsonb) from public;
grant execute on function public.games_start_room_match(uuid, jsonb) to authenticated;

-- 6. Leave room
create or replace function public.games_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.games_room_players
  where room_id = p_room_id and user_id = auth.uid();
  -- if host leaves lobby, cancel room
  update public.games_rooms
  set status = 'cancelled', updated_at = now()
  where id = p_room_id and host_id = auth.uid() and status = 'lobby';
end;
$$;
revoke all on function public.games_leave_room(uuid) from public;
grant execute on function public.games_leave_room(uuid) to authenticated;

-- 7. Public matchmaking: join open public lobby for game
create or replace function public.games_matchmake(p_game_id text)
returns public.games_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.games_rooms;
  cnt integer;
  next_seat integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select r.* into r
  from public.games_rooms r
  where r.game_id = p_game_id
    and r.status = 'lobby'
    and r.is_private = false
    and not exists (
      select 1 from public.games_room_players rp
      where rp.room_id = r.id and rp.user_id = auth.uid()
    )
  order by r.created_at
  limit 1
  for update skip locked;

  if r is null then
    return public.games_create_room(p_game_id, false, case when p_game_id = 'ludo' then 4 else 2 end);
  end if;

  select count(*) into cnt from public.games_room_players where room_id = r.id;
  if cnt >= r.max_slots then
    return public.games_create_room(p_game_id, false, r.max_slots);
  end if;
  next_seat := cnt;
  insert into public.games_room_players (room_id, user_id, seat, is_ready, is_host)
  values (r.id, auth.uid(), next_seat, false, false)
  on conflict do nothing;
  return r;
end;
$$;
revoke all on function public.games_matchmake(text) from public;
grant execute on function public.games_matchmake(text) to authenticated;

-- 8. Harden complete_match: require participant; idempotent
create or replace function public.games_complete_match(
  p_match_id uuid,
  p_winner_id uuid,
  p_is_draw boolean,
  p_final_state jsonb
)
returns public.games_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.games_matches;
  mp record;
  xp_gain integer;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into m from public.games_matches where id = p_match_id for update;
  if m is null then raise exception 'match not found'; end if;
  if m.status = 'completed' then
    return m; -- idempotent: no double XP
  end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;

  if not exists (
    select 1 from public.games_match_players where match_id = p_match_id and user_id = v_uid
  ) and m.created_by is distinct from v_uid then
    raise exception 'not a participant';
  end if;

  if p_winner_id is not null and not p_is_draw then
    if not exists (
      select 1 from public.games_match_players where match_id = p_match_id and user_id = p_winner_id
    ) then
      raise exception 'winner must be a participant';
    end if;
  end if;

  update public.games_matches set
    status = 'completed',
    winner_id = case when p_is_draw then null else p_winner_id end,
    is_draw = p_is_draw,
    state = coalesce(p_final_state, state),
    ended_at = now(),
    version = coalesce(version, 0) + 1,
    updated_at = now()
  where id = p_match_id
  returning * into m;

  update public.games_catalogue set play_count = play_count + 1 where id = m.game_id;

  if m.room_id is not null then
    update public.games_rooms set status = 'finished', updated_at = now() where id = m.room_id;
  end if;

  for mp in select * from public.games_match_players where match_id = p_match_id loop
    perform public.games_ensure_player(mp.user_id);
    xp_gain := case
      when p_is_draw then 10
      when p_winner_id = mp.user_id then 30
      else 5
    end;
    update public.games_players set
      games_played = games_played + 1,
      wins = wins + case when not p_is_draw and p_winner_id = mp.user_id then 1 else 0 end,
      losses = losses + case when not p_is_draw and p_winner_id is distinct from mp.user_id then 1 else 0 end,
      draws = draws + case when p_is_draw then 1 else 0 end,
      win_streak = case
        when p_is_draw then 0
        when p_winner_id = mp.user_id then win_streak + 1
        else 0
      end,
      best_streak = greatest(best_streak,
        case when p_winner_id = mp.user_id then win_streak + 1 else best_streak end),
      xp = xp + xp_gain,
      level = greatest(1, ((xp + xp_gain) / 100) + 1),
      updated_at = now()
    where user_id = mp.user_id;

    update public.games_match_players set
      result = case
        when p_is_draw then 'draw'
        when p_winner_id = mp.user_id then 'win'
        else 'loss'
      end
    where match_id = p_match_id and user_id = mp.user_id;
  end loop;

  if p_winner_id is not null then
    insert into public.games_player_achievements (user_id, achievement_id)
    values (p_winner_id, 'first_win')
    on conflict do nothing;
  end if;

  return m;
end;
$$;

-- 9. Invite friend (uses profiles; optional social follow not required)
create or replace function public.games_invite_to_room(p_room_id uuid, p_to_user uuid)
returns public.games_invitations
language plpgsql
security definer
set search_path = public
as $$
declare inv public.games_invitations;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.games_room_players where room_id = p_room_id and user_id = auth.uid()
  ) then raise exception 'not in room'; end if;
  insert into public.games_invitations (room_id, from_user_id, to_user_id, status)
  values (p_room_id, auth.uid(), p_to_user, 'pending')
  returning * into inv;
  return inv;
end;
$$;
revoke all on function public.games_invite_to_room(uuid, uuid) from public;
grant execute on function public.games_invite_to_room(uuid, uuid) to authenticated;
