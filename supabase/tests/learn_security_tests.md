# Learn community security tests

Run against a Supabase project after applying migrations through `0010_learn_security_chat.sql`.
Use two authenticated users (learner A, tutor B) and one admin (role in `user_roles`).

## Tutor verification

1. As A: `select learn_apply_tutor(array['math'], 'BA', 'bio');` → status `pending`.
2. As A: attempt `update learn_tutor_profiles set verification_status = 'approved' where user_id = auth.uid();` → **must fail** (no UPDATE policy).
3. As A: `select learn_review_tutor(auth.uid(), 'approved', null);` → **must fail** (admin only / cannot review self).
4. As admin: `select learn_review_tutor(<A>, 'approved', null);` → status `approved`.
5. As A again: apply update expertise → remains `approved` (cannot self-unapprove via apply either unless re-pending path).

## Private / invite-only join

1. Tutor creates private group with `join_rule = 'invite'`.
2. Learner calls `learn_join_group` → exception `invite only`.
3. Tutor creates private group with `join_rule = 'request'`.
4. Learner join → membership `pending`, not `active`.
5. Tutor creates public `open` group → learner join → `active`.
6. Tutor attempts `learn_create_group(..., true, 'open')` → exception private cannot be open.

## Invitation acceptance

1. Without invite row: learner `learn_accept_invite(group_id)` → `no pending invitation for this user`.
2. Tutor `learn_invite_to_group(group, learner)`.
3. Other user (not invitee) `learn_accept_invite` → fails.
4. Invitee accepts → membership `active`; invite status `accepted`.

## Chat link

1. After `learn_create_group`, `chat_conversation_id` is non-null when Chat RPCs available.
2. `learn_ensure_group_chat` returns existing id or creates one (tutor only).
3. Open `/chat?c=<id>` selects that conversation in Chat UI.

## Materials / RLS

1. Non-member cannot `select` from `learn_group_materials` for private group.
2. Only tutor RPC `learn_add_material` inserts rows.

## Calls (honest)

1. `chat_start_call` on group conversation without SFU → rejected by Chat module.
2. 1:1 tutor private chat calls use existing WebRTC + ICE servers Edge Function.

## Not executed in CI of this delivery environment

No live Supabase credentials were available in the build environment; execute the steps above on a configured project before claiming Verified status.
