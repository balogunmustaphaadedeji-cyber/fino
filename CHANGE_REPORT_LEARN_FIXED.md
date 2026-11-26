# FINO Learn Fixed — Change Report

## Summary
Security and integration fixes on the existing Learn community implementation. No full rebuild. Social, Games, and core Chat architecture preserved; minimal Chat deep-link only.

## Critical fixes

### 1. Tutor verification security
- Dropped client UPDATE policy on `learn_tutor_profiles` (users could previously set `verification_status`).
- Hardened `learn_apply_tutor`: never grants `approved`; preserves existing approved only.
- Hardened `learn_review_tutor`: admin-only, **cannot review own** application.
- Status changes only via SECURITY DEFINER admin RPC.

### 2. Private / invite-only group access
- `learn_join_group`: invite-only always rejected for self-join.
- Private + open self-join blocked; private+open create rejected.
- Request path creates `pending` only until tutor approves.

### 3. Invitation acceptance
- `learn_accept_invite` requires a **pending** invite row with `invitee_id = auth.uid()`.
- No invite → exception.

### 4. FINO Chat integration
- `learn_create_group` creates linked `chat_create_group` conversation and stores `chat_conversation_id`.
- Member sync via `chat_add_group_member` on join / accept / approve.
- `learn_ensure_group_chat` for groups missing a link.
- Learn UI: **Open group chat**, **Private chat with tutor** → navigates to `/chat?c=<id>`.
- Minimal ChatPage deep-link (`useSearchParams`) opens that conversation. Uses existing messaging, attachments, voice notes, calls.

### 5. Live learning
- Tutor **Start live lesson** sets session `live` and invokes real `chat_start_call`.
- Learners **Join live lesson** open the linked Chat conversation/call UI (mic/camera controls in Chat).
- Honest behaviour: multi-participant group video is **rejected without SFU** (Chat module policy). 1:1 works with STUN/TURN Edge Function.

### 6. Tutor–learner private chat
- `openDirect(tutor_id)` then `/chat?c=…`.

### 7. Cloudinary materials
- File picker → `uploadToCloudinary` (shared signed upload) → `learn_add_material` with returned URL.
- URL paste remains as fallback.

### 8. RLS / privileges
- Migration `0010_learn_security_chat.sql` reaffirms revoke/grant on RPCs.
- No client INSERT policies on community membership tables.

## Files added
- `supabase/migrations/0010_learn_security_chat.sql`
- `supabase/tests/learn_security_tests.md`
- `CHANGE_REPORT_LEARN_FIXED.md`

## Files modified
- `src/modules/learn/api/client.ts` — ensureGroupChat, setSessionStatus, uploadLearnMaterial
- `src/modules/learn/LearnPage.tsx` — chat buttons, private chat, Cloudinary upload, live session actions, private+open validation
- `src/modules/chat/ChatPage.tsx` — deep-link `/chat?c=` only (no redesign)

## Files deleted
None.

## Environment variables
None new (uses existing `VITE_CLOUDINARY_CLOUD_NAME` + Edge Function secrets).

## Tests executed
| Test | Result |
|------|--------|
| Static review of UPDATE policy removal on tutor profiles | Pass (policy dropped in 0010) |
| Static review of learn_accept_invite invitee check | Pass (SQL requires pending invite for auth.uid()) |
| Static review of learn_join_group invite/private branches | Pass |
| Type/syntax of LearnPage + client (manual inspection) | Pass |
| Live Supabase RLS execution | **Not executed** — no project credentials in this environment |
| Live Cloudinary upload | **Not executed** — requires Edge Function + secrets |
| Live WebRTC group call | **Not executed** — requires TURN/SFU; Chat correctly documents group call rejection without SFU |
| Chat deep-link UI | **Not browser-tested** in this environment |

## Known limitations
- Group multi-party A/V still requires a deployed SFU; UI surfaces Chat’s real error.
- Cloudinary uploads fail closed until `cloudinary-sign-upload` is deployed.
- Chat member sync is best-effort if Chat RPC throws (Learn membership still authoritative).

## Unrelated modules
Social, Games — not modified. Chat — only deep-link open from query param.
