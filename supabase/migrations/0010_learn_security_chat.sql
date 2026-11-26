-- FINO Learn security hardening + Chat group linking
-- Apply after 0009_learn_community.sql

-- ---------------------------------------------------------------------------
-- 1. Tutor verification: users must never set their own verification_status
-- ---------------------------------------------------------------------------
drop policy if exists "Users can update own pending application" on public.learn_tutor_profiles;

-- No client-side UPDATE on tutor profiles. Bio/expertise changes go through apply RPC only.
-- Status changes only via learn_review_tutor (admin).

-- Harden apply: never allow status to become approved from client path
create or replace function public.learn_apply_tutor(
  p_expertise text[],
  p_qualifications text,
  p_bio text
)
returns public.learn_tutor_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rec public.learn_tutor_profiles;
  prev_status text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select verification_status into prev_status
  from public.learn_tutor_profiles where user_id = v_uid;

  insert into public.learn_tutor_profiles (
    user_id, expertise, qualifications, bio, verification_status, applied_at, updated_at
  ) values (
    v_uid,
    coalesce(p_expertise, '{}'),
    coalesce(p_qualifications, ''),
    coalesce(p_bio, ''),
    'pending',
    now(),
    now()
  )
  on conflict (user_id) do update set
    expertise = coalesce(p_expertise, public.learn_tutor_profiles.expertise),
    qualifications = coalesce(p_qualifications, public.learn_tutor_profiles.qualifications),
    bio = coalesce(p_bio, public.learn_tutor_profiles.bio),
    -- preserve approved; otherwise force pending (never self-approve)
    verification_status = case
      when public.learn_tutor_profiles.verification_status = 'approved' then 'approved'
      else 'pending'
    end,
    reviewed_at = case
      when public.learn_tutor_profiles.verification_status = 'approved' then public.learn_tutor_profiles.reviewed_at
      else null
    end,
    reviewed_by = case
      when public.learn_tutor_profiles.verification_status = 'approved' then public.learn_tutor_profiles.reviewed_by
      else null
    end,
    rejection_reason = case
      when public.learn_tutor_profiles.verification_status = 'approved' then null
      else null
    end,
    applied_at = case
      when public.learn_tutor_profiles.verification_status = 'approved' then public.learn_tutor_profiles.applied_at
      else now()
    end,
    updated_at = now()
  returning * into rec;

  -- Defence in depth: approved status is only possible if it was already approved
  if rec.verification_status = 'approved' and prev_status is distinct from 'approved' then
    raise exception 'cannot self-approve';
  end if;

  return rec;
end;
$$;

-- Review remains admin-only (reaffirm)
create or replace function public.learn_review_tutor(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns public.learn_tutor_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rec public.learn_tutor_profiles;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_platform_admin(v_uid) then raise exception 'admin only'; end if;
  if p_user_id = v_uid then raise exception 'cannot review own application'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid status'; end if;

  update public.learn_tutor_profiles set
    verification_status = p_status,
    reviewed_at = now(),
    reviewed_by = v_uid,
    rejection_reason = case when p_status = 'rejected' then p_reason else null end,
    updated_at = now()
  where user_id = p_user_id
  returning * into rec;
  if rec is null then raise exception 'application not found'; end if;
  return rec;
end;
$$;

revoke all on function public.learn_apply_tutor(text[], text, text) from public;
grant execute on function public.learn_apply_tutor(text[], text, text) to authenticated;
revoke all on function public.learn_review_tutor(uuid, text, text) from public;
grant execute on function public.learn_review_tutor(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Private / invite-only group join: no unauthorized membership
-- ---------------------------------------------------------------------------
create or replace function public.learn_join_group(p_group_id uuid)
returns public.learn_group_members
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g public.learn_groups;
  m public.learn_group_members;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into g from public.learn_groups where id = p_group_id and status = 'active';
  if g is null then raise exception 'group not found'; end if;
  if g.tutor_id = v_uid then raise exception 'tutor already member'; end if;

  if exists (
    select 1 from public.learn_group_members
    where group_id = p_group_id and user_id = v_uid and status = 'active'
  ) then
    select * into m from public.learn_group_members
    where group_id = p_group_id and user_id = v_uid;
    return m;
  end if;

  -- Invite-only: never self-join
  if g.join_rule = 'invite' then
    raise exception 'invite only';
  end if;

  -- Private groups: only request path (never open self-join)
  if g.is_private and g.join_rule = 'open' then
    raise exception 'private group cannot be joined openly';
  end if;

  if g.is_private = false and g.join_rule = 'open' then
    insert into public.learn_group_members (group_id, user_id, role, status)
    values (p_group_id, v_uid, 'member', 'active')
    on conflict (group_id, user_id) do update
      set status = 'active', joined_at = now()
    returning * into m;

    update public.learn_groups set member_count = (
      select count(*) from public.learn_group_members
      where group_id = p_group_id and status = 'active'
    ) where id = p_group_id;

    -- Sync into linked Chat group if present
    if g.chat_conversation_id is not null then
      begin
        perform public.chat_add_group_member(g.chat_conversation_id, v_uid);
      exception when others then
        -- Chat membership is best-effort; learn membership remains
        null;
      end;
    end if;
  else
    -- request (public request or private request)
    insert into public.learn_group_members (group_id, user_id, role, status)
    values (p_group_id, v_uid, 'member', 'pending')
    on conflict (group_id, user_id) do update
      set status = case
        when public.learn_group_members.status = 'active' then 'active'
        else 'pending'
      end
    returning * into m;
  end if;

  return m;
end;
$$;

revoke all on function public.learn_join_group(uuid) from public;
grant execute on function public.learn_join_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Invitation acceptance: only pending invite addressed to self
-- ---------------------------------------------------------------------------
create or replace function public.learn_accept_invite(p_group_id uuid)
returns public.learn_group_members
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  inv public.learn_group_invites;
  g public.learn_groups;
  m public.learn_group_members;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into inv from public.learn_group_invites
  where group_id = p_group_id
    and invitee_id = v_uid
    and status = 'pending';
  if inv is null then
    raise exception 'no pending invitation for this user';
  end if;

  select * into g from public.learn_groups where id = p_group_id and status = 'active';
  if g is null then raise exception 'group not found'; end if;

  update public.learn_group_invites
  set status = 'accepted'
  where id = inv.id;

  insert into public.learn_group_members (group_id, user_id, role, status, joined_at)
  values (p_group_id, v_uid, 'member', 'active', now())
  on conflict (group_id, user_id) do update
    set status = 'active', joined_at = now()
  returning * into m;

  update public.learn_groups set member_count = (
    select count(*) from public.learn_group_members
    where group_id = p_group_id and status = 'active'
  ) where id = p_group_id;

  if g.chat_conversation_id is not null then
    begin
      perform public.chat_add_group_member(g.chat_conversation_id, v_uid);
    exception when others then
      null;
    end;
  end if;

  return m;
end;
$$;

revoke all on function public.learn_accept_invite(uuid) from public;
grant execute on function public.learn_accept_invite(uuid) to authenticated;

-- When tutor approves join request, also sync Chat membership
create or replace function public.learn_respond_join_request(
  p_group_id uuid,
  p_user_id uuid,
  p_accept boolean
)
returns public.learn_group_members
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g public.learn_groups;
  m public.learn_group_members;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  select * into g from public.learn_groups where id = p_group_id;

  if p_accept then
    update public.learn_group_members
    set status = 'active', joined_at = now()
    where group_id = p_group_id and user_id = p_user_id and status = 'pending'
    returning * into m;
    if m is null then raise exception 'request not found'; end if;

    update public.learn_groups set member_count = (
      select count(*) from public.learn_group_members
      where group_id = p_group_id and status = 'active'
    ) where id = p_group_id;

    if g.chat_conversation_id is not null then
      begin
        perform public.chat_add_group_member(g.chat_conversation_id, p_user_id);
      exception when others then
        null;
      end;
    end if;
  else
    update public.learn_group_members
    set status = 'removed'
    where group_id = p_group_id and user_id = p_user_id and status = 'pending'
    returning * into m;
  end if;
  return m;
end;
$$;

revoke all on function public.learn_respond_join_request(uuid, uuid, boolean) from public;
grant execute on function public.learn_respond_join_request(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Create group + linked FINO Chat conversation
-- ---------------------------------------------------------------------------
create or replace function public.learn_create_group(
  p_name text,
  p_description text,
  p_subject text,
  p_is_private boolean,
  p_join_rule text
)
returns public.learn_groups
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g public.learn_groups;
  chat_id uuid;
  title text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_approved_tutor(v_uid) then raise exception 'approved tutor required'; end if;
  if p_join_rule not in ('open', 'request', 'invite') then raise exception 'invalid join_rule'; end if;
  -- Private groups cannot be fully open
  if coalesce(p_is_private, false) and p_join_rule = 'open' then
    raise exception 'private groups cannot use open join';
  end if;

  title := left(trim(p_name), 80);

  insert into public.learn_groups (
    tutor_id, name, description, subject, is_private, join_rule, member_count
  ) values (
    v_uid, trim(p_name), coalesce(p_description, ''), coalesce(p_subject, ''),
    coalesce(p_is_private, false), p_join_rule, 1
  ) returning * into g;

  insert into public.learn_group_members (group_id, user_id, role, status)
  values (g.id, v_uid, 'tutor', 'active');

  -- Link a FINO Chat group conversation (tutor is owner)
  begin
    select id into chat_id from public.chat_create_group(title, '{}'::uuid[]);
    update public.learn_groups
    set chat_conversation_id = chat_id, updated_at = now()
    where id = g.id
    returning * into g;
  exception when others then
    -- Group still usable; chat can be linked later
    null;
  end;

  return g;
end;
$$;

revoke all on function public.learn_create_group(text, text, text, boolean, text) from public;
grant execute on function public.learn_create_group(text, text, text, boolean, text) to authenticated;

-- Ensure chat link helper for groups created before this migration
create or replace function public.learn_ensure_group_chat(p_group_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g public.learn_groups;
  chat_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into g from public.learn_groups where id = p_group_id;
  if g is null then raise exception 'group not found'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  if g.chat_conversation_id is not null then
    return g.chat_conversation_id;
  end if;

  select id into chat_id from public.chat_create_group(left(g.name, 80), '{}'::uuid[]);
  update public.learn_groups
  set chat_conversation_id = chat_id, updated_at = now()
  where id = p_group_id;

  return chat_id;
end;
$$;

revoke all on function public.learn_ensure_group_chat(uuid) from public;
grant execute on function public.learn_ensure_group_chat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Material upload metadata remains tutor-only RPC (URL from Cloudinary client)
-- ---------------------------------------------------------------------------
-- learn_add_material already tutor-gated; no change needed beyond ensuring no open INSERT policy

-- Explicitly deny direct inserts on sensitive tables if any policy was missing
drop policy if exists "deny direct insert members" on public.learn_group_members;
-- (no insert policies = no client inserts under default deny)

-- ---------------------------------------------------------------------------
-- 6. Start live session status helper (call signalling stays in Chat)
-- ---------------------------------------------------------------------------
create or replace function public.learn_set_session_status(
  p_session_id uuid,
  p_status text
)
returns public.learn_scheduled_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.learn_scheduled_sessions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_status not in ('scheduled', 'live', 'completed', 'cancelled') then
    raise exception 'invalid status';
  end if;

  select * into s from public.learn_scheduled_sessions where id = p_session_id;
  if s is null then raise exception 'session not found'; end if;
  if not public.is_group_tutor(s.group_id, v_uid) then raise exception 'tutor only'; end if;

  update public.learn_scheduled_sessions
  set status = p_status
  where id = p_session_id
  returning * into s;
  return s;
end;
$$;

revoke all on function public.learn_set_session_status(uuid, text) from public;
grant execute on function public.learn_set_session_status(uuid, text) to authenticated;

-- Restrict execute on helper privilege functions (read-only for authenticated is OK)
revoke all on function public.is_approved_tutor(uuid) from public;
grant execute on function public.is_approved_tutor(uuid) to authenticated;
revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated;
revoke all on function public.is_group_member(uuid, uuid) from public;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
revoke all on function public.is_group_tutor(uuid, uuid) from public;
grant execute on function public.is_group_tutor(uuid, uuid) to authenticated;
