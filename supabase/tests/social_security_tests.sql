-- FINO Social RLS / trigger security tests
-- Run against a local Supabase Postgres after applying 0001–0003.
-- Usage (example):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/social_security_tests.sql
--
-- These tests use auth.uid() simulation via set_config('request.jwt.claim.sub', ...).
-- Requires roles: authenticated, anon. NOT EXECUTED in delivery sandbox without DB.

begin;

-- Helper: create auth users + profiles is environment-specific.
-- This file documents expected assertions; adapt UUIDs to your seed data.

-- Placeholder UUIDs (replace when seeding):
-- user_a public, user_b private, user_c blocked

do $$
begin
  raise notice '=== Social security test suite ===';
  raise notice 'Seed users/profiles/posts before running assertions.';
  raise notice 'Tests below are written as SQL assertions for a seeded DB.';
end $$;

-- Example assertion patterns (enable after seeding):
-- 1) Direct follow of private account without accepted request must fail
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', '<user_a>', true);
-- insert into social_follows (follower_id, following_id) values ('<user_a>', '<user_b_private>');
-- expected: exception 'private account requires an approved follow request'

-- 2) Hashtag post_count cannot be updated by client
-- update social_hashtags set post_count = 99999 where tag = 'test';
-- expected: RLS violation or 0 rows

-- 3) Notification recipient cannot change actor_id
-- update social_notification_events set actor_id = recipient_id where recipient_id = auth.uid();
-- expected: actor_id unchanged (trigger)

-- 4) Comment cannot change post_id on update
-- update social_comments set post_id = '<other>' where id = '<own_comment>';
-- expected: post_id unchanged

-- 5) Expired story not selectable
-- select * from social_stories where expires_at < now();
-- expected: 0 rows for authenticated non-owner policies

-- 6) Like on inaccessible private post fails trigger

rollback;

-- Status: NOT EXECUTED in Grok delivery environment (no live Supabase).
-- Integrators must seed and run with ON_ERROR_STOP.
