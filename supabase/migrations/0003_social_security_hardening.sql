-- FINO Social security hardening (v3)
-- Apply after 0002_social_module.sql

-- ---------------------------------------------------------------------------
-- 1. Hashtag security: revoke direct count manipulation
-- ---------------------------------------------------------------------------
drop policy if exists "social_hashtags_insert" on public.social_hashtags;
drop policy if exists "social_hashtags_update" on public.social_hashtags;

-- Only SELECT remains for clients. Inserts/updates via security definer helpers.
create or replace function public.social_ensure_hashtag(p_tag text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tag text := lower(trim(p_tag));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v_tag is null or char_length(v_tag) < 2 or char_length(v_tag) > 50 then
    raise exception 'invalid hashtag';
  end if;
  select id into v_id from public.social_hashtags where tag = v_tag;
  if v_id is null then
    insert into public.social_hashtags (tag, post_count)
    values (v_tag, 0)
    on conflict (tag) do update set tag = excluded.tag
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.social_hashtags where tag = v_tag;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.social_ensure_hashtag(text) from public;
grant execute on function public.social_ensure_hashtag(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Protect system counters on posts (reject client-supplied counter changes)
-- ---------------------------------------------------------------------------
create or replace function public.social_posts_protect_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.like_count := old.like_count;
    new.comment_count := old.comment_count;
    new.media_count := old.media_count;
    -- author_id immutable
    new.author_id := old.author_id;
  end if;
  return new;
end;
$$;

drop trigger if exists social_posts_protect_counters_trg on public.social_posts;
create trigger social_posts_protect_counters_trg
  before update on public.social_posts
  for each row execute function public.social_posts_protect_counters();

-- ---------------------------------------------------------------------------
-- 3. Comment field protection
-- ---------------------------------------------------------------------------
create or replace function public.social_comments_protect_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.post_id := old.post_id;
    new.author_id := old.author_id;
    new.parent_id := old.parent_id;
    new.depth := old.depth;
    new.like_count := old.like_count;
    -- only body (and is_edited flag) may change
    if new.body is distinct from old.body then
      new.is_edited := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists social_comments_protect_fields_trg on public.social_comments;
create trigger social_comments_protect_fields_trg
  before update on public.social_comments
  for each row execute function public.social_comments_protect_fields();

-- ---------------------------------------------------------------------------
-- 4. Notification events: only consumed_at updatable by recipient
-- ---------------------------------------------------------------------------
drop policy if exists "social_notification_events_update_consumed" on public.social_notification_events;

create or replace function public.social_notification_protect_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.recipient_id then
    raise exception 'only recipient may update notification';
  end if;
  -- lock immutable fields
  new.id := old.id;
  new.event_type := old.event_type;
  new.actor_id := old.actor_id;
  new.recipient_id := old.recipient_id;
  new.entity_type := old.entity_type;
  new.entity_id := old.entity_id;
  new.payload := old.payload;
  new.created_at := old.created_at;
  -- only consumed_at may change
  return new;
end;
$$;

drop trigger if exists social_notification_protect_update_trg on public.social_notification_events;
create trigger social_notification_protect_update_trg
  before update on public.social_notification_events
  for each row execute function public.social_notification_protect_update();

create policy "social_notification_events_update_consumed"
  on public.social_notification_events for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- No client INSERT into notification outbox
drop policy if exists "social_notification_events_insert" on public.social_notification_events;
-- inserts only via security definer social_emit_notification

-- ---------------------------------------------------------------------------
-- 5. Mention validation
-- ---------------------------------------------------------------------------
create or replace function public.social_mentions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null or auth.uid() <> new.author_id then
    raise exception 'mention author must be authenticated user';
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.mentioned_user_id) then
    raise exception 'mentioned user does not exist';
  end if;
  if public.social_is_blocked(new.author_id, new.mentioned_user_id) then
    raise exception 'cannot mention blocked user';
  end if;
  if new.post_id is not null then
    select author_id into v_author from public.social_posts where id = new.post_id;
    if v_author is null or v_author <> new.author_id then
      raise exception 'mention post must belong to author';
    end if;
  end if;
  if new.comment_id is not null then
    select author_id into v_author from public.social_comments where id = new.comment_id;
    if v_author is null or v_author <> new.author_id then
      raise exception 'mention comment must belong to author';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists social_mentions_before_insert_trg on public.social_mentions;
create trigger social_mentions_before_insert_trg
  before insert on public.social_mentions
  for each row execute function public.social_mentions_before_insert();

-- Unique mention per (post|comment, user)
create unique index if not exists social_mentions_post_user_uidx
  on public.social_mentions (post_id, mentioned_user_id)
  where post_id is not null;
create unique index if not exists social_mentions_comment_user_uidx
  on public.social_mentions (comment_id, mentioned_user_id)
  where comment_id is not null;

-- Mention notification
create or replace function public.social_mentions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.social_emit_notification(
    'mention', new.author_id, new.mentioned_user_id,
    case when new.post_id is not null then 'post' else 'comment' end,
    coalesce(new.post_id, new.comment_id),
    '{}'::jsonb
  );
  return null;
end;
$$;

drop trigger if exists social_mentions_after_insert_trg on public.social_mentions;
create trigger social_mentions_after_insert_trg
  after insert on public.social_mentions
  for each row execute function public.social_mentions_after_insert();

-- ---------------------------------------------------------------------------
-- 6. SECURITY DEFINER audit: revoke PUBLIC, grant authenticated selectively
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'social_is_blocked(uuid,uuid)',
    'social_is_following(uuid,uuid)',
    'social_can_view_profile_content(uuid,uuid)',
    'social_can_view_post(uuid,uuid,text)',
    'social_can_view_story(uuid,uuid)',
    'social_emit_notification(text,uuid,uuid,text,uuid,jsonb)',
    'social_ensure_hashtag(text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
exception when others then
  raise notice 'grant/revoke partial: %', sqlerrm;
end;
$$;

-- Anon needs can_view helpers for public feed policies
grant execute on function public.social_is_blocked(uuid,uuid) to anon;
grant execute on function public.social_can_view_profile_content(uuid,uuid) to anon;
grant execute on function public.social_can_view_post(uuid,uuid,text) to anon;
grant execute on function public.social_can_view_story(uuid,uuid) to anon;

-- social_emit_notification: only definer callers; revoke from authenticated clients
revoke all on function public.social_emit_notification(text,uuid,uuid,text,uuid,jsonb) from public;
revoke all on function public.social_emit_notification(text,uuid,uuid,text,uuid,jsonb) from authenticated;
revoke all on function public.social_emit_notification(text,uuid,uuid,text,uuid,jsonb) from anon;

-- ---------------------------------------------------------------------------
-- 7. media_count sync on media insert/delete
-- ---------------------------------------------------------------------------
create or replace function public.social_bump_media_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.social_posts set media_count = media_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.social_posts set media_count = greatest(0, media_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists social_post_media_count_trg on public.social_post_media;
create trigger social_post_media_count_trg
  after insert or delete on public.social_post_media
  for each row execute function public.social_bump_media_count();

-- ---------------------------------------------------------------------------
-- 8. Follow request: prevent requester from updating (already in 0002; reinforce)
-- ---------------------------------------------------------------------------
-- (covered by social_follow_requests_before_update)

