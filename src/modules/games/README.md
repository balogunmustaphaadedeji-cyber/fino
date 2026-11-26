# FINO Games Module

Playable **Tic-Tac-Toe**, **Chess** (chess.js rules), and **Ludo** with catalogue, rooms, match records, XP, and leaderboards.

## Migrations

`supabase/migrations/0004_games_module.sql`

## Multiplayer

- `games_create_room` / join by code
- Match completion via **`games_complete_match`** RPC (authoritative XP/stats)

Realtime channel wiring can subscribe to `games_matches` / `games_match_events` after deploy.

## Solo

Local engines work offline; match/leaderboard persistence needs Supabase auth + migration.

## Tests

`src/modules/games/tests/ticTacToe.test.ts`, `ludo.test.ts`
