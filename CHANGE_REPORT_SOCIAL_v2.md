# FINO Social Module — Change Report v2

## 1. Security issues corrected

- **Private follows**: BEFORE INSERT trigger on `social_follows` rejects direct follows of private accounts unless an accepted request exists. Self-follow and blocked follows rejected.
- **Follow requests**: Only target may UPDATE; status transitions limited to pending → accepted|rejected; requester/target immutable; acceptance creates follow atomically; notifications emitted.
- **Blocks**: AFTER INSERT cleans follows and requests both directions; helpers `social_is_blocked` used in view/like/comment/story paths.
- **Post media**: BEFORE INSERT requires `auth.uid() = owner_id` and post.author_id = owner_id.
- **Comments**: BEFORE INSERT checks post accessibility, blocks, parent same-post, depth ≤ 2 in database.
- **Likes**: BEFORE INSERT checks post accessibility; PK prevents duplicates.
- **Stories / views**: SELECT only non-expired + viewable; views BEFORE INSERT checks expiry and privacy.
- **Hashtags**: counts maintained only via `social_post_hashtags` trigger; reconcile on caption edit; zero-count hashtags removed.
- **Public media**: anon SELECT policies for public non-private posts and their media.
- **Roles**: no user-assignable admin/moderator paths added.
- **Notification outbox**: `social_notification_events` with RLS; triggers emit social events for shared consumer.

## 2. Functional issues corrected

- Profile QR: in-app `qrcode` library (no external API).
- Stories: auto-progress for images, progress bar, pause on hold, prev/next, video onEnded, server expiry still enforced.
- Mentions: extract + split helpers; storage path via `social_mentions` (API ready).
- Hashtag counts: DB-safe triggers + reconcile on edit.
- Profile counters: unchanged triggers (insert/delete follow & post).
- Vitest config: `defineConfig` from `vitest/config` to fix typing.
- Upload progress: multi-file step progress only; true byte progress requires XHR progress on signed upload (documented limitation until signing function exposes it).

## 3. Files added

- `src/modules/social/utils/qr.ts`
- `src/modules/social/utils/mentions.ts`
- `src/modules/social/docs/NOTIFICATION_CONTRACT.md`
- `src/modules/social/tests/security-logic.test.ts`
- `src/modules/social/tests/qr.test.ts`
- `CHANGE_REPORT_SOCIAL_v2.md`

## 4. Files modified

- `supabase/migrations/0002_social_module.sql` (full harden)
- `src/modules/social/components/ProfileView.tsx` (QR)
- `src/modules/social/components/StoriesBar.tsx` (viewer)
- `src/modules/social/api/client.ts` (hashtags, updatePost)
- `src/modules/social/social.css` (story UI)
- `vite.config.ts` (vitest/config)
- `package.json` (`qrcode`, `@types/qrcode`)
- `docs/FEATURE_REGISTER.md`
- `src/modules/social/README.md`

## 5. Files deleted

None.

## 6. Database migrations

- Replaced/hardened `0002_social_module.sql` (tables, helpers, triggers, RLS, notification outbox).

## 7–8. Tests executed and results

Commands intended:

```
npm install
npm run test
npm run typecheck
npm run build
```

**Sandbox limitation:** npm registry access was unreliable in the delivery environment. Tests were **written** (`security-logic.test.ts`, `qr.test.ts`, `hashtags.test.ts`) but **not executed successfully in this environment**. Integrators must run the commands locally and record results.

## 9. Remaining limitations

- Cloudinary `cloudinary-sign-upload` still not implemented (shared).
- Shared notification UI/worker not present; outbox contract defined.
- Auth/profile bootstrap shared.
- Byte-level upload progress needs enhanced client + signing response.
- Live RLS tests require a Supabase project.

## 10. External configuration

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`
- Apply migrations 0001 then 0002
- Deploy Cloudinary signing function for media

## 11. Shared infrastructure dependencies

- Cloudinary sign-upload Edge Function
- Profile row on signup
- Notification consumer for `social_notification_events`

## 12. Confirmation

Games, Chat, Learn modules were not modified.

## 13. Colour palette

Preserved FINO CSS variables only (`--green` #16834A / dark #54C783, surfaces, borders). No new palette, gradients, or glassmorphism.
