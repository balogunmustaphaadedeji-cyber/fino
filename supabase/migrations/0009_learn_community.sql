-- FINO Learn Community: tutors, groups, memberships, materials, sessions, assignments.
-- Applies after 0008_learn_module.sql. Permissions enforced via RLS + SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Tutor applications & profiles
-- ---------------------------------------------------------------------------
create table if not exists public.learn_tutor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expertise text[] not null default '{}',
  qualifications text not null default '',
  bio text not null default '',
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected')),
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learn_tutor_status_idx
  on public.learn_tutor_profiles (verification_status, applied_at desc);

-- ---------------------------------------------------------------------------
-- Learning groups
-- ---------------------------------------------------------------------------
create table if not exists public.learn_groups (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  subject text not null default '',
  is_private boolean not null default false,
  join_rule text not null default 'request'
    check (join_rule in ('open', 'request', 'invite')),
  cover_url text,
  chat_conversation_id uuid, -- optional link to chat_conversations
  member_count integer not null default 1 check (member_count >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learn_groups_tutor_idx on public.learn_groups (tutor_id);
create index if not exists learn_groups_subject_idx on public.learn_groups (subject);
create index if not exists learn_groups_public_idx on public.learn_groups (is_private, status) where status = 'active';

create table if not exists public.learn_group_members (
  group_id uuid not null references public.learn_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('tutor', 'member')),
  status text not null default 'active'
    check (status in ('active', 'pending', 'invited', 'removed')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists learn_group_members_user_idx
  on public.learn_group_members (user_id, status);

create table if not exists public.learn_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.learn_groups(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (group_id, invitee_id)
);

create table if not exists public.learn_group_materials (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.learn_groups(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  file_url text not null,
  file_type text not null default 'document'
    check (file_type in ('document', 'video', 'pdf', 'image', 'other')),
  created_at timestamptz not null default now()
);

create index if not exists learn_group_materials_group_idx
  on public.learn_group_materials (group_id, created_at desc);

create table if not exists public.learn_group_announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.learn_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.learn_scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.learn_groups(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists learn_sessions_group_idx
  on public.learn_scheduled_sessions (group_id, starts_at);

create table if not exists public.learn_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.learn_groups(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.learn_assignment_submissions (
  assignment_id uuid not null references public.learn_assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  file_url text,
  submitted_at timestamptz not null default now(),
  grade numeric,
  feedback text,
  primary key (assignment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_approved_tutor(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.learn_tutor_profiles
    where user_id = p_uid and verification_status = 'approved'
  );
$$;

create or replace function public.is_platform_admin(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_uid and role = 'admin'
  );
$$;

create or replace function public.is_group_member(p_group_id uuid, p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.learn_group_members
    where group_id = p_group_id and user_id = p_uid and status = 'active'
  );
$$;

create or replace function public.is_group_tutor(p_group_id uuid, p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.learn_groups g
    where g.id = p_group_id and g.tutor_id = p_uid
  ) or exists (
    select 1 from public.learn_group_members
    where group_id = p_group_id and user_id = p_uid and role = 'tutor' and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Apply to become a tutor
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
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.learn_tutor_profiles (user_id, expertise, qualifications, bio, verification_status, applied_at, updated_at)
  values (v_uid, coalesce(p_expertise, '{}'), coalesce(p_qualifications, ''), coalesce(p_bio, ''), 'pending', now(), now())
  on conflict (user_id) do update set
    expertise = coalesce(p_expertise, public.learn_tutor_profiles.expertise),
    qualifications = coalesce(p_qualifications, public.learn_tutor_profiles.qualifications),
    bio = coalesce(p_bio, public.learn_tutor_profiles.bio),
    verification_status = case
      when public.learn_tutor_profiles.verification_status = 'approved' then 'approved'
      else 'pending'
    end,
    applied_at = case
      when public.learn_tutor_profiles.verification_status = 'approved' then public.learn_tutor_profiles.applied_at
      else now()
    end,
    updated_at = now()
  returning * into rec;
  return rec;
end;
$$;
revoke all on function public.learn_apply_tutor(text[], text, text) from public;
grant execute on function public.learn_apply_tutor(text[], text, text) to authenticated;

-- Admin: review tutor application
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
revoke all on function public.learn_review_tutor(uuid, text, text) from public;
grant execute on function public.learn_review_tutor(uuid, text, text) to authenticated;

-- Create learning group (approved tutors only)
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
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_approved_tutor(v_uid) then raise exception 'approved tutor required'; end if;
  if p_join_rule not in ('open', 'request', 'invite') then raise exception 'invalid join_rule'; end if;

  insert into public.learn_groups (tutor_id, name, description, subject, is_private, join_rule, member_count)
  values (v_uid, trim(p_name), coalesce(p_description, ''), coalesce(p_subject, ''), coalesce(p_is_private, false), p_join_rule, 1)
  returning * into g;

  insert into public.learn_group_members (group_id, user_id, role, status)
  values (g.id, v_uid, 'tutor', 'active');

  return g;
end;
$$;
revoke all on function public.learn_create_group(text, text, text, boolean, text) from public;
grant execute on function public.learn_create_group(text, text, text, boolean, text) to authenticated;

-- Request to join / join open group
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

  if exists (select 1 from public.learn_group_members where group_id = p_group_id and user_id = v_uid and status = 'active') then
    select * into m from public.learn_group_members where group_id = p_group_id and user_id = v_uid;
    return m;
  end if;

  if g.join_rule = 'invite' then
    raise exception 'invite only';
  elsif g.join_rule = 'open' then
    insert into public.learn_group_members (group_id, user_id, role, status)
    values (p_group_id, v_uid, 'member', 'active')
    on conflict (group_id, user_id) do update set status = 'active', joined_at = now()
    returning * into m;
    update public.learn_groups set member_count = (
      select count(*) from public.learn_group_members where group_id = p_group_id and status = 'active'
    ) where id = p_group_id;
  else
    -- request
    insert into public.learn_group_members (group_id, user_id, role, status)
    values (p_group_id, v_uid, 'member', 'pending')
    on conflict (group_id, user_id) do update set status = 'pending'
    returning * into m;
  end if;
  return m;
end;
$$;
revoke all on function public.learn_join_group(uuid) from public;
grant execute on function public.learn_join_group(uuid) to authenticated;

-- Tutor: approve or reject join request
create or replace function public.learn_respond_join_request(
  p_group_id uuid,
  p_user_id uuid,
  p_accept boolean
)
returns public.learn_group_members
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m public.learn_group_members;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  if p_accept then
    update public.learn_group_members set status = 'active', joined_at = now()
    where group_id = p_group_id and user_id = p_user_id and status = 'pending'
    returning * into m;
    if m is null then raise exception 'request not found'; end if;
    update public.learn_groups set member_count = (
      select count(*) from public.learn_group_members where group_id = p_group_id and status = 'active'
    ) where id = p_group_id;
  else
    update public.learn_group_members set status = 'removed'
    where group_id = p_group_id and user_id = p_user_id and status = 'pending'
    returning * into m;
  end if;
  return m;
end;
$$;
revoke all on function public.learn_respond_join_request(uuid, uuid, boolean) from public;
grant execute on function public.learn_respond_join_request(uuid, uuid, boolean) to authenticated;

-- Invite learner
create or replace function public.learn_invite_to_group(p_group_id uuid, p_invitee_id uuid)
returns public.learn_group_invites
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  inv public.learn_group_invites;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  insert into public.learn_group_invites (group_id, inviter_id, invitee_id, status)
  values (p_group_id, v_uid, p_invitee_id, 'pending')
  on conflict (group_id, invitee_id) do update set status = 'pending', inviter_id = v_uid, created_at = now()
  returning * into inv;

  insert into public.learn_group_members (group_id, user_id, role, status)
  values (p_group_id, p_invitee_id, 'member', 'invited')
  on conflict (group_id, user_id) do update set status = case
    when public.learn_group_members.status = 'active' then 'active'
    else 'invited'
  end;

  return inv;
end;
$$;
revoke all on function public.learn_invite_to_group(uuid, uuid) from public;
grant execute on function public.learn_invite_to_group(uuid, uuid) to authenticated;

-- Accept invite
create or replace function public.learn_accept_invite(p_group_id uuid)
returns public.learn_group_members
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m public.learn_group_members;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  update public.learn_group_invites set status = 'accepted'
  where group_id = p_group_id and invitee_id = v_uid and status = 'pending';

  update public.learn_group_members set status = 'active', joined_at = now()
  where group_id = p_group_id and user_id = v_uid
  returning * into m;

  if m is null then
    insert into public.learn_group_members (group_id, user_id, role, status)
    values (p_group_id, v_uid, 'member', 'active')
    returning * into m;
  end if;

  update public.learn_groups set member_count = (
    select count(*) from public.learn_group_members where group_id = p_group_id and status = 'active'
  ) where id = p_group_id;

  return m;
end;
$$;
revoke all on function public.learn_accept_invite(uuid) from public;
grant execute on function public.learn_accept_invite(uuid) to authenticated;

-- Remove member (tutor) or leave (member)
create or replace function public.learn_leave_or_remove(p_group_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  target uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  target := coalesce(p_user_id, v_uid);

  if target = v_uid then
    -- leave
    update public.learn_group_members set status = 'removed'
    where group_id = p_group_id and user_id = v_uid and role <> 'tutor';
  else
    if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;
    update public.learn_group_members set status = 'removed'
    where group_id = p_group_id and user_id = target and role <> 'tutor';
  end if;

  update public.learn_groups set member_count = (
    select count(*) from public.learn_group_members where group_id = p_group_id and status = 'active'
  ) where id = p_group_id;
end;
$$;
revoke all on function public.learn_leave_or_remove(uuid, uuid) from public;
grant execute on function public.learn_leave_or_remove(uuid, uuid) to authenticated;

-- Add material
create or replace function public.learn_add_material(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_file_url text,
  p_file_type text
)
returns public.learn_group_materials
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  mat public.learn_group_materials;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  insert into public.learn_group_materials (group_id, uploader_id, title, description, file_url, file_type)
  values (p_group_id, v_uid, trim(p_title), coalesce(p_description, ''), p_file_url, coalesce(p_file_type, 'document'))
  returning * into mat;
  return mat;
end;
$$;
revoke all on function public.learn_add_material(uuid, text, text, text, text) from public;
grant execute on function public.learn_add_material(uuid, text, text, text, text) to authenticated;

-- Post announcement
create or replace function public.learn_post_announcement(p_group_id uuid, p_body text)
returns public.learn_group_announcements
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  a public.learn_group_announcements;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  insert into public.learn_group_announcements (group_id, author_id, body)
  values (p_group_id, v_uid, trim(p_body))
  returning * into a;
  return a;
end;
$$;
revoke all on function public.learn_post_announcement(uuid, text) from public;
grant execute on function public.learn_post_announcement(uuid, text) to authenticated;

-- Schedule session
create or replace function public.learn_schedule_session(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_duration_minutes integer
)
returns public.learn_scheduled_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.learn_scheduled_sessions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  insert into public.learn_scheduled_sessions (group_id, title, description, starts_at, duration_minutes, created_by)
  values (p_group_id, trim(p_title), coalesce(p_description, ''), p_starts_at, coalesce(p_duration_minutes, 60), v_uid)
  returning * into s;
  return s;
end;
$$;
revoke all on function public.learn_schedule_session(uuid, text, text, timestamptz, integer) from public;
grant execute on function public.learn_schedule_session(uuid, text, text, timestamptz, integer) to authenticated;

-- Create assignment
create or replace function public.learn_create_assignment(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_due_at timestamptz
)
returns public.learn_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  a public.learn_assignments;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_tutor(p_group_id, v_uid) then raise exception 'tutor only'; end if;

  insert into public.learn_assignments (group_id, title, description, due_at, created_by)
  values (p_group_id, trim(p_title), coalesce(p_description, ''), p_due_at, v_uid)
  returning * into a;
  return a;
end;
$$;
revoke all on function public.learn_create_assignment(uuid, text, text, timestamptz) from public;
grant execute on function public.learn_create_assignment(uuid, text, text, timestamptz) to authenticated;

-- Submit assignment
create or replace function public.learn_submit_assignment(
  p_assignment_id uuid,
  p_content text,
  p_file_url text default null
)
returns public.learn_assignment_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  a public.learn_assignments;
  sub public.learn_assignment_submissions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into a from public.learn_assignments where id = p_assignment_id;
  if a is null then raise exception 'assignment not found'; end if;
  if not public.is_group_member(a.group_id, v_uid) then raise exception 'not a member'; end if;

  insert into public.learn_assignment_submissions (assignment_id, user_id, content, file_url, submitted_at)
  values (p_assignment_id, v_uid, coalesce(p_content, ''), p_file_url, now())
  on conflict (assignment_id, user_id) do update set
    content = coalesce(p_content, public.learn_assignment_submissions.content),
    file_url = coalesce(p_file_url, public.learn_assignment_submissions.file_url),
    submitted_at = now()
  returning * into sub;
  return sub;
end;
$$;
revoke all on function public.learn_submit_assignment(uuid, text, text) from public;
grant execute on function public.learn_submit_assignment(uuid, text, text) to authenticated;

-- Restrict course creation to approved tutors (override existing open create if needed)
create or replace function public.learn_create_course(
  p_title text,
  p_summary text,
  p_description text,
  p_category_id text,
  p_difficulty text
)
returns public.learn_courses
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.learn_courses;
  slug text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_approved_tutor(v_uid) then raise exception 'approved tutor required'; end if;

  slug := lower(regexp_replace(trim(p_title), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.learn_courses (
    slug, title, summary, description, category_id, instructor_id, difficulty, status
  ) values (
    slug, trim(p_title), coalesce(p_summary, ''), coalesce(p_description, ''),
    p_category_id, v_uid, coalesce(p_difficulty, 'beginner'), 'draft'
  ) returning * into c;
  return c;
end;
$$;
revoke all on function public.learn_create_course(text, text, text, text, text) from public;
grant execute on function public.learn_create_course(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.learn_tutor_profiles enable row level security;
alter table public.learn_groups enable row level security;
alter table public.learn_group_members enable row level security;
alter table public.learn_group_invites enable row level security;
alter table public.learn_group_materials enable row level security;
alter table public.learn_group_announcements enable row level security;
alter table public.learn_scheduled_sessions enable row level security;
alter table public.learn_assignments enable row level security;
alter table public.learn_assignment_submissions enable row level security;

-- Tutor profiles
create policy "Anyone authenticated can read approved tutor profiles"
  on public.learn_tutor_profiles for select to authenticated
  using (verification_status = 'approved' or user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy "Users can insert own tutor application"
  on public.learn_tutor_profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own pending application"
  on public.learn_tutor_profiles for update to authenticated
  using (user_id = auth.uid() and verification_status in ('pending', 'rejected'))
  with check (user_id = auth.uid());

-- Groups: public groups visible; private only to members / tutor
create policy "Read public groups or own membership"
  on public.learn_groups for select to authenticated
  using (
    status = 'active' and (
      is_private = false
      or tutor_id = auth.uid()
      or public.is_group_member(id, auth.uid())
      or public.is_platform_admin(auth.uid())
    )
  );

create policy "Tutors update own groups"
  on public.learn_groups for update to authenticated
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

-- Members
create policy "Read members of accessible groups"
  on public.learn_group_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_tutor(group_id, auth.uid())
    or public.is_group_member(group_id, auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- Invites
create policy "Read own invites or tutor group invites"
  on public.learn_group_invites for select to authenticated
  using (
    invitee_id = auth.uid()
    or inviter_id = auth.uid()
    or public.is_group_tutor(group_id, auth.uid())
  );

-- Materials / announcements / sessions / assignments: members only
create policy "Members read materials"
  on public.learn_group_materials for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_group_tutor(group_id, auth.uid()));

create policy "Members read announcements"
  on public.learn_group_announcements for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_group_tutor(group_id, auth.uid()));

create policy "Members read sessions"
  on public.learn_scheduled_sessions for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_group_tutor(group_id, auth.uid()));

create policy "Members read assignments"
  on public.learn_assignments for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_group_tutor(group_id, auth.uid()));

create policy "Members read own submissions; tutors read all in group"
  on public.learn_assignment_submissions for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.learn_assignments a
      where a.id = assignment_id and public.is_group_tutor(a.group_id, auth.uid())
    )
  );

-- Note: all mutating operations for groups go through SECURITY DEFINER RPCs above.
-- Direct client INSERT/UPDATE/DELETE on community tables is intentionally restricted.
