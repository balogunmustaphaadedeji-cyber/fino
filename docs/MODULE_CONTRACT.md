# FINO Module Contract

Every AI or human contributor must follow this contract.

## Shared assumptions

- One FINO account identity across all modules.
- One shared profile model and role system.
- One central settings provider.
- One shared navigation and design system.
- Supabase Auth is the only authentication authority.
- PostgreSQL tables are protected by RLS.
- All API/database changes are delivered as ordered migrations.
- User-facing text must be prepared for internationalisation.
- All modules must support light, dark and system themes.

## Module interface

Each module must expose:
- A route entry component.
- A typed module navigation/config entry if it adds navigation.
- Domain types for its own data.
- Data-access functions isolated from presentation components.
- Tests for critical behaviour.
- A README describing files changed, setup, migrations, environment variables, limitations and tests run.

## Database contract

- Use UUID primary keys unless a documented reason requires otherwise.
- Use `created_at` and `updated_at` timestamps for mutable records.
- Use foreign keys and indexes for common query paths.
- Enable RLS on every exposed table.
- Write explicit SELECT/INSERT/UPDATE/DELETE policies.
- Never trust a client-supplied user ID for ownership; derive identity from the authenticated session in policies or trusted server code.
- Do not grant users permission to assign themselves admin/moderator roles.

## API contract

- Define request and response types.
- Validate all inputs at the server boundary.
- Return consistent errors; never leak secrets or stack traces.
- Apply pagination to collection endpoints.
- Add rate limits to abuse-prone endpoints.
- Document any realtime event name and payload.

## UI contract

- Reuse shared components and CSS tokens.
- Do not introduce a new colour palette, typography system or navigation shell.
- Avoid gradients, excessive rounding, glass effects and decorative clutter.
- Use responsive, mobile-first layouts.
- Provide accessible labels and visible focus states.
- Include loading, empty, error and retry states.
- Never display fake records as if they came from production.

## Delivery contract

Return the entire updated project ZIP plus a change report. The report must list:
1. Files added.
2. Files modified.
3. Files deleted (must be empty unless explicitly approved).
4. Database migrations added.
5. Environment variables added.
6. Tests executed and results.
7. Known limitations.
8. Confirmation that unrelated modules were not changed.

Do not overwrite the only working copy. Work on a versioned copy and preserve the previous ZIP.
