# FINO Social Module — Change Report v3 (final correction)

## 1. Security issues corrected

- Hashtag table: removed client INSERT/UPDATE policies; creation via `social_ensure_hashtag` security definer RPC; counts only via `social_post_hashtags` triggers.
- Post counters (`like_count`, `comment_count`, `media_count`, `author_id`) locked on UPDATE by trigger.
- Comment UPDATE locks `post_id`, `author_id`, `parent_id`, `depth`, `like_count`; only body editable.
- Notification events: no client INSERT; UPDATE limited to `consumed_at` with immutable field trigger.
- Mentions: BEFORE INSERT validates author, existing user, block, post/comment ownership; unique indexes; AFTER INSERT emits mention notification.
- SECURITY DEFINER: explicit `search_path=public`; PUBLIC revoked; selective GRANT to authenticated/anon; `social_emit_notification` not executable by clients.
- Media count synced by trigger on media insert/delete.

## 2. Database policies changed

- Migration **0003_social_security_hardening.sql** (additive after 0002).
- Dropped open hashtag write policies; hardened notification update; mention triggers; counter protection.

## 3. SECURITY DEFINER functions audited

- `social_is_blocked`, `social_is_following`, `social_can_view_*`, `social_emit_notification`, `social_ensure_hashtag`, protect_* triggers.
- All set `search_path = public`.
- Client cannot call `social_emit_notification`.

## 4. Mention functionality

- `extractMentions` / `splitCaptionWithMentions`.
- `persistMentions` on createPost and createComment.
- DB validation + mention notification event.

## 5. Notification integration

- Outbox table + triggers for follower, request, accept, like, comment, reply, mention.
- Contract: `src/modules/social/docs/NOTIFICATION_CONTRACT.md`.
- Shared UI/worker still platform-owned; Social only writes outbox.

## 6. Cloudinary function implementation

- Full source: `supabase/functions/cloudinary-sign-upload/index.ts`
- Validates JWT, MIME, size, resource type, purpose; folder `fino/users/<uid>/<purpose>`.
- Client passes `purpose` (post/story/profile/cover).
- **Not live** until secrets + deploy.

## 7. Story functionality

- Image timer progress; video progress from `currentTime/duration`.
- Pause/resume, prev/next, onEnded, onError recovery, view recording, cleanup on unmount paths.

## 8–10. Files

**Added:** `0003_social_security_hardening.sql`, edge function `index.ts`, SQL tests, CHANGE_REPORT_SOCIAL_v3.md  

**Modified:** cloudinary.ts, api/client.ts, CreatePost, StoriesBar, READMEs  

**Deleted:** none  

## 11. Tests executed and actual results

| Suite | Result |
|---|---|
| Vitest unit (`security-logic`, `qr`, `hashtags`) | **NOT EXECUTED** in delivery sandbox (npm registry unreliable) |
| SQL `social_security_tests.sql` | **NOT EXECUTED** (no live Supabase) |

Integrators must run `npm install && npm run test && npm run typecheck && npm run build` and SQL tests locally.

## 12. Build and typecheck

**NOT EXECUTED** in this environment. Code changes are typed against existing strict settings; no `any` escapes added.

## 13. Remaining limitations

- Cloudinary operational only after deploy + secrets.
- Shared notification delivery worker not in this module.
- SQL tests require seeded local Supabase.

## 14. External configuration

- Env: `VITE_SUPABASE_*`, `VITE_CLOUDINARY_CLOUD_NAME`
- Function secrets: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Migrations 0001 → 0002 → 0003

## 15–16. Confirmations

- Games, Chat, Learn untouched.
- FINO colour CSS variables unchanged (no new palette, gradients, or glass).
