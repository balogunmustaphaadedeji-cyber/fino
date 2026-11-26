-- FINO Chat completion: durable messaging, groups, receipts, presence, attachments and WebRTC signalling.
-- Apply after 0006. All browser access remains subject to RLS.

alter table public.chat_conversations
  add column if not exists avatar_url text,
  add column if not exists last_message_at timestamptz;

alter table public.chat_members
  add column if not exists role text not null default 'member' check (role in ('owner','admin','member')),
  add column if not exists muted_until timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.chat_messages
  add column if not exists reply_to uuid references public.chat_messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists attachment jsonb,
  add column if not exists client_nonce uuid;

alter table public.chat_messages drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages add constraint chat_messages_message_type_check
  check (message_type in ('text','game_invite','game_event','voice','image','video','document','system'));

create unique index if not exists chat_messages_sender_nonce_idx
  on public.chat_messages(sender_id, client_nonce) where client_nonce is not null;
create index if not exists chat_messages_search_idx on public.chat_messages using gin (to_tsvector('simple', coalesce(body,'')));
create index if not exists chat_messages_reply_idx on public.chat_messages(reply_to);

create table if not exists public.chat_message_receipts (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key(message_id,user_id)
);
create index if not exists chat_receipts_user_idx on public.chat_message_receipts(user_id, read_at);

create table if not exists public.chat_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  show_online boolean not null default true,
  show_last_seen boolean not null default true,
  read_receipts boolean not null default true,
  allow_group_invites boolean not null default true,
  notify_messages boolean not null default true,
  notify_calls boolean not null default true,
  message_preview boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  initiated_by uuid not null references public.profiles(id) on delete cascade,
  call_type text not null check(call_type in ('audio','video')),
  status text not null default 'ringing' check(status in ('ringing','accepted','ended','missed','declined','failed')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_calls_conv_idx on public.chat_calls(conversation_id, created_at desc);

create table if not exists public.chat_call_participants (
  call_id uuid not null references public.chat_calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key(call_id,user_id)
);

create table if not exists public.chat_call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.chat_calls(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  signal jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_call_signals_recipient_idx on public.chat_call_signals(call_id,recipient_id,id);

alter table public.chat_message_receipts enable row level security;
alter table public.chat_presence enable row level security;
alter table public.chat_preferences enable row level security;
alter table public.chat_calls enable row level security;
alter table public.chat_call_participants enable row level security;
alter table public.chat_call_signals enable row level security;

-- Keep member self-enrolment closed: membership is managed by security-definer RPCs.
drop policy if exists chat_members_insert_self on public.chat_members;

create policy chat_receipts_select on public.chat_message_receipts for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.chat_messages m
    where m.id = message_id and public.chat_is_member(m.conversation_id, auth.uid())
  )
);
create policy chat_receipts_insert_self on public.chat_message_receipts for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.chat_messages m
    where m.id = message_id and m.sender_id <> auth.uid()
      and public.chat_is_member(m.conversation_id, auth.uid())
  )
);
create policy chat_receipts_update_self on public.chat_message_receipts for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy chat_presence_select on public.chat_presence for select to authenticated
using (
  user_id = auth.uid()
  or (
    exists (select 1 from public.chat_preferences p where p.user_id = chat_presence.user_id and p.show_online)
    and exists (
      select 1 from public.chat_members mine
      join public.chat_members theirs on theirs.conversation_id = mine.conversation_id
      where mine.user_id = auth.uid() and theirs.user_id = chat_presence.user_id
    )
  )
);
create policy chat_presence_upsert_self on public.chat_presence for insert to authenticated with check(user_id=auth.uid());
create policy chat_presence_update_self on public.chat_presence for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy chat_preferences_select_self on public.chat_preferences for select to authenticated using(user_id=auth.uid());
create policy chat_preferences_insert_self on public.chat_preferences for insert to authenticated with check(user_id=auth.uid());
create policy chat_preferences_update_self on public.chat_preferences for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy chat_calls_select_member on public.chat_calls for select to authenticated using(public.chat_is_member(conversation_id,auth.uid()));
create policy chat_call_participants_select_member on public.chat_call_participants for select to authenticated
using(exists(select 1 from public.chat_calls c where c.id=call_id and public.chat_is_member(c.conversation_id,auth.uid())));
create policy chat_call_signals_select_participant on public.chat_call_signals for select to authenticated
using(recipient_id=auth.uid() or sender_id=auth.uid());
create policy chat_call_signals_insert_participant on public.chat_call_signals for insert to authenticated
with check(sender_id=auth.uid() and recipient_id<>auth.uid() and exists(
  select 1 from public.chat_call_participants cp where cp.call_id=chat_call_signals.call_id and cp.user_id=auth.uid()
) and exists(
  select 1 from public.chat_call_participants cp where cp.call_id=chat_call_signals.call_id and cp.user_id=recipient_id
));

-- Only the sender may edit or soft-delete their own normal messages, during a short edit window.
create policy chat_messages_update_own on public.chat_messages for update to authenticated
using(sender_id=auth.uid() and message_type in ('text','voice','image','video','document'))
with check(sender_id=auth.uid() and public.chat_is_member(conversation_id,auth.uid()));
create policy chat_messages_delete_own on public.chat_messages for delete to authenticated
using(sender_id=auth.uid());

create or replace function public.chat_get_or_create_direct(p_other uuid)
returns public.chat_conversations
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); c public.chat_conversations;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if p_other is null or p_other=v_uid then raise exception 'invalid peer'; end if;
 if exists(select 1 from public.social_blocks b where (b.blocker_id=v_uid and b.blocked_id=p_other) or (b.blocker_id=p_other and b.blocked_id=v_uid)) then
   raise exception 'messaging unavailable';
 end if;
 select cv.* into c from public.chat_conversations cv
 join public.chat_members a on a.conversation_id=cv.id and a.user_id=v_uid
 join public.chat_members b on b.conversation_id=cv.id and b.user_id=p_other
 where cv.kind='direct' limit 1;
 if c.id is not null then return c; end if;
 insert into public.chat_conversations(kind,created_by) values('direct',v_uid) returning * into c;
 insert into public.chat_members(conversation_id,user_id,role) values(c.id,v_uid,'owner'),(c.id,p_other,'member');
 return c;
end $$;

create or replace function public.chat_create_group(p_title text,p_member_ids uuid[])
returns public.chat_conversations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); c public.chat_conversations; member_id uuid;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if length(trim(coalesce(p_title,''))) not between 1 and 80 then raise exception 'group title must be 1-80 characters'; end if;
 if coalesce(array_length(p_member_ids,1),0)>49 then raise exception 'too many members'; end if;
 insert into public.chat_conversations(kind,title,created_by) values('group',trim(p_title),v_uid) returning * into c;
 insert into public.chat_members(conversation_id,user_id,role) values(c.id,v_uid,'owner');
 foreach member_id in array coalesce(p_member_ids,'{}'::uuid[]) loop
   if member_id<>v_uid and exists(select 1 from public.profiles where id=member_id)
     and not exists(select 1 from public.social_blocks b where (b.blocker_id=v_uid and b.blocked_id=member_id) or (b.blocker_id=member_id and b.blocked_id=v_uid)) then
     insert into public.chat_members(conversation_id,user_id,role) values(c.id,member_id,'member') on conflict do nothing;
   end if;
 end loop;
 return c;
end $$;

create or replace function public.chat_add_group_member(p_conversation_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.chat_members where conversation_id=p_conversation_id and user_id=auth.uid() and role in('owner','admin'))
 then raise exception 'not authorised'; end if;
 if (select kind from public.chat_conversations where id=p_conversation_id)<>'group' then raise exception 'not a group'; end if;
 if exists(select 1 from public.social_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p_user_id) or (b.blocker_id=p_user_id and b.blocked_id=auth.uid())) then raise exception 'messaging unavailable'; end if;
 insert into public.chat_members(conversation_id,user_id) values(p_conversation_id,p_user_id) on conflict do nothing;
end $$;

create or replace function public.chat_send_message(
 p_conversation_id uuid,p_body text,p_type text default 'text',p_reply_to uuid default null,
 p_attachment jsonb default null,p_client_nonce uuid default null
) returns public.chat_messages language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); m public.chat_messages;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if not public.chat_is_member(p_conversation_id,v_uid) then raise exception 'not a conversation member'; end if;
 if p_type not in('text','voice','image','video','document') then raise exception 'invalid message type'; end if;
 if p_type='text' and (length(trim(coalesce(p_body,'')))=0 or length(p_body)>10000) then raise exception 'message must be 1-10000 characters'; end if;
 if p_type<>'text' and p_attachment is null then raise exception 'attachment required'; end if;
 if p_reply_to is not null and not exists(select 1 from public.chat_messages where id=p_reply_to and conversation_id=p_conversation_id and deleted_at is null) then raise exception 'invalid reply target'; end if;
 insert into public.chat_messages(conversation_id,sender_id,body,message_type,reply_to,attachment,client_nonce)
 values(p_conversation_id,v_uid,coalesce(p_body,''),p_type,p_reply_to,p_attachment,p_client_nonce)
 on conflict(sender_id,client_nonce) where client_nonce is not null do update set client_nonce=excluded.client_nonce
 returning * into m;
 update public.chat_conversations set updated_at=now(),last_message_at=now() where id=p_conversation_id;
 return m;
end $$;

create or replace function public.chat_mark_delivered(p_message_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.chat_message_receipts(message_id,user_id,delivered_at)
 select m.id,auth.uid(),now() from public.chat_messages m
 where m.id=any(p_message_ids) and m.sender_id<>auth.uid() and public.chat_is_member(m.conversation_id,auth.uid())
 on conflict(message_id,user_id) do update set delivered_at=coalesce(chat_message_receipts.delivered_at,excluded.delivered_at);
end $$;

create or replace function public.chat_mark_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.chat_message_receipts(message_id,user_id,delivered_at,read_at)
 select m.id,auth.uid(),now(),now() from public.chat_messages m
 join public.chat_preferences p on p.user_id=auth.uid()
 where m.conversation_id=p_conversation_id and m.sender_id<>auth.uid()
 and public.chat_is_member(m.conversation_id,auth.uid()) and p.read_receipts
 on conflict(message_id,user_id) do update set read_at=coalesce(chat_message_receipts.read_at,excluded.read_at),delivered_at=coalesce(chat_message_receipts.delivered_at,excluded.delivered_at);
end $$;

create or replace function public.chat_start_call(p_conversation_id uuid,p_call_type text)
returns public.chat_calls language plpgsql security definer set search_path=public as $$
declare c public.chat_calls; v_uid uuid:=auth.uid();
begin
 if v_uid is null or not public.chat_is_member(p_conversation_id,v_uid) then raise exception 'not authorised'; end if;
 if p_call_type not in('audio','video') then raise exception 'invalid call type'; end if;
 if (select kind from public.chat_conversations where id=p_conversation_id)='group' then raise exception 'group calls require an SFU provider and are not enabled'; end if;
 insert into public.chat_calls(conversation_id,initiated_by,call_type) values(p_conversation_id,v_uid,p_call_type) returning * into c;
 insert into public.chat_call_participants(call_id,user_id) select c.id,user_id from public.chat_members where conversation_id=p_conversation_id;
 update public.chat_call_participants set joined_at=now() where call_id=c.id and user_id=v_uid;
 return c;
end $$;

create or replace function public.chat_update_call(p_call_id uuid,p_status text)
returns public.chat_calls language plpgsql security definer set search_path=public as $$
declare c public.chat_calls;
begin
 if p_status not in('accepted','ended','declined','missed','failed') then raise exception 'invalid call status'; end if;
 if not exists(select 1 from public.chat_call_participants where call_id=p_call_id and user_id=auth.uid()) then raise exception 'not a call participant'; end if;
 update public.chat_calls set status=p_status,
   answered_at=case when p_status='accepted' then now() else answered_at end,
   ended_at=case when p_status in('ended','declined','missed','failed') then now() else ended_at end
 where id=p_call_id returning * into c;
 if p_status in('ended','declined','missed','failed') then update public.chat_call_participants set left_at=now() where call_id=p_call_id and user_id=auth.uid(); end if;
 if p_status='accepted' then update public.chat_call_participants set joined_at=now() where call_id=p_call_id and user_id=auth.uid(); end if;
 return c;
end $$;

create or replace function public.chat_set_presence(p_online boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'not authenticated'; end if;
 insert into public.chat_presence(user_id,is_online,last_seen_at,updated_at)
 values(auth.uid(),p_online,now(),now())
 on conflict(user_id) do update set is_online=excluded.is_online,last_seen_at=case when excluded.is_online then chat_presence.last_seen_at else now() end,updated_at=now();
end $$;

revoke all on function public.chat_create_group(text,uuid[]) from public;
revoke all on function public.chat_add_group_member(uuid,uuid) from public;
revoke all on function public.chat_send_message(uuid,text,text,uuid,jsonb,uuid) from public;
revoke all on function public.chat_mark_delivered(uuid[]) from public;
revoke all on function public.chat_mark_read(uuid) from public;
revoke all on function public.chat_start_call(uuid,text) from public;
revoke all on function public.chat_update_call(uuid,text) from public;
revoke all on function public.chat_set_presence(boolean) from public;
grant execute on function public.chat_create_group(text,uuid[]) to authenticated;
grant execute on function public.chat_add_group_member(uuid,uuid) to authenticated;
grant execute on function public.chat_send_message(uuid,text,text,uuid,jsonb,uuid) to authenticated;
grant execute on function public.chat_mark_delivered(uuid[]) to authenticated;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_start_call(uuid,text) to authenticated;
grant execute on function public.chat_update_call(uuid,text) to authenticated;
grant execute on function public.chat_set_presence(boolean) to authenticated;

-- Messages are created through the validated RPC, not direct table inserts.
revoke insert on public.chat_messages from authenticated;
grant select, update, delete on public.chat_messages to authenticated;
grant select, insert, update on public.chat_message_receipts to authenticated;
grant select, insert, update on public.chat_presence to authenticated;
grant select, insert, update on public.chat_preferences to authenticated;
grant select on public.chat_calls, public.chat_call_participants, public.chat_call_signals to authenticated;
grant insert on public.chat_call_signals to authenticated;

-- Enable Postgres Changes for durable chat and call updates when publication exists.
do $$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['chat_messages','chat_message_receipts','chat_presence','chat_calls','chat_call_signals'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;

create or replace function public.chat_guard_message_update()
returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is null or old.sender_id<>auth.uid() then raise exception 'not authorised'; end if;
 if old.message_type not in('text','voice','image','video','document') then raise exception 'message cannot be edited'; end if;
 if old.created_at < now()-interval '15 minutes' and old.deleted_at is null then raise exception 'edit window expired'; end if;
 if new.id<>old.id or new.conversation_id<>old.conversation_id or new.sender_id<>old.sender_id
   or new.message_type<>old.message_type or new.created_at<>old.created_at
   or new.reply_to is distinct from old.reply_to or new.attachment is distinct from old.attachment
   or new.metadata is distinct from old.metadata then raise exception 'immutable message fields'; end if;
 if new.deleted_at is not null then new.body:=''; new.edited_at:=old.edited_at;
 else new.edited_at:=now(); end if;
 return new;
end $$;
drop trigger if exists chat_message_guard_update on public.chat_messages;
create trigger chat_message_guard_update before update on public.chat_messages
for each row execute function public.chat_guard_message_update();

-- Presence is exposed only through a privacy-filtering RPC; direct reads are self-only.
drop policy if exists chat_presence_select on public.chat_presence;
create policy chat_presence_select_self on public.chat_presence for select to authenticated using(user_id=auth.uid());

create or replace function public.chat_get_presence(p_user_ids uuid[])
returns table(user_id uuid,is_online boolean,last_seen_at timestamptz)
language sql stable security definer set search_path=public as $$
 select cp.user_id,
   (cp.is_online and coalesce(pref.show_online,true)) as is_online,
   case when coalesce(pref.show_last_seen,true) then cp.last_seen_at else null end as last_seen_at
 from public.chat_presence cp
 left join public.chat_preferences pref on pref.user_id=cp.user_id
 where cp.user_id=any(p_user_ids)
 and exists(
   select 1 from public.chat_members mine join public.chat_members theirs
   on theirs.conversation_id=mine.conversation_id
   where mine.user_id=auth.uid() and theirs.user_id=cp.user_id
 )
$$;
revoke all on function public.chat_get_presence(uuid[]) from public;
grant execute on function public.chat_get_presence(uuid[]) to authenticated;

alter table public.chat_preferences
  add column if not exists allow_messages_from text not null default 'everyone'
  check (allow_messages_from in ('everyone','following','none'));

create or replace function public.chat_get_or_create_direct(p_other uuid)
returns public.chat_conversations
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); c public.chat_conversations; v_rule text;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if p_other is null or p_other=v_uid then raise exception 'invalid peer'; end if;
 if exists(select 1 from public.social_blocks b where (b.blocker_id=v_uid and b.blocked_id=p_other) or (b.blocker_id=p_other and b.blocked_id=v_uid)) then raise exception 'messaging unavailable'; end if;
 select allow_messages_from into v_rule from public.chat_preferences where user_id=p_other;
 v_rule:=coalesce(v_rule,'everyone');
 if v_rule='none' or (v_rule='following' and not exists(
   select 1 from public.social_follows where follower_id=v_uid and following_id=p_other
 )) then raise exception 'This user does not accept messages from your account'; end if;
 select cv.* into c from public.chat_conversations cv
 join public.chat_members a on a.conversation_id=cv.id and a.user_id=v_uid
 join public.chat_members b on b.conversation_id=cv.id and b.user_id=p_other
 where cv.kind='direct' limit 1;
 if c.id is not null then return c; end if;
 insert into public.chat_conversations(kind,created_by) values('direct',v_uid) returning * into c;
 insert into public.chat_members(conversation_id,user_id,role) values(c.id,v_uid,'owner'),(c.id,p_other,'member');
 return c;
end $$;

-- Group members can be added only when the recipient permits group invitations.
create or replace function public.chat_add_group_member(p_conversation_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.chat_members where conversation_id=p_conversation_id and user_id=auth.uid() and role in('owner','admin')) then raise exception 'not authorised'; end if;
 if (select kind from public.chat_conversations where id=p_conversation_id)<>'group' then raise exception 'not a group'; end if;
 if exists(select 1 from public.social_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p_user_id) or (b.blocker_id=p_user_id and b.blocked_id=auth.uid())) then raise exception 'messaging unavailable'; end if;
 if exists(select 1 from public.chat_preferences where user_id=p_user_id and not allow_group_invites) then raise exception 'user does not accept group invitations'; end if;
 insert into public.chat_members(conversation_id,user_id) values(p_conversation_id,p_user_id) on conflict do nothing;
end $$;

create or replace function public.chat_create_group(p_title text,p_member_ids uuid[])
returns public.chat_conversations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); c public.chat_conversations; member_id uuid;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if length(trim(coalesce(p_title,''))) not between 1 and 80 then raise exception 'group title must be 1-80 characters'; end if;
 if coalesce(array_length(p_member_ids,1),0)>49 then raise exception 'too many members'; end if;
 insert into public.chat_conversations(kind,title,created_by) values('group',trim(p_title),v_uid) returning * into c;
 insert into public.chat_members(conversation_id,user_id,role) values(c.id,v_uid,'owner');
 foreach member_id in array coalesce(p_member_ids,'{}'::uuid[]) loop
   if member_id<>v_uid and exists(select 1 from public.profiles where id=member_id)
     and not exists(select 1 from public.social_blocks b where (b.blocker_id=v_uid and b.blocked_id=member_id) or (b.blocker_id=member_id and b.blocked_id=v_uid))
     and not exists(select 1 from public.chat_preferences p where p.user_id=member_id and not p.allow_group_invites) then
     insert into public.chat_members(conversation_id,user_id,role) values(c.id,member_id,'member') on conflict do nothing;
   end if;
 end loop;
 return c;
end $$;

-- Enforce attachment ownership and trusted delivery host at the database boundary.
create or replace function public.chat_send_message(
 p_conversation_id uuid,p_body text,p_type text default 'text',p_reply_to uuid default null,
 p_attachment jsonb default null,p_client_nonce uuid default null
) returns public.chat_messages language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); m public.chat_messages;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if not public.chat_is_member(p_conversation_id,v_uid) then raise exception 'not a conversation member'; end if;
 if p_type not in('text','voice','image','video','document') then raise exception 'invalid message type'; end if;
 if p_type='text' and (length(trim(coalesce(p_body,'')))=0 or length(p_body)>10000) then raise exception 'message must be 1-10000 characters'; end if;
 if p_type<>'text' then
   if p_attachment is null or jsonb_typeof(p_attachment)<>'object' then raise exception 'attachment required'; end if;
   if coalesce(p_attachment->>'url','') not like 'https://res.cloudinary.com/%'
      or coalesce(p_attachment->>'public_id','') not like ('fino/users/'||v_uid::text||'/chat/%')
      or coalesce(p_attachment->>'file_name','')='' or length(p_attachment->>'file_name')>255
      or coalesce((p_attachment->>'bytes')::bigint,0)<=0
      or coalesce((p_attachment->>'bytes')::bigint,0)>83886080 then raise exception 'invalid attachment metadata'; end if;
 end if;
 if p_reply_to is not null and not exists(select 1 from public.chat_messages where id=p_reply_to and conversation_id=p_conversation_id and deleted_at is null) then raise exception 'invalid reply target'; end if;
 insert into public.chat_messages(conversation_id,sender_id,body,message_type,reply_to,attachment,client_nonce)
 values(p_conversation_id,v_uid,coalesce(p_body,''),p_type,p_reply_to,p_attachment,p_client_nonce)
 on conflict(sender_id,client_nonce) where client_nonce is not null do update set client_nonce=excluded.client_nonce
 returning * into m;
 update public.chat_conversations set updated_at=now(),last_message_at=now() where id=p_conversation_id;
 return m;
end $$;

create or replace function public.chat_guard_message_update()
returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is null or old.sender_id<>auth.uid() then raise exception 'not authorised'; end if;
 if old.message_type not in('text','voice','image','video','document') then raise exception 'message cannot be edited'; end if;
 if new.deleted_at is null then
   if old.created_at < now()-interval '15 minutes' then raise exception 'edit window expired'; end if;
   if length(trim(coalesce(new.body,'')))=0 or length(new.body)>10000 then raise exception 'message must be 1-10000 characters'; end if;
 end if;
 if new.id<>old.id or new.conversation_id<>old.conversation_id or new.sender_id<>old.sender_id
   or new.message_type<>old.message_type or new.created_at<>old.created_at
   or new.reply_to is distinct from old.reply_to or new.attachment is distinct from old.attachment
   or new.metadata is distinct from old.metadata then raise exception 'immutable message fields'; end if;
 if new.deleted_at is not null then new.body:=''; new.edited_at:=old.edited_at;
 else new.edited_at:=now(); end if;
 return new;
end $$;

create or replace function public.chat_update_call(p_call_id uuid,p_status text)
returns public.chat_calls language plpgsql security definer set search_path=public as $$
declare c public.chat_calls;
begin
 if p_status not in('accepted','ended','declined','missed','failed') then raise exception 'invalid call status'; end if;
 if not exists(select 1 from public.chat_call_participants where call_id=p_call_id and user_id=auth.uid()) then raise exception 'not a call participant'; end if;
 if p_status='accepted' and exists(select 1 from public.chat_calls where id=p_call_id and initiated_by=auth.uid()) then raise exception 'caller cannot accept own call'; end if;
 if p_status='missed' and not exists(select 1 from public.chat_calls where id=p_call_id and initiated_by=auth.uid()) then raise exception 'only caller may mark an unanswered call missed'; end if;
 update public.chat_calls set status=p_status,
   answered_at=case when p_status='accepted' then now() else answered_at end,
   ended_at=case when p_status in('ended','declined','missed','failed') then now() else ended_at end
 where id=p_call_id and status in('ringing','accepted') returning * into c;
 if c.id is null then raise exception 'call is no longer active'; end if;
 if p_status in('ended','declined','missed','failed') then update public.chat_call_participants set left_at=now() where call_id=p_call_id and user_id=auth.uid(); end if;
 if p_status='accepted' then update public.chat_call_participants set joined_at=now() where call_id=p_call_id and user_id=auth.uid(); end if;
 return c;
end $$;

create or replace function public.chat_get_or_create_direct(p_other uuid)
returns public.chat_conversations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); c public.chat_conversations; v_rule text;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if p_other is null or p_other=v_uid then raise exception 'invalid peer'; end if;
 if exists(select 1 from public.social_blocks b where (b.blocker_id=v_uid and b.blocked_id=p_other) or (b.blocker_id=p_other and b.blocked_id=v_uid)) then raise exception 'messaging unavailable'; end if;
 select cv.* into c from public.chat_conversations cv
 join public.chat_members a on a.conversation_id=cv.id and a.user_id=v_uid
 join public.chat_members b on b.conversation_id=cv.id and b.user_id=p_other
 where cv.kind='direct' limit 1;
 if c.id is not null then return c; end if;
 select allow_messages_from into v_rule from public.chat_preferences where user_id=p_other;
 v_rule:=coalesce(v_rule,'everyone');
 if v_rule='none' or (v_rule='following' and not exists(
   select 1 from public.social_follows where follower_id=v_uid and following_id=p_other
 )) then raise exception 'This user does not accept messages from your account'; end if;
 insert into public.chat_conversations(kind,created_by) values('direct',v_uid) returning * into c;
 insert into public.chat_members(conversation_id,user_id,role) values(c.id,v_uid,'owner'),(c.id,p_other,'member');
 return c;
end $$;

-- Private Realtime broadcast topic authorisation for typing hints.
do $$
begin
 if to_regclass('realtime.messages') is not null then
  execute 'alter table realtime.messages enable row level security';
  if not exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='chat_typing_read_members') then
   execute $policy$create policy chat_typing_read_members on realtime.messages for select to authenticated
     using (case when split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f-]{36}$'
       then public.chat_is_member(split_part(realtime.topic(), ':', 2)::uuid, auth.uid()) else false end)$policy$;
  end if;
  if not exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='chat_typing_write_members') then
   execute $policy$create policy chat_typing_write_members on realtime.messages for insert to authenticated
     with check (case when split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f-]{36}$'
       then public.chat_is_member(split_part(realtime.topic(), ':', 2)::uuid, auth.uid()) else false end)$policy$;
  end if;
 end if;
end $$;

create or replace function public.chat_create_group(p_title text,p_member_ids uuid[])
returns public.chat_conversations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); c public.chat_conversations; member_id uuid;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if length(trim(coalesce(p_title,''))) not between 1 and 80 then raise exception 'group title must be 1-80 characters'; end if;
 if coalesce(array_length(p_member_ids,1),0)>49 then raise exception 'too many members'; end if;
 if exists(select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) x(id)
   where x.id<>v_uid and (
     not exists(select 1 from public.profiles p where p.id=x.id)
     or exists(select 1 from public.social_blocks b where (b.blocker_id=v_uid and b.blocked_id=x.id) or (b.blocker_id=x.id and b.blocked_id=v_uid))
     or exists(select 1 from public.chat_preferences p where p.user_id=x.id and not p.allow_group_invites)
   )) then raise exception 'One or more selected users cannot be invited to this group'; end if;
 insert into public.chat_conversations(kind,title,created_by) values('group',trim(p_title),v_uid) returning * into c;
 insert into public.chat_members(conversation_id,user_id,role) values(c.id,v_uid,'owner');
 foreach member_id in array coalesce(p_member_ids,'{}'::uuid[]) loop
   if member_id<>v_uid then
     insert into public.chat_members(conversation_id,user_id,role) values(c.id,member_id,'member') on conflict do nothing;
   end if;
 end loop;
 return c;
end $$;

create or replace function public.chat_is_member(p_conv uuid,p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
   select 1 from public.chat_members mine
   join public.chat_conversations c on c.id=mine.conversation_id
   where mine.conversation_id=p_conv and mine.user_id=p_user
     and (
       c.kind='group'
       or not exists(
         select 1 from public.chat_members other
         join public.social_blocks b on
           (b.blocker_id=p_user and b.blocked_id=other.user_id)
           or (b.blocker_id=other.user_id and b.blocked_id=p_user)
         where other.conversation_id=p_conv and other.user_id<>p_user
       )
     )
 );
$$;
revoke all on function public.chat_is_member(uuid,uuid) from public;
grant execute on function public.chat_is_member(uuid,uuid) to authenticated;

create or replace function public.chat_is_member(p_conv uuid,p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select p_user=auth.uid() and exists(
   select 1 from public.chat_members mine
   join public.chat_conversations c on c.id=mine.conversation_id
   where mine.conversation_id=p_conv and mine.user_id=p_user
     and (
       c.kind='group'
       or not exists(
         select 1 from public.chat_members other
         join public.social_blocks b on
           (b.blocker_id=p_user and b.blocked_id=other.user_id)
           or (b.blocker_id=other.user_id and b.blocked_id=p_user)
         where other.conversation_id=p_conv and other.user_id<>p_user
       )
     )
 );
$$;

create or replace function public.chat_send_message(
 p_conversation_id uuid,p_body text,p_type text default 'text',p_reply_to uuid default null,
 p_attachment jsonb default null,p_client_nonce uuid default null
) returns public.chat_messages language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); m public.chat_messages; v_peer uuid; v_rule text;
begin
 if v_uid is null then raise exception 'not authenticated'; end if;
 if not public.chat_is_member(p_conversation_id,v_uid) then raise exception 'not a conversation member'; end if;
 if p_type not in('text','voice','image','video','document') then raise exception 'invalid message type'; end if;
 if (select kind from public.chat_conversations where id=p_conversation_id)='direct' then
   select user_id into v_peer from public.chat_members where conversation_id=p_conversation_id and user_id<>v_uid limit 1;
   select allow_messages_from into v_rule from public.chat_preferences where user_id=v_peer;
   v_rule:=coalesce(v_rule,'everyone');
   if v_rule='none' or (v_rule='following' and not exists(select 1 from public.social_follows where follower_id=v_uid and following_id=v_peer)) then
     raise exception 'This user does not accept messages from your account';
   end if;
 end if;
 if p_type='text' and (length(trim(coalesce(p_body,'')))=0 or length(p_body)>10000) then raise exception 'message must be 1-10000 characters'; end if;
 if p_type<>'text' then
   if p_attachment is null or jsonb_typeof(p_attachment)<>'object' then raise exception 'attachment required'; end if;
   if coalesce(p_attachment->>'url','') not like 'https://res.cloudinary.com/%'
      or coalesce(p_attachment->>'public_id','') not like ('fino/users/'||v_uid::text||'/chat/%')
      or coalesce(p_attachment->>'file_name','')='' or length(p_attachment->>'file_name')>255
      or coalesce((p_attachment->>'bytes')::bigint,0)<=0
      or coalesce((p_attachment->>'bytes')::bigint,0)>83886080 then raise exception 'invalid attachment metadata'; end if;
 end if;
 if p_reply_to is not null and not exists(select 1 from public.chat_messages where id=p_reply_to and conversation_id=p_conversation_id and deleted_at is null) then raise exception 'invalid reply target'; end if;
 insert into public.chat_messages(conversation_id,sender_id,body,message_type,reply_to,attachment,client_nonce)
 values(p_conversation_id,v_uid,coalesce(p_body,''),p_type,p_reply_to,p_attachment,p_client_nonce)
 on conflict(sender_id,client_nonce) where client_nonce is not null do update set client_nonce=excluded.client_nonce
 returning * into m;
 update public.chat_conversations set updated_at=now(),last_message_at=now() where id=p_conversation_id;
 return m;
end $$;

create or replace function public.chat_get_presence(p_user_ids uuid[])
returns table(user_id uuid,is_online boolean,last_seen_at timestamptz)
language sql stable security definer set search_path=public as $$
 select cp.user_id,
   (cp.is_online and coalesce(pref.show_online,true)) as is_online,
   case when coalesce(pref.show_last_seen,true) then cp.last_seen_at else null end as last_seen_at
 from public.chat_presence cp
 left join public.chat_preferences pref on pref.user_id=cp.user_id
 where cp.user_id=any(p_user_ids)
 and exists(
   select 1 from public.chat_members mine
   join public.chat_members theirs on theirs.conversation_id=mine.conversation_id
   where mine.user_id=auth.uid() and theirs.user_id=cp.user_id
     and public.chat_is_member(mine.conversation_id,auth.uid())
 )
$$;

create or replace function public.chat_get_presence(p_user_ids uuid[])
returns table(user_id uuid,is_online boolean,last_seen_at timestamptz)
language sql stable security definer set search_path=public as $$
 select cp.user_id,
   (cp.is_online and coalesce(pref.show_online,true)) as is_online,
   case when coalesce(pref.show_last_seen,true) then cp.last_seen_at else null end as last_seen_at
 from public.chat_presence cp
 left join public.chat_preferences pref on pref.user_id=cp.user_id
 where cp.user_id=any(p_user_ids)
 and (coalesce(pref.show_online,true) or coalesce(pref.show_last_seen,true))
 and exists(
   select 1 from public.chat_members mine
   join public.chat_members theirs on theirs.conversation_id=mine.conversation_id
   where mine.user_id=auth.uid() and theirs.user_id=cp.user_id
     and public.chat_is_member(mine.conversation_id,auth.uid())
 )
$$;

create or replace function public.chat_guard_message_update()
returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is null or old.sender_id<>auth.uid() then raise exception 'not authorised'; end if;
 if old.deleted_at is not null then raise exception 'message already deleted'; end if;
 if old.message_type not in('text','voice','image','video','document') then raise exception 'message cannot be edited'; end if;
 if new.deleted_at is null then
   if old.created_at < now()-interval '15 minutes' then raise exception 'edit window expired'; end if;
   if length(trim(coalesce(new.body,'')))=0 or length(new.body)>10000 then raise exception 'message must be 1-10000 characters'; end if;
 end if;
 if new.id<>old.id or new.conversation_id<>old.conversation_id or new.sender_id<>old.sender_id
   or new.message_type<>old.message_type or new.created_at<>old.created_at
   or new.reply_to is distinct from old.reply_to or new.attachment is distinct from old.attachment
   or new.metadata is distinct from old.metadata then raise exception 'immutable message fields'; end if;
 if new.deleted_at is not null then new.body:=''; new.edited_at:=old.edited_at;
 else new.edited_at:=now(); end if;
 return new;
end $$;
