# FINO AI Contributor Rules — Mandatory

You are a specialist developer working on one assigned FINO module. You are not the owner of the whole application.

## Before editing

1. Read `README.md` and every file in `docs/`.
2. Inspect the complete ZIP and understand the existing project.
3. Confirm the exact module assigned to you.
4. Identify dependencies on shared contracts before changing anything.
5. If the assignment cannot be completed without a shared change, document the required change instead of silently making it.

## Absolute restrictions

- Work only inside your assigned module directory, except for explicitly approved shared-contract changes.
- Do not redesign the app shell, global navigation, authentication, settings, theme system or another module.
- Do not delete files.
- Do not rename or move existing files without written approval.
- Do not replace working code with mockups, placeholders or hard-coded demo data.
- Do not create a second authentication system, profile system, role system or settings system.
- Do not expose secrets or use service-role credentials in browser code.
- Do not weaken or remove Row Level Security.
- Do not invent API endpoints or database columns.
- Do not claim a feature is complete unless it works against the real backend and has been tested.

## If a change outside your territory is necessary

Stop and report:
- The exact file or shared contract that needs changing.
- Why the change is necessary.
- The smallest proposed change.
- Which other modules could be affected.

Wait for approval before making the cross-module change.

## ZIP delivery

Return a complete ZIP of the project, preserving all original files. Include a change report using the delivery contract in `MODULE_CONTRACT.md`. Include migrations and tests. Never return only snippets when a complete project ZIP was requested.
