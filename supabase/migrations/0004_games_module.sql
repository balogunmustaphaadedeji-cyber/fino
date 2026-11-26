-- FINO Games Module
-- Apply after 0001–0003.

-- Catalogue (seeded, read-mostly)
create table if not exists public.games_catalogue (
  id text primary key,
  slug text not null unique,
  title text not null,
  description text not null default '',
  category text not null check (category in ('board', 'puzzle', 'strategy', 'casual')),
  min_players integer not null default 2,
  max_players integer not null default 2,
  supports_solo boolean not null default true,
  supports_online boolean not null default true,
  status text not null default 'active' check (status in ('active', 'beta', 'disabled')),
  instructions text not null default '',
  sort_order integer not null default 0,
  play_count integer not null default 0 check (play_count >= 0),
  created_at timestamptz not null default now()
);

insert into public.games_catalogue (id, slug, title, description, category, min_players, max_players, supports_solo, instructions, sort_order)
values
  ('ludo', 'ludo', 'Ludo', 'Classic four-colour race. Roll, move, capture, and get all tokens home.', 'board', 2, 4, true,
   'Roll the die. Move tokens out on a six. Capture opponents on non-safe squares. First to home all four tokens wins.', 1),
  ('tic-tac-toe', 'tic-tac-toe', 'Tic-Tac-Toe', 'Three in a row on a 3×3 grid.', 'puzzle', 2, 2, true,
   'Players alternate placing X and O. First to three in a row wins. Full board without three is a draw.', 2),
  ('chess', 'chess', 'Chess', 'Standard chess with all official rules.', 'strategy', 2, 2, true,
   'White moves first. Checkmate wins. Includes castling, en passant, and promotion.', 3)
on conflict (id) do nothing;

-- Player profile (1:1 with auth user)
create table if not exists public.games_players (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  win_streak integer not null default 0,
  best_streak integer not null default 0,
  favourite_game_id text references public.games_catalogue(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games_rooms (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games_catalogue(id),
  host_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  is_private boolean not null default true,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'cancelled')),
  max_slots integer not null default 2,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists games_rooms_code_idx on public.games_rooms (code);
create index if not exists games_rooms_status_idx on public.games_rooms (status, game_id);

create table if not exists public.games_room_players (
  room_id uuid not null references public.games_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat integer not null check (seat >= 0),
  is_ready boolean not null default false,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

create table if not exists public.games_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.games_rooms(id) on delete set null,
  game_id text not null references public.games_catalogue(id),
  mode text not null check (mode in ('solo', 'local', 'online')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  state jsonb not null default '{}'::jsonb,
  winner_id uuid references public.profiles(id) on delete set null,
  is_draw boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid not null references public.profiles(id)
);
create index if not exists games_matches_game_idx on public.games_matches (game_id, started_at desc);
create index if not exists games_matches_user_idx on public.games_matches (created_by, started_at desc);

create table if not exists public.games_match_players (
  match_id uuid not null references public.games_matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat integer not null,
  result text check (result in ('win', 'loss', 'draw', 'abandoned')),
  score integer not null default 0,
  primary key (match_id, user_id)
);

create table if not exists public.games_match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.games_matches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists games_match_events_match_idx on public.games_match_events (match_id, created_at);

create table if not exists public.games_achievements (
  id text primary key,
  title text not null,
  description text not null,
  xp_reward integer not null default 0,
  game_id text references public.games_catalogue(id)
);

insert into public.games_achievements (id, title, description, xp_reward, game_id) values
  ('first_win', 'First Win', 'Win any match', 50, null),
  ('ttt_three', 'Tic-Tac-Toe Streak', 'Win 3 Tic-Tac-Toe matches', 100, 'tic-tac-toe'),
  ('chess_first', 'Chess Debut', 'Complete a chess match', 75, 'chess'),
  ('ludo_home', 'Home Run', 'Get a Ludo token home', 80, 'ludo')
on conflict do nothing;

create table if not exists public.games_player_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.games_achievements(id),
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists public.games_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.games_rooms(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now()
);

-- Ensure player row
create or replace function public.games_ensure_player(p_user uuid)
returns public.games_players
language plpgsql security definer set search_path = public as $$
declare r public.games_players;
begin
  insert into public.games_players (user_id) values (p_user)
  on conflict (user_id) do nothing;
  select * into r from public.games_players where user_id = p_user;
  return r;
end;
$$;

-- Authoritative match completion (prevents client score manipulation)
create or replace function public.games_complete_match(
  p_match_id uuid,
  p_winner_id uuid,
  p_is_draw boolean,
  p_final_state jsonb
)
returns public.games_matches
language plpgsql security definer set search_path = public as $$
declare
  m public.games_matches;
  mp record;
  xp_gain integer;
begin
  select * into m from public.games_matches where id = p_match_id for update;
  if m is null then raise exception 'match not found'; end if;
  if m.status <> 'active' then raise exception 'match already finished'; end if;
  -- Caller must be a participant
  if not exists (
    select 1 from public.games_match_players where match_id = p_match_id and user_id = auth.uid()
  ) and m.created_by is distinct from auth.uid() then
    raise exception 'not a participant';
  end if;

  update public.games_matches set
    status = 'completed',
    winner_id = case when p_is_draw then null else p_winner_id end,
    is_draw = p_is_draw,
    state = coalesce(p_final_state, state),
    ended_at = now()
  where id = p_match_id
  returning * into m;

  update public.games_catalogue set play_count = play_count + 1 where id = m.game_id;

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
      best_streak = greatest(best_streak, case when p_winner_id = mp.user_id then win_streak + 1 else best_streak end),
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

  -- first_win achievement
  if p_winner_id is not null then
    insert into public.games_player_achievements (user_id, achievement_id)
    values (p_winner_id, 'first_win')
    on conflict do nothing;
  end if;

  return m;
end;
$$;

revoke all on function public.games_complete_match(uuid, uuid, boolean, jsonb) from public;
grant execute on function public.games_complete_match(uuid, uuid, boolean, jsonb) to authenticated;
revoke all on function public.games_ensure_player(uuid) from public;
grant execute on function public.games_ensure_player(uuid) to authenticated;

-- Room code generator
create or replace function public.games_create_room(p_game_id text, p_private boolean, p_max_slots integer)
returns public.games_rooms
language plpgsql security definer set search_path = public as $$
declare
  r public.games_rooms;
  v_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.games_catalogue where id = p_game_id and status = 'active') then
    raise exception 'game not available';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.games_rooms (game_id, host_id, code, is_private, max_slots)
  values (p_game_id, auth.uid(), v_code, coalesce(p_private, true), greatest(2, coalesce(p_max_slots, 2)))
  returning * into r;
  insert into public.games_room_players (room_id, user_id, seat, is_ready, is_host)
  values (r.id, auth.uid(), 0, false, true);
  perform public.games_ensure_player(auth.uid());
  return r;
end;
$$;
revoke all on function public.games_create_room(text, boolean, integer) from public;
grant execute on function public.games_create_room(text, boolean, integer) to authenticated;

-- RLS
alter table public.games_catalogue enable row level security;
alter table public.games_players enable row level security;
alter table public.games_rooms enable row level security;
alter table public.games_room_players enable row level security;
alter table public.games_matches enable row level security;
alter table public.games_match_players enable row level security;
alter table public.games_match_events enable row level security;
alter table public.games_achievements enable row level security;
alter table public.games_player_achievements enable row level security;
alter table public.games_invitations enable row level security;

create policy "games_catalogue_read" on public.games_catalogue for select to authenticated using (true);
create policy "games_catalogue_read_anon" on public.games_catalogue for select to anon using (status = 'active');

create policy "games_players_select" on public.games_players for select to authenticated using (true);
create policy "games_players_update_own" on public.games_players for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- inserts via ensure_player definer

create policy "games_rooms_select" on public.games_rooms for select to authenticated
  using (
    not is_private
    or host_id = auth.uid()
    or exists (select 1 from public.games_room_players rp where rp.room_id = id and rp.user_id = auth.uid())
  );
create policy "games_rooms_update_host" on public.games_rooms for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "games_room_players_select" on public.games_room_players for select to authenticated
  using (
    exists (
      select 1 from public.games_rooms r
      where r.id = room_id and (
        not r.is_private or r.host_id = auth.uid()
        or exists (select 1 from public.games_room_players x where x.room_id = r.id and x.user_id = auth.uid())
      )
    )
  );
create policy "games_room_players_insert" on public.games_room_players for insert to authenticated
  with check (auth.uid() = user_id);
create policy "games_room_players_update" on public.games_room_players for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "games_room_players_delete" on public.games_room_players for delete to authenticated
  using (auth.uid() = user_id or exists (select 1 from public.games_rooms r where r.id = room_id and r.host_id = auth.uid()));

create policy "games_matches_select" on public.games_matches for select to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.games_match_players mp where mp.match_id = id and mp.user_id = auth.uid())
  );
create policy "games_matches_insert" on public.games_matches for insert to authenticated
  with check (auth.uid() = created_by);
create policy "games_matches_update_participant" on public.games_matches for update to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.games_match_players mp where mp.match_id = id and mp.user_id = auth.uid())
  );

create policy "games_match_players_select" on public.games_match_players for select to authenticated using (true);
create policy "games_match_players_insert" on public.games_match_players for insert to authenticated
  with check (auth.uid() = user_id or exists (
    select 1 from public.games_matches m where m.id = match_id and m.created_by = auth.uid()
  ));

create policy "games_match_events_select" on public.games_match_events for select to authenticated
  using (exists (
    select 1 from public.games_match_players mp where mp.match_id = match_id and mp.user_id = auth.uid()
  ) or exists (
    select 1 from public.games_matches m where m.id = match_id and m.created_by = auth.uid()
  ));
create policy "games_match_events_insert" on public.games_match_events for insert to authenticated
  with check (auth.uid() = user_id);

create policy "games_achievements_read" on public.games_achievements for select to authenticated using (true);
create policy "games_player_achievements_select" on public.games_player_achievements for select to authenticated using (true);
-- awards only via complete_match definer

create policy "games_invitations_select" on public.games_invitations for select to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);
create policy "games_invitations_insert" on public.games_invitations for insert to authenticated
  with check (auth.uid() = from_user_id);
create policy "games_invitations_update" on public.games_invitations for update to authenticated
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);
