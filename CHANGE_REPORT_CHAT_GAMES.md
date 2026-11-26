# FINO — Games in Chat

## What was built

Chat was previously a foundation landing page. This delivery adds a **minimal real Chat foundation** required to host Games-in-Chat, without claiming a full messaging product.

### Features
1. Conversations (direct via `chat_get_or_create_direct`)
2. Text messages with Realtime inserts
3. **Games icon** in the composer (Ludo, Chess, Tic-Tac-Toe)
4. **Game invitation messages** with Accept / Decline / Open
5. **Embedded game panel** in the conversation (no external app)
6. Chat remains usable while a game is open
7. System **game_event** messages (accepted / declined)
8. Persistence: `chat_game_sessions` links conversation ↔ games room/match
9. RLS: only conversation members can read/write messages and sessions
10. Invites create a private **games room** via existing `games_create_room`

### Migration
- `0006_chat_and_chat_games.sql`

### Security
- Member checks via `chat_is_member`
- Invite/accept/decline are SECURITY DEFINER RPCs with membership validation
- Game room access still governed by Games RLS/RPCs

### Files added
- `src/modules/chat/api/client.ts`
- `src/modules/chat/components/GameInviteCard.tsx`
- `src/modules/chat/chat.css`
- `src/modules/chat/ChatPage.tsx` (replaced placeholder)
- `supabase/migrations/0006_chat_and_chat_games.sql`
- `CHANGE_REPORT_CHAT_GAMES.md`

### Files modified
- `docs/FEATURE_REGISTER.md`

### Not damaged
- Social, Games engines, AppShell, auth, theme

## Tests / build
**NOT EXECUTED** in this environment. Run locally after applying migration 0006 and enabling Realtime on `chat_messages`.

## Limitations
- Group chat creation UI is minimal (schema supports `kind=group`; UI focuses on direct + invites)
- Online chess/ludo in-chat use local boards after accept; TTT can use OnlineTicTacToe when match is started
- Full Chat (voice, calls, media) remains Planned
