# Chat integration and RLS verification checklist

Run against a disposable Supabase project after applying migrations 0001–0007 and deploying the signing function. Use two authenticated test accounts (A and B) and one unrelated account (C).

## Database/RLS checks
- A can list only conversations where A is a member.
- B can read a conversation shared with B; C cannot read its conversation, members, messages, receipts, calls or call participants.
- An authenticated user cannot insert directly into `chat_messages` or self-insert into `chat_members`.
- `chat_send_message` rejects non-members, empty/oversized text, invalid attachment hosts and attachment public IDs outside the caller's `fino/users/<uid>/chat/` folder.
- A can edit only A's normal message within 15 minutes; B cannot edit it; edits after 15 minutes fail.
- A can soft-delete A's own message; B cannot.
- Direct conversation creation fails when blocked by either side or recipient message preferences reject the sender.
- Group creation/add-member rejects blocked users and users who disable group invitations.
- Receipts can be written only by a conversation recipient for messages in that conversation. Read receipts respect the reader's preference.
- Presence RPC does not expose online/last-seen values when the target's corresponding preference is disabled.
- Call signalling is readable only by its sender/recipient and insertable only by call participants.
- A non-member cannot join a private typing topic.

## Browser integration checks
- Sign in as A and B in separate browsers; send, receive, refresh and paginate/load the latest message history.
- Verify replies, edits, soft deletion, message search, delivery/read receipts and typing hints.
- Upload and play a voice note; upload/view an image, video and PDF/document.
- Verify group membership and messages across A/B; verify C cannot access the group.
- Verify online/last-seen settings and browser notification permission behaviour.
- Test microphone/camera denial, audio/video call accept, decline, ICE reconnect, end call and missed-call history on HTTPS.
- Test WebRTC with TURN from restrictive NAT/mobile networks; STUN-only success on one network is not production validation.

Do not mark the Chat module Verified until these checks pass against the deployed project.
