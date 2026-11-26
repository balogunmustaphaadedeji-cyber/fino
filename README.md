# FINO — Four Worlds. One App.

FINO is a mobile-first super app organised around four connected pillars:

- **Social** — profiles, feeds, posts, comments, reactions, follows and discovery.
- **Games** — game catalogue, player profiles, multiplayer experiences and leaderboards.
- **Chat** — direct/group messaging, replies, media and voice notes, receipts, presence, search and direct WebRTC calls (backend deployment/configuration required).
- **Learn** — courses, lessons, learning progress and educational resources.

The four pillars share one account system, one design system, one settings system, one notification centre and one security model.

> Project status: foundation scaffold. This is not a production-ready or deployed application yet. No fake login, fake messages, fake games or fake learning data are included.

## Technology baseline

- React + TypeScript + Vite for the mobile-first client.
- Supabase for authentication, PostgreSQL, Row Level Security and Realtime.
- Supabase Edge Functions or a separately deployed trusted server for privileged operations.
- Cloudinary for shared media storage, transformation and delivery. Signed uploads must be authorised by a trusted server function; never expose private provider secrets in the browser.
- PWA-ready structure; native Android packaging can be considered after the web app foundation is stable.

## Start locally

1. Install Node.js LTS.
2. Extract this ZIP.
3. Open a terminal in the `FINO` folder.
4. Run `npm install`.
5. Copy `.env.example` to `.env.local`.
6. Add your Supabase project URL and anon/publishable key.
7. Run `npm run dev`.

Without Supabase credentials, the app shell opens, but authentication and data-backed features remain unavailable. This is intentional: the project must not pretend that a backend feature works when it is not connected.

## Project documents

- `docs/PRODUCT_SPEC.md` — product scope and non-negotiable requirements.
- `docs/ARCHITECTURE.md` — technical architecture and shared systems.
- `docs/MODULE_CONTRACT.md` — contracts every module must follow.
- `docs/AI_WORK_RULES.md` — strict rules for AI contributors.
- `docs/FEATURE_REGISTER.md` — feature status register.
- `docs/SECURITY.md` — security baseline.
- `supabase/migrations/0001_core_foundation.sql` — initial database foundation.

## Important

The name FINO and the tagline are working brand choices, not a trademark/domain clearance. Check trademark, company-name, domain and social-handle availability before public launch.
