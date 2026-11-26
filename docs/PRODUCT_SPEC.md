# FINO Product Specification

## Product definition

FINO is a mobile-first, global-facing super app built around four equal pillars: Social, Games, Chat and Learn. The experience should feel like one coherent product, not four unrelated apps bundled together.

**Working brand line:** Four Worlds. One App.
**Pillars:** Social • Games • Chat • Learn

## Product principles

1. One account and identity across all four pillars.
2. Shared navigation, design system, notification centre and settings.
3. Mobile-first, responsive layouts with accessible desktop support.
4. Real backend behaviour only. Never label a mock or placeholder as functional.
5. Privacy and security are foundational, not optional add-ons.
6. Each pillar can be developed independently against documented contracts.
7. The application must remain usable on modest Android devices and slower networks.

## Pillar scope

### Social
- User profiles and profile QR codes.
- Create, edit and delete own posts.
- Text and media posts.
- Feed, following and discovery.
- Reactions, comments, replies and sharing.
- Follow/unfollow and follower lists.
- Stories or temporary posts, subject to product and storage design.
- Reporting, blocking and moderation.
- Content controls and feed preferences.

### Games
- Game discovery and catalogue.
- Game detail pages and player profiles.
- Solo and multiplayer game sessions.
- Invitations, matchmaking and room codes.
- Leaderboards, achievements and game history.
- Anti-cheat and server-authoritative scoring where competitive integrity matters.
- Game-specific privacy and parental safety controls where appropriate.

### Chat
- One-to-one and group conversations.
- Text messages, replies, reactions and attachments.
- Voice notes.
- Delivery/read states and typing indicators where privacy settings permit.
- Audio/video calling with explicit permissions and reliable call signalling.
- Blocking, reporting and message controls.
- Search, archive and notification controls.
- Realtime delivery and reconnect behaviour.

### Learn
- Learning catalogue and categories.
- Courses, modules and lessons.
- Enrolment and learning progress.
- Quizzes and assessments.
- Bookmarks and learning history.
- Instructor/creator workflows and moderation.
- Certificates only when assessment and issuance rules are implemented.

## Shared platform capabilities

- Authentication, account recovery and session/device management.
- Profiles and user identity.
- Roles and permissions.
- Central settings and preferences.
- Internationalisation and locale handling.
- Notifications and notification preferences.
- Search and discovery.
- Reporting, blocking and moderation.
- Media upload, processing and delivery.
- Accessibility.
- Analytics with privacy controls.
- Help, support, legal and policy surfaces.
- Admin console, audit logs and moderation tools.

## Complete settings inventory

Settings must be centralised. Module-specific preferences may appear in a module but must be stored and governed by the shared settings system.

1. Account: personal details, username, email/phone, password, verification, active sessions, data export, deactivation and deletion.
2. Language and region: app language, translation language, automatic translation, country/region, time zone, date format, 12/24-hour clock, number and currency formats.
3. Appearance: light/dark/system, accessible contrast, text size, font scaling, reduced motion and supported accent preferences.
4. Privacy: profile visibility, online status, read receipts, discoverability, message permissions, tagging/mention permissions, blocked/restricted accounts.
5. Security: multi-factor authentication, passkeys where supported, login alerts, trusted devices, session revocation and security history.
6. Notifications: push, in-app, email, per-pillar controls, sounds, vibration, quiet hours and digest preferences.
7. Chat and calls: message previews, media auto-download, call permissions, group invitations, backup/export controls and data-saving preferences.
8. Accessibility: screen-reader labels, keyboard navigation, captions, contrast, text scaling and reduced motion.
9. Data and storage: data usage, upload/download quality, cache management, storage usage and Wi-Fi-only controls.
10. Content: interests, recommendations, sensitive-content controls, blocked keywords and feed preferences.
11. Family safety: age-appropriate experiences, supervision and guardian controls designed with applicable laws and consent.
12. Connected services: linked accounts, third-party access, connected devices and permission revocation.
13. Help and legal: help centre, contact support, report a problem, community standards, terms, privacy policy and app version.

## Non-functional requirements

- Enforce authorisation on the server/database, not only in the UI.
- Use Row Level Security for every user-owned Supabase table.
- Never expose service-role keys, signing secrets or privileged credentials in client code.
- Validate and rate-limit sensitive operations.
- Use pagination for feeds, messages, course lists and other growing collections.
- Provide loading, empty, offline, retry and error states.
- Support keyboard and screen-reader access.
- Avoid heavy animations, unnecessary dependencies and oversized media.
- Test mobile viewport sizes and low-bandwidth behaviour.
- Provide auditability for administrative actions.
