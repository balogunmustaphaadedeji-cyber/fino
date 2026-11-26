# FINO Games Module — Change Report

## 1. Features implemented

- Games home: catalogue, search, category filter, player stats bar, recent matches
- Playable **Tic-Tac-Toe** (rules, AI, win/draw)
- Playable **Chess** via chess.js (legal moves, check/mate/stalemate, castling/ep/promotion supported by library, weak CPU)
- Playable **Ludo** (dice, yard exit on 6, safe squares, capture, home path, win, CPU, extra turn on 6, three-six bust)
- Rooms: create (RPC), join by code, lobby UI
- Matches: create, state update, **authoritative** `games_complete_match` for XP/wins/achievements
- Leaderboard from `games_players.xp`
- Achievements seed + first_win grant on complete
- RLS on all games tables

## 2. Files added

- `src/modules/games/**` (engines, components, api, tests, css, README)
- `supabase/migrations/0004_games_module.sql`
- `CHANGE_REPORT_GAMES.md`

## 3. Files modified

- `package.json` (chess.js)
- `docs/FEATURE_REGISTER.md`
- `src/modules/games/GamesPage.tsx` (replaced placeholder)

## 4. Files deleted

None.

## 5. Migrations

- `0004_games_module.sql`

## 6. Environment variables

Existing Supabase + optional Cloudinary; no new client secrets.

## 7. Dependencies added

- `chess.js` ^1.0.0

## 8. Commands executed

- ZIP extract, file writes, packaging  
- **`npm install` / `typecheck` / `test` / `build`: NOT EXECUTED** in this environment (registry limits)

## 9. Tests

- Unit tests written for TTT and Ludo  
- **NOT EXECUTED** here — run `npm run test` locally after install

## 10. Known limitations

- Online multiplayer is room + match record based; full board state sync via Realtime channels is ready for extension (state stored on `games_matches.state`) but UI focuses on solo/CPU + room codes
- Chess CPU is random legal moves (not an engine)
- Ludo is 2-player simplified track model (4-player seats supported in room max_slots)
- Leaderboard shows user id prefix until profile join UI is expanded
- E2E against live Supabase **not verified** in delivery sandbox

## 11. Backend deployment

1. Apply migration `0004_games_module.sql`
2. `npm install` (pulls chess.js)
3. Configure Supabase auth so `games_ensure_player` / complete match work

## 12. Confirmation

Social, Chat, Learn, AppShell, auth, and shared theme/CSS variables were **not** redesigned. Games owns `src/modules/games/` and migration `0004` only (+ package dependency and feature register).
