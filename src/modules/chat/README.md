# FINO Chat Module

## Scope
Private and group conversations, durable text messages, replies, edit/delete controls, media and voice-note uploads, message search, receipts, online/last-seen privacy, typing hints, call history, direct WebRTC audio/video calls and Games invitations.

## Architecture
- React UI: `ChatPage.tsx`
- Supabase access: `api/client.ts`
- Database/RLS/RPC: `supabase/migrations/0007_chat_complete.sql` (after migrations 0001–0006)
- Media signing: shared `cloudinary-sign-upload` Edge Function; chat uses the shared Cloudinary upload path
- Realtime: Postgres Changes for messages/calls/presence and a private broadcast topic for typing
- Calling: browser WebRTC peer connection, Supabase-persisted SDP/ICE signalling, optional TURN relay

## Setup
1. Apply migrations in numeric order, including `0007_chat_complete.sql`.
2. Deploy `cloudinary-sign-upload` and configure its Supabase secrets:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - Supabase function runtime values `SUPABASE_URL` and `SUPABASE_ANON_KEY`
3. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_CLOUDINARY_CLOUD_NAME`.
4. Configure TURN for production calls:
   - Deploy `webrtc-ice-servers` and set Supabase Edge Function secrets `TURN_URLS`, `TURN_SHARED_SECRET` (coturn REST shared secret), and optional `TURN_TTL_SECONDS`. Credentials are issued per authenticated user and expire; never place TURN secrets in `VITE_` variables.
5. Serve the app over HTTPS for microphone/camera permissions. Browsers may require user permission before media capture.

## Security notes
- Conversation membership and message access are enforced with RLS.
- Membership changes, message creation, receipts, calls and presence changes use authenticated RPCs.
- Message edits are restricted to the sender and a 15-minute window. Deletion is a sender-only soft delete.
- Attachment metadata is accepted only for the authenticated user's chat Cloudinary folder.
- Presence is filtered server-side by each user's `show_online` / `show_last_seen` preferences.
- Typing uses private Realtime topics authorised against conversation membership.
- Social blocks and recipient message/group-invite preferences are checked when creating new conversations or adding group members.

## Limitations / external services
- One-to-one WebRTC calls are implemented with Supabase signalling. A STUN server is provided; production reliability requires a TURN service and the Edge Function secrets above. No live TURN credentials are bundled.
- Group calls are deliberately rejected until a deployed SFU (for example, LiveKit, mediasoup or an equivalent provider) is configured.
- Browser notifications are foreground/browser notifications only; push delivery, background delivery and a service worker are not configured.
- Cloudinary URLs returned by the current shared upload contract are publicly deliverable URLs. RLS protects message records and metadata, but does not make those media URLs private. Do not treat the current media path as end-to-end private attachment storage.
- Message bodies are stored as ordinary database text protected by RLS; end-to-end encryption and client-side key management are not implemented.
- No live Supabase project was supplied, so migrations, RLS policies, Edge Function deployment, realtime, uploads and calls have not been verified end-to-end.

## Tests
- `src/modules/chat/tests/chatLogic.test.ts` covers message validation, file classification and the edit window.
- Run `npm test` and `npm run typecheck` after installing dependencies and configuring a Supabase test project.
- Perform the RLS and browser integration checklist in `supabase/tests/chat_security_tests.md`.
