# FINO Social Module (v3)

Hardened Social pillar: feeds, posts, comments, follows, stories, search, mentions, notification outbox.

## Security (v3)

- Migration `0003_social_security_hardening.sql`
- Counter protection, hashtag RPC-only writes, comment field locks, notification immutability, mention validation
- SECURITY DEFINER functions audited (search_path, grants)

## Cloudinary

Edge Function source: `supabase/functions/cloudinary-sign-upload/`. Deploy and set secrets before media works.

## Notifications

Outbox: `social_notification_events`. See `docs/NOTIFICATION_CONTRACT.md`.

## Mentions

Detected on post/comment create; stored in `social_mentions`; notify via outbox.

## Tests

- Unit: `src/modules/social/tests/*`
- SQL: `supabase/tests/social_security_tests.sql` (requires local Supabase)

## Migrations

1. `0001_core_foundation.sql`
2. `0002_social_module.sql`
3. `0003_social_security_hardening.sql`
