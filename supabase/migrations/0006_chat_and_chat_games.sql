-- Minimal Chat foundation + Games-in-Chat (additive)
-- Does not replace a future full Chat module; provides conversations for embedded games.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct', 'group')),
  title text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  message_type text not null default 'text' check (message_type in (
    'text', 'game_invite', 'game_event'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conv_idx on public.chat_messages (conversation_id, created_at);

-- Link chat ↔ games
create table if not exists public.chat_game_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  game_id text not null references public.games_catalogue(id),
  room_id uuid references public.games_rooms(id) on delete set null,
  match_id uuid references public.games_matches(id) on delete set null,
  status text not null default 'invited' check (status in (
    'invited', 'active', 'completed', 'declined', 'cancelled'
  )),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_game_sessions_conv_idx on public.chat_game_sessions (conversation_id, status);

create or replace function public.chat_is_member(p_conv uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_members m
    where m.conversation_id = p_conv and m.user_id = p_user
  );
$$;
revoke all on function public.chat_is_member(uuid, uuid) from public;
grant execute on function public.chat_is_member(uuid, uuid) to authenticated;

-- Create or get direct conversation between two users
create or replace function public.chat_get_or_create_direct(p_other uuid)
returns public.chat_conversations
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.chat_conversations;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_other = v_uid then raise exception 'invalid peer'; end if;

  select c.* into c
  from public.chat_conversations c
  join public.chat_members m1 on m1.conversation_id = c.id and m1.user_id = v_uid
  join public.chat_members m2 on m2.conversation_id = c.id and m2.user_id = p_other
  where c.kind = 'direct'
  limit 1;

  if c.id is not null then return c; end if;

  insert into public.chat_conversations (kind, created_by)
  values ('direct', v_uid) returning * into c;
  insert into public.chat_members (conversation_id, user_id) values (c.id, v_uid), (c.id, p_other);
  return c;
end;
$$;
revoke all on function public.chat_get_or_create_direct(uuid) from public;
grant execute on function public.chat_get_or_create_direct(uuid) to authenticated;

-- Send game invite into conversation (creates room + session + system messages)
create or replace function public.chat_send_game_invite(p_conversation_id uuid, p_game_id text)
returns public.chat_game_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  sess public.chat_game_sessions;
  room public.games_rooms;
  max_slots integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.chat_is_member(p_conversation_id, v_uid) then
    raise exception 'not a conversation member';
  end if;
  if not exists (select 1 from public.games_catalogue where id = p_game_id and status = 'active') then
    raise exception 'game not available';
  end if;

  max_slots := case when p_game_id = 'ludo' then 4 else 2 end;
  room := public.games_create_room(p_game_id, true, max_slots);

  insert into public.chat_game_sessions (conversation_id, game_id, room_id, status, invited_by)
  values (p_conversation_id, p_game_id, room.id, 'invited', v_uid)
  returning * into sess;

  insert into public.chat_messages (conversation_id, sender_id, body, message_type, metadata)
  values (
    p_conversation_id, v_uid,
    'Game invitation: ' || p_game_id,
    'game_invite',
    jsonb_build_object(
      'session_id', sess.id,
      'game_id', p_game_id,
      'room_id', room.id,
      'room_code', room.code,
      'status', 'invited'
    )
  );

  return sess;
end;
$$;
revoke all on function public.chat_send_game_invite(uuid, text) from public;
grant execute on function public.chat_send_game_invite(uuid, text) to authenticated;

-- Accept invite: join room, mark session active, post event
create or replace function public.chat_accept_game_invite(p_session_id uuid)
returns public.chat_game_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  sess public.chat_game_sessions;
  cnt integer;
  seat integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into sess from public.chat_game_sessions where id = p_session_id for update;
  if sess is null then raise exception 'session not found'; end if;
  if not public.chat_is_member(sess.conversation_id, v_uid) then
    raise exception 'not a conversation member';
  end if;
  if sess.status not in ('invited', 'active') then raise exception 'invite not open'; end if;

  select count(*) into cnt from public.games_room_players where room_id = sess.room_id;
  if not exists (select 1 from public.games_room_players where room_id = sess.room_id and user_id = v_uid) then
    select max_slots into seat from public.games_rooms where id = sess.room_id;
    if cnt >= seat then raise exception 'room full'; end if;
    insert into public.games_room_players (room_id, user_id, seat, is_ready, is_host)
    values (sess.room_id, v_uid, cnt, true, false);
  end if;

  update public.chat_game_sessions set status = 'active', updated_at = now()
  where id = p_session_id returning * into sess;

  insert into public.chat_messages (conversation_id, sender_id, body, message_type, metadata)
  values (
    sess.conversation_id, v_uid, 'Accepted game invitation',
    'game_event',
    jsonb_build_object('session_id', sess.id, 'event', 'accepted', 'game_id', sess.game_id)
  );
  return sess;
end;
$$;
revoke all on function public.chat_accept_game_invite(uuid) from public;
grant execute on function public.chat_accept_game_invite(uuid) to authenticated;

create or replace function public.chat_decline_game_invite(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare sess public.chat_game_sessions;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into sess from public.chat_game_sessions where id = p_session_id for update;
  if sess is null then raise exception 'session not found'; end if;
  if not public.chat_is_member(sess.conversation_id, auth.uid()) then
    raise exception 'not a conversation member';
  end if;
  update public.chat_game_sessions set status = 'declined', updated_at = now() where id = p_session_id;
  insert into public.chat_messages (conversation_id, sender_id, body, message_type, metadata)
  values (
    sess.conversation_id, auth.uid(), 'Declined game invitation',
    'game_event',
    jsonb_build_object('session_id', sess.id, 'event', 'declined')
  );
end;
$$;
revoke all on function public.chat_decline_game_invite(uuid) from public;
grant execute on function public.chat_decline_game_invite(uuid) to authenticated;

-- RLS
alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_game_sessions enable row level security;

create policy "chat_conv_select" on public.chat_conversations for select to authenticated
  using (public.chat_is_member(id, auth.uid()));
create policy "chat_conv_insert" on public.chat_conversations for insert to authenticated
  with check (auth.uid() = created_by);

create policy "chat_members_select" on public.chat_members for select to authenticated
  using (public.chat_is_member(conversation_id, auth.uid()));
create policy "chat_members_insert_self" on public.chat_members for insert to authenticated
  with check (auth.uid() = user_id);

create policy "chat_messages_select" on public.chat_messages for select to authenticated
  using (public.chat_is_member(conversation_id, auth.uid()));
create policy "chat_messages_insert" on public.chat_messages for insert to authenticated
  with check (
    auth.uid() = sender_id
    and public.chat_is_member(conversation_id, auth.uid())
  );

create policy "chat_game_sessions_select" on public.chat_game_sessions for select to authenticated
  using (public.chat_is_member(conversation_id, auth.uid()));
-- mutations via SECURITY DEFINER RPCs only
