# FINO Games — Change Report V2

## Security fixes
- Dropped `games_players_update_own` (clients can no longer write XP/wins/losses).
- Dropped unrestricted `games_matches_update_participant` (no client winner/status edits).
- Added `games_submit_action` with version check (stale_state), participant check, audit events.
- Hardened `games_complete_match`: idempotent, winner must be participant, no double XP.
- RPCs: `games_start_room_match`, `games_leave_room`, `games_matchmake`, `games_invite_to_room`.

## Multiplayer
- Public matchmaking RPC, private rooms, leave, ready, host start.
- Realtime subscriptions: `subscribeMatch`, `subscribeRoomPlayers`.
- Online Tic-Tac-Toe with turn validation + versioned state sync.
- Invitations list/respond API.

## Games
- Ludo defaults to 4 colours with 3 CPU opponents in solo.
- Chess unchanged rules engine (chess.js).
- TTT local + online paths.

## Migration
- `0005_games_security_multiplayer.sql` (additive)

## Files
- Added: OnlineTicTacToe.tsx, 0005 migration, tests, this report
- Modified: api/client.ts, GamesPage.tsx, LudoBoard.tsx, types, games.css

## Tests / build
**NOT EXECUTED** in delivery sandbox (`npm install` registry limits).  
Run locally: `npm install && npm run test && npm run typecheck && npm run build`.

## Limitations
- Chess/Ludo online UI still primarily solo; TTT has full online path — same submitMatchAction pattern extends to others.
- Full visual Ludo track board is token-list based (logical positions authoritative).
- Realtime requires Supabase Realtime enabled on `games_matches` / `games_room_players`.

## Deploy
Apply migrations 0001–0005. Enable Realtime for games tables. No new env vars.

## Preserved
Social, Chat, Learn, AppShell, auth, theme.
