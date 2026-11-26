# FINO Architecture

## Baseline

- Client: React + TypeScript + Vite.
- Routing: React Router.
- Data/auth: Supabase Auth + PostgreSQL + Row Level Security.
- Realtime: Supabase Realtime for supported presence and message events.
- Trusted server operations: Supabase Edge Functions or a separately deployed API.
- Styling: shared CSS tokens and reusable components; no module-specific design systems.
- Tests: TypeScript checks, unit/component tests and integration tests.

## System boundaries

The browser is an untrusted client. It may use the Supabase anon/publishable key with RLS. It must never contain a service-role key, database password, private media signing secret or admin secret.

Privileged actions must pass through a trusted server boundary. Examples include role assignment, moderation actions, payment-related actions, media signing, sensitive account operations and authoritative game results.

## Shared layers

- `src/app`: application bootstrap, routes and providers.
- `src/shared`: design system, layout, settings, notifications, shared identity and reusable UI.
- `src/lib`: infrastructure clients and typed utilities.
- `src/modules/social`: social module only.
- `src/modules/games`: games module only.
- `src/modules/chat`: chat module only.
- `src/modules/learn`: learning module only.
- `supabase/migrations`: ordered database migrations.
- `supabase/functions`: trusted server functions.
- `docs`: source-of-truth product and engineering contracts.

## Module isolation

A module owns its own UI, domain logic and module-specific data access. It may import shared contracts and shared UI. It must not modify another module's directory.

Shared schema changes require a migration and a documented contract update. A module must not silently rename or repurpose shared tables or fields.

## Data ownership

- `profiles`: shared public-facing identity fields.
- `user_preferences`: private user settings and locale preferences.
- `user_roles`: trusted role assignments.
- Pillar-specific tables are owned by their module and must be added through migrations.

Every user-owned table must have RLS enabled and policies reviewed before the module is accepted.

## Authentication

Supabase Auth is the identity provider. The client must obtain the current session from the official client SDK. A profile row is associated with `auth.users.id`. Never create a separate, competing password store.

## Internationalisation

All user-facing strings must be translation-key driven before additional languages are introduced. Do not hard-code text throughout module components. Store locale preference centrally. A language must not appear as selectable until its translation coverage is ready and tested.

## Settings

The shared settings provider owns global theme and locale state. Module preferences are namespaced and registered through the shared settings contract. Avoid independent settings pages or competing local-storage keys.

## Media

Modules must call a shared media interface. Uploads must validate file type, size and ownership. Private media must use access-controlled delivery. Signing credentials remain server-side. Provider selection can be changed behind the interface without rewriting modules.

## Realtime and calls

Realtime events are not a replacement for durable database records. Persist messages and other important events first, then use realtime to notify clients. Audio/video calls require a signalling design and a WebRTC-compatible media path; do not claim calling works until end-to-end tests pass.

## Quality gates

A module is not integrated until:
- TypeScript passes.
- Lint/test checks pass when configured.
- Database migrations apply cleanly.
- RLS policies are tested for allowed and forbidden access.
- Mobile and desktop UI states are checked.
- Loading, empty, error and offline states are handled.
- No unrelated files or module ownership boundaries were changed.


## Cloudinary media integration

Cloudinary is the selected shared media storage, transformation and delivery provider.
All four pillars must use `src/shared/media/cloudinary.ts` or a future shared media
interface rather than implementing their own provider integration.

The browser must never receive the Cloudinary API secret. Signed uploads require the
authenticated `cloudinary-sign-upload` trusted function. Store media ownership and
Cloudinary public IDs in Supabase. Deletion must be authorised server-side.

Current status: client upload contract and security requirements are scaffolded;
the signing Edge Function, metadata tables, upload UI, deletion flow and end-to-end
verification are not implemented yet.
