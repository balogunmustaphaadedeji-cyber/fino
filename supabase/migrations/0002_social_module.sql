-- FINO Social Module schema (hardened v2)
-- Apply after 0001_core_foundation.sql.
-- Security: RLS, constraints, triggers. Ownership always from auth.uid().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Extend shared profiles (documented shared-contract change)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cover_url text,
  add column if not exists location text,
  add column if not exists website text,
  add column if not exists is_private boolean not null default false,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists posts_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'private')),
  media_count integer not null default 0 check (media_count >= 0),
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_author_created_idx on public.social_posts (author_id, created_at desc);
create index if not exists social_posts_created_idx on public.social_posts (created_at desc);

create table if not exists public.social_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  cloudinary_public_id text not null,
  resource_type text not null check (resource_type in ('image', 'video')),
  mime_type text,
  width integer,
  height integer,
  duration_seconds numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists social_post_media_post_idx on public.social_post_media (post_id, sort_order);

create table if not exists public.social_likes (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists social_likes_user_idx on public.social_likes (user_id);

create table if not exists public.social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.social_comments(id) on delete cascade,
  body text not null,
  depth integer not null default 0 check (depth >= 0 and depth <= 2),
  like_count integer not null default 0 check (like_count >= 0),
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_comments_body_len check (char_length(body) between 1 and 2000)
);
create index if not exists social_comments_post_idx on public.social_comments (post_id, created_at);
create index if not exists social_comments_parent_idx on public.social_comments (parent_id);

create table if not exists public.social_comment_likes (
  comment_id uuid not null references public.social_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.social_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint social_follows_no_self check (follower_id <> following_id)
);
create index if not exists social_follows_following_idx on public.social_follows (following_id);

create table if not exists public.social_follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, target_id),
  constraint social_follow_requests_no_self check (requester_id <> target_id)
);
create index if not exists social_follow_requests_target_idx on public.social_follow_requests (target_id, status);

create table if not exists public.social_stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '',
  cloudinary_public_id text not null,
  resource_type text not null check (resource_type in ('image', 'video')),
  mime_type text,
  duration_seconds numeric,
  view_count integer not null default 0 check (view_count >= 0),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);
create index if not exists social_stories_author_idx on public.social_stories (author_id, created_at desc);
create index if not exists social_stories_expires_idx on public.social_stories (expires_at);

create table if not exists public.social_story_views (
  story_id uuid not null references public.social_stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.social_bookmarks (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists social_bookmarks_user_idx on public.social_bookmarks (user_id, created_at desc);

create table if not exists public.social_hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  post_count integer not null default 0 check (post_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists social_hashtags_tag_idx on public.social_hashtags (tag);

create table if not exists public.social_post_hashtags (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  hashtag_id uuid not null references public.social_hashtags(id) on delete cascade,
  primary key (post_id, hashtag_id)
);

create table if not exists public.social_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.social_posts(id) on delete cascade,
  comment_id uuid references public.social_comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);
create index if not exists social_mentions_user_idx on public.social_mentions (mentioned_user_id);

create table if not exists public.social_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint social_blocks_no_self check (blocker_id <> blocked_id)
);
create index if not exists social_blocks_blocked_idx on public.social_blocks (blocked_id);

create table if not exists public.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'story', 'user')),
  target_id uuid not null,
  reason text not null check (reason in (
    'spam', 'harassment', 'hate', 'violence', 'nudity', 'misinformation', 'impersonation', 'other'
  )),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_reports_status_idx on public.social_reports (status, created_at desc);

create table if not exists public.social_hidden_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.social_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.social_user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  feed_sort text not null default 'chronological' check (feed_sort in ('chronological', 'following')),
  show_replies_default boolean not null default true,
  allow_mentions text not null default 'everyone' check (allow_mentions in ('everyone', 'following', 'none')),
  allow_comments text not null default 'everyone' check (allow_comments in ('everyone', 'following', 'none')),
  search_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Notification outbox contract (Social writes; shared notification consumer reads)
create table if not exists public.social_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'new_follower', 'follow_request', 'follow_accepted',
    'post_like', 'comment', 'comment_reply', 'mention', 'story_view'
  )),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists social_notification_events_recipient_idx
  on public.social_notification_events (recipient_id, created_at desc)
  where consumed_at is null;

-- ---------------------------------------------------------------------------
-- Helpers (security definer, fixed search_path)
-- ---------------------------------------------------------------------------
create or replace function public.social_is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.social_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.social_is_following(follower uuid, target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.social_follows
    where follower_id = follower and following_id = target
  );
$$;

create or replace function public.social_can_view_profile_content(viewer uuid, owner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    case
      when viewer is not null and viewer = owner then true
      when public.social_is_blocked(coalesce(viewer, '00000000-0000-0000-0000-000000000000'::uuid), owner) then false
      when not exists (select 1 from public.profiles p where p.id = owner and p.is_private) then true
      when viewer is null then false
      else public.social_is_following(viewer, owner)
    end;
$$;

create or replace function public.social_can_view_post(viewer uuid, post_author uuid, vis text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    case
      when viewer is not null and viewer = post_author then true
      when public.social_is_blocked(coalesce(viewer, '00000000-0000-0000-0000-000000000000'::uuid), post_author) then false
      when vis = 'private' then false
      when not public.social_can_view_profile_content(viewer, post_author) then false
      when vis = 'followers' then
        viewer is not null and public.social_is_following(viewer, post_author)
      else true -- public + profile content allowed
    end;
$$;

create or replace function public.social_can_view_story(viewer uuid, story_author uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.social_can_view_profile_content(viewer, story_author);
$$;

-- Emit notification event (internal)
create or replace function public.social_emit_notification(
  p_type text, p_actor uuid, p_recipient uuid, p_entity_type text, p_entity_id uuid, p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_actor = p_recipient then return; end if;
  insert into public.social_notification_events (event_type, actor_id, recipient_id, entity_type, entity_id, payload)
  values (p_type, p_actor, p_recipient, p_entity_type, p_entity_id, p_payload);
end;
$$;

-- ---------------------------------------------------------------------------
-- BEFORE triggers: enforce private follow, media ownership, comment depth, blocks
-- ---------------------------------------------------------------------------

-- Prevent direct follow of private accounts; require accepted request path
create or replace function public.social_follows_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_private boolean;
begin
  if new.follower_id = new.following_id then
    raise exception 'cannot follow yourself';
  end if;
  if public.social_is_blocked(new.follower_id, new.following_id) then
    raise exception 'cannot follow a blocked user';
  end if;
  select is_private into target_private from public.profiles where id = new.following_id;
  if coalesce(target_private, false) then
    -- Only allow if there is an accepted request (or system path via request accept)
    if not exists (
      select 1 from public.social_follow_requests
      where requester_id = new.follower_id and target_id = new.following_id and status = 'accepted'
    ) then
      raise exception 'private account requires an approved follow request';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists social_follows_before_insert_trg on public.social_follows;
create trigger social_follows_before_insert_trg
  before insert on public.social_follows
  for each row execute function public.social_follows_before_insert();

-- Follow request insert: no block, no self
create or replace function public.social_follow_requests_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requester_id = new.target_id then
    raise exception 'cannot request to follow yourself';
  end if;
  if public.social_is_blocked(new.requester_id, new.target_id) then
    raise exception 'cannot request follow when blocked';
  end if;
  if exists (
    select 1 from public.social_follows
    where follower_id = new.requester_id and following_id = new.target_id
  ) then
    raise exception 'already following';
  end if;
  return new;
end;
$$;

drop trigger if exists social_follow_requests_before_insert_trg on public.social_follow_requests;
create trigger social_follow_requests_before_insert_trg
  before insert on public.social_follow_requests
  for each row execute function public.social_follow_requests_before_insert();

-- Follow request update: only target may change status; status transitions restricted
create or replace function public.social_follow_requests_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requester_id is distinct from old.requester_id or new.target_id is distinct from old.target_id then
    raise exception 'cannot change requester or target';
  end if;
  if auth.uid() is distinct from old.target_id then
    raise exception 'only the target may respond to a follow request';
  end if;
  if old.status <> 'pending' then
    raise exception 'request already resolved';
  end if;
  if new.status not in ('accepted', 'rejected') then
    raise exception 'invalid status transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists social_follow_requests_before_update_trg on public.social_follow_requests;
create trigger social_follow_requests_before_update_trg
  before update on public.social_follow_requests
  for each row execute function public.social_follow_requests_before_update();

-- On accept: create follow atomically
create or replace function public.social_follow_requests_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    insert into public.social_follows (follower_id, following_id)
    values (new.requester_id, new.target_id)
    on conflict do nothing;
    perform public.social_emit_notification(
      'follow_accepted', new.target_id, new.requester_id, 'user', new.target_id, '{}'::jsonb
    );
  end if;
  return null;
end;
$$;

drop trigger if exists social_follow_requests_after_update_trg on public.social_follow_requests;
create trigger social_follow_requests_after_update_trg
  after update on public.social_follow_requests
  for each row execute function public.social_follow_requests_after_update();

-- Media: owner must be post author and auth user
create or replace function public.social_post_media_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  post_author uuid;
begin
  if auth.uid() is null or auth.uid() <> new.owner_id then
    raise exception 'media owner must be the authenticated user';
  end if;
  select author_id into post_author from public.social_posts where id = new.post_id;
  if post_author is null then
    raise exception 'post not found';
  end if;
  if post_author <> new.owner_id then
    raise exception 'only the post author may attach media';
  end if;
  return new;
end;
$$;

drop trigger if exists social_post_media_before_insert_trg on public.social_post_media;
create trigger social_post_media_before_insert_trg
  before insert on public.social_post_media
  for each row execute function public.social_post_media_before_insert();

-- Comments: depth, parent same post, accessibility, block
create or replace function public.social_comments_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_post uuid;
  parent_depth integer;
  post_author uuid;
  post_vis text;
begin
  if auth.uid() is null or auth.uid() <> new.author_id then
    raise exception 'comment author must be authenticated user';
  end if;
  select author_id, visibility into post_author, post_vis
  from public.social_posts where id = new.post_id;
  if post_author is null then
    raise exception 'post not found';
  end if;
  if not public.social_can_view_post(auth.uid(), post_author, post_vis) then
    raise exception 'cannot comment on inaccessible post';
  end if;
  if public.social_is_blocked(auth.uid(), post_author) then
    raise exception 'blocked';
  end if;
  if new.parent_id is not null then
    select post_id, depth into parent_post, parent_depth
    from public.social_comments where id = new.parent_id;
    if parent_post is null or parent_post <> new.post_id then
      raise exception 'parent comment must belong to the same post';
    end if;
    new.depth := parent_depth + 1;
    if new.depth > 2 then
      raise exception 'reply depth limit exceeded';
    end if;
  else
    new.depth := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists social_comments_before_insert_trg on public.social_comments;
create trigger social_comments_before_insert_trg
  before insert on public.social_comments
  for each row execute function public.social_comments_before_insert();

-- Likes: must be able to view post, not blocked
create or replace function public.social_likes_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  post_author uuid;
  post_vis text;
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'like user must be authenticated user';
  end if;
  select author_id, visibility into post_author, post_vis
  from public.social_posts where id = new.post_id;
  if post_author is null then
    raise exception 'post not found';
  end if;
  if not public.social_can_view_post(auth.uid(), post_author, post_vis) then
    raise exception 'cannot like inaccessible post';
  end if;
  return new;
end;
$$;

drop trigger if exists social_likes_before_insert_trg on public.social_likes;
create trigger social_likes_before_insert_trg
  before insert on public.social_likes
  for each row execute function public.social_likes_before_insert();

-- Story views: eligible + not expired
create or replace function public.social_story_views_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  story_author uuid;
  story_expires timestamptz;
begin
  if auth.uid() is null or auth.uid() <> new.viewer_id then
    raise exception 'viewer must be authenticated user';
  end if;
  select author_id, expires_at into story_author, story_expires
  from public.social_stories where id = new.story_id;
  if story_author is null then
    raise exception 'story not found';
  end if;
  if story_expires <= now() then
    raise exception 'story expired';
  end if;
  if not public.social_can_view_story(auth.uid(), story_author) then
    raise exception 'cannot view this story';
  end if;
  return new;
end;
$$;

drop trigger if exists social_story_views_before_insert_trg on public.social_story_views;
create trigger social_story_views_before_insert_trg
  before insert on public.social_story_views
  for each row execute function public.social_story_views_before_insert();

-- Block: cleanup follows and requests
create or replace function public.social_blocks_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.social_follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  delete from public.social_follow_requests
  where (requester_id = new.blocker_id and target_id = new.blocked_id)
     or (requester_id = new.blocked_id and target_id = new.blocker_id);
  return null;
end;
$$;

drop trigger if exists social_blocks_after_insert_trg on public.social_blocks;
create trigger social_blocks_after_insert_trg
  after insert on public.social_blocks
  for each row execute function public.social_blocks_after_insert();

-- ---------------------------------------------------------------------------
-- Counter + notification triggers
-- ---------------------------------------------------------------------------
create or replace function public.social_bump_post_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  if tg_op = 'INSERT' then
    update public.social_posts set like_count = like_count + 1 where id = new.post_id
      returning author_id into author;
    perform public.social_emit_notification('post_like', new.user_id, author, 'post', new.post_id, '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    update public.social_posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;
drop trigger if exists social_likes_count_trg on public.social_likes;
create trigger social_likes_count_trg
  after insert or delete on public.social_likes
  for each row execute function public.social_bump_post_like_count();

create or replace function public.social_bump_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid; etype text;
begin
  if tg_op = 'INSERT' then
    update public.social_posts set comment_count = comment_count + 1 where id = new.post_id
      returning author_id into author;
    etype := case when new.parent_id is null then 'comment' else 'comment_reply' end;
    perform public.social_emit_notification(etype, new.author_id, author, 'comment', new.id, jsonb_build_object('post_id', new.post_id));
  elsif tg_op = 'DELETE' then
    update public.social_posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;
drop trigger if exists social_comments_count_trg on public.social_comments;
create trigger social_comments_count_trg
  after insert or delete on public.social_comments
  for each row execute function public.social_bump_comment_count();

create or replace function public.social_bump_follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    perform public.social_emit_notification('new_follower', new.follower_id, new.following_id, 'user', new.follower_id, '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.following_id;
  end if;
  return null;
end;
$$;
drop trigger if exists social_follows_count_trg on public.social_follows;
create trigger social_follows_count_trg
  after insert or delete on public.social_follows
  for each row execute function public.social_bump_follow_counts();

create or replace function public.social_bump_posts_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set posts_count = greatest(0, posts_count - 1) where id = old.author_id;
  end if;
  return null;
end;
$$;
drop trigger if exists social_posts_count_trg on public.social_posts;
create trigger social_posts_count_trg
  after insert or delete on public.social_posts
  for each row execute function public.social_bump_posts_count();

-- Story view count
create or replace function public.social_bump_story_view_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.social_stories set view_count = view_count + 1 where id = new.story_id;
  end if;
  return null;
end;
$$;
drop trigger if exists social_story_views_count_trg on public.social_story_views;
create trigger social_story_views_count_trg
  after insert on public.social_story_views
  for each row execute function public.social_bump_story_view_count();

-- Follow request notification
create or replace function public.social_follow_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.social_emit_notification(
      'follow_request', new.requester_id, new.target_id, 'follow_request', new.id, '{}'::jsonb
    );
  end if;
  return null;
end;
$$;
drop trigger if exists social_follow_request_notify_trg on public.social_follow_requests;
create trigger social_follow_request_notify_trg
  after insert on public.social_follow_requests
  for each row execute function public.social_follow_request_notify();

-- Hashtag count: maintain via post_hashtags
create or replace function public.social_hashtag_link_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.social_hashtags set post_count = post_count + 1 where id = new.hashtag_id;
  elsif tg_op = 'DELETE' then
    update public.social_hashtags set post_count = greatest(0, post_count - 1) where id = old.hashtag_id;
    delete from public.social_hashtags where id = old.hashtag_id and post_count = 0;
  end if;
  return null;
end;
$$;
drop trigger if exists social_post_hashtags_count_trg on public.social_post_hashtags;
create trigger social_post_hashtags_count_trg
  after insert or delete on public.social_post_hashtags
  for each row execute function public.social_hashtag_link_count();

-- On post delete: hashtag links cascade; counts handled by trigger above

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists social_posts_updated_at on public.social_posts;
create trigger social_posts_updated_at before update on public.social_posts
  for each row execute function public.set_updated_at();
drop trigger if exists social_comments_updated_at on public.social_comments;
create trigger social_comments_updated_at before update on public.social_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.social_posts enable row level security;
alter table public.social_post_media enable row level security;
alter table public.social_likes enable row level security;
alter table public.social_comments enable row level security;
alter table public.social_comment_likes enable row level security;
alter table public.social_follows enable row level security;
alter table public.social_follow_requests enable row level security;
alter table public.social_stories enable row level security;
alter table public.social_story_views enable row level security;
alter table public.social_bookmarks enable row level security;
alter table public.social_hashtags enable row level security;
alter table public.social_post_hashtags enable row level security;
alter table public.social_mentions enable row level security;
alter table public.social_blocks enable row level security;
alter table public.social_reports enable row level security;
alter table public.social_hidden_posts enable row level security;
alter table public.social_user_preferences enable row level security;
alter table public.social_notification_events enable row level security;

-- Posts
create policy "social_posts_select_auth" on public.social_posts for select to authenticated
  using (
    public.social_can_view_post(auth.uid(), author_id, visibility)
    and not exists (select 1 from public.social_hidden_posts h where h.user_id = auth.uid() and h.post_id = id)
  );
create policy "social_posts_select_anon" on public.social_posts for select to anon
  using (
    visibility = 'public'
    and public.social_can_view_profile_content(null, author_id)
  );
create policy "social_posts_insert" on public.social_posts for insert to authenticated
  with check (auth.uid() = author_id);
create policy "social_posts_update" on public.social_posts for update to authenticated
  using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "social_posts_delete" on public.social_posts for delete to authenticated
  using (auth.uid() = author_id);

-- Post media: select if can view post; insert/delete only owner (trigger enforces author match)
create policy "social_post_media_select_auth" on public.social_post_media for select to authenticated
  using (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id and public.social_can_view_post(auth.uid(), p.author_id, p.visibility)
    )
  );
create policy "social_post_media_select_anon" on public.social_post_media for select to anon
  using (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id and p.visibility = 'public'
        and public.social_can_view_profile_content(null, p.author_id)
    )
  );
create policy "social_post_media_insert" on public.social_post_media for insert to authenticated
  with check (auth.uid() = owner_id);
create policy "social_post_media_delete" on public.social_post_media for delete to authenticated
  using (auth.uid() = owner_id);

-- Likes
create policy "social_likes_select" on public.social_likes for select to authenticated using (true);
create policy "social_likes_insert" on public.social_likes for insert to authenticated
  with check (auth.uid() = user_id);
create policy "social_likes_delete" on public.social_likes for delete to authenticated
  using (auth.uid() = user_id);

-- Comments
create policy "social_comments_select_auth" on public.social_comments for select to authenticated
  using (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id and public.social_can_view_post(auth.uid(), p.author_id, p.visibility)
    )
  );
create policy "social_comments_insert" on public.social_comments for insert to authenticated
  with check (auth.uid() = author_id);
create policy "social_comments_update" on public.social_comments for update to authenticated
  using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "social_comments_delete" on public.social_comments for delete to authenticated
  using (auth.uid() = author_id);

-- Comment likes
create policy "social_comment_likes_select" on public.social_comment_likes for select to authenticated using (true);
create policy "social_comment_likes_insert" on public.social_comment_likes for insert to authenticated
  with check (auth.uid() = user_id);
create policy "social_comment_likes_delete" on public.social_comment_likes for delete to authenticated
  using (auth.uid() = user_id);

-- Follows: readable; insert only as self (trigger enforces private/block)
create policy "social_follows_select" on public.social_follows for select to authenticated using (true);
create policy "social_follows_insert" on public.social_follows for insert to authenticated
  with check (auth.uid() = follower_id);
create policy "social_follows_delete" on public.social_follows for delete to authenticated
  using (auth.uid() = follower_id or auth.uid() = following_id);

-- Follow requests
create policy "social_follow_requests_select" on public.social_follow_requests for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = target_id);
create policy "social_follow_requests_insert" on public.social_follow_requests for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');
create policy "social_follow_requests_update" on public.social_follow_requests for update to authenticated
  using (auth.uid() = target_id) with check (auth.uid() = target_id);
create policy "social_follow_requests_delete" on public.social_follow_requests for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = target_id);

-- Stories
create policy "social_stories_select_auth" on public.social_stories for select to authenticated
  using (
    expires_at > now()
    and public.social_can_view_story(auth.uid(), author_id)
  );
create policy "social_stories_insert" on public.social_stories for insert to authenticated
  with check (auth.uid() = author_id);
create policy "social_stories_delete" on public.social_stories for delete to authenticated
  using (auth.uid() = author_id);

-- Story views
create policy "social_story_views_select" on public.social_story_views for select to authenticated
  using (
    viewer_id = auth.uid()
    or exists (select 1 from public.social_stories s where s.id = story_id and s.author_id = auth.uid())
  );
create policy "social_story_views_insert" on public.social_story_views for insert to authenticated
  with check (auth.uid() = viewer_id);

-- Bookmarks
create policy "social_bookmarks_select" on public.social_bookmarks for select to authenticated
  using (auth.uid() = user_id);
create policy "social_bookmarks_insert" on public.social_bookmarks for insert to authenticated
  with check (auth.uid() = user_id);
create policy "social_bookmarks_delete" on public.social_bookmarks for delete to authenticated
  using (auth.uid() = user_id);

-- Hashtags public read
create policy "social_hashtags_select" on public.social_hashtags for select to authenticated using (true);
create policy "social_hashtags_select_anon" on public.social_hashtags for select to anon using (true);
create policy "social_post_hashtags_select" on public.social_post_hashtags for select to authenticated using (true);
create policy "social_post_hashtags_select_anon" on public.social_post_hashtags for select to anon using (true);
-- inserts via security definer paths / authenticated with ownership of post
create policy "social_post_hashtags_insert" on public.social_post_hashtags for insert to authenticated
  with check (
    exists (select 1 from public.social_posts p where p.id = post_id and p.author_id = auth.uid())
  );
create policy "social_post_hashtags_delete" on public.social_post_hashtags for delete to authenticated
  using (
    exists (select 1 from public.social_posts p where p.id = post_id and p.author_id = auth.uid())
  );
create policy "social_hashtags_insert" on public.social_hashtags for insert to authenticated
  with check (true);
create policy "social_hashtags_update" on public.social_hashtags for update to authenticated
  using (true);

-- Mentions
create policy "social_mentions_select" on public.social_mentions for select to authenticated
  using (auth.uid() = mentioned_user_id or auth.uid() = author_id);
create policy "social_mentions_insert" on public.social_mentions for insert to authenticated
  with check (auth.uid() = author_id);

-- Blocks
create policy "social_blocks_select" on public.social_blocks for select to authenticated
  using (auth.uid() = blocker_id);
create policy "social_blocks_insert" on public.social_blocks for insert to authenticated
  with check (auth.uid() = blocker_id);
create policy "social_blocks_delete" on public.social_blocks for delete to authenticated
  using (auth.uid() = blocker_id);

-- Reports
create policy "social_reports_insert" on public.social_reports for insert to authenticated
  with check (auth.uid() = reporter_id);
create policy "social_reports_select_own" on public.social_reports for select to authenticated
  using (auth.uid() = reporter_id);

-- Hidden
create policy "social_hidden_posts_all" on public.social_hidden_posts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Preferences
create policy "social_user_preferences_all" on public.social_user_preferences for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Notification events: recipient reads; actor inserts via definer functions
create policy "social_notification_events_select" on public.social_notification_events for select to authenticated
  using (auth.uid() = recipient_id);
create policy "social_notification_events_update_consumed" on public.social_notification_events for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- profiles: allow anon read of non-private basic cards for public content
-- (existing policies from 0001 remain)
