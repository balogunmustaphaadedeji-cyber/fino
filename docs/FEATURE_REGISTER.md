# FINO Feature Register

Status meanings:
- **Foundation**: shared technical base exists.
- **Planned**: specified but not implemented.
- **In progress**: active development with an owner.
- **Implemented**: code exists and tests pass.
- **Verified**: tested end-to-end against the configured backend.

| Area | Feature | Status |
|---|---|---|
| Platform | React/TypeScript/Vite application shell | Foundation |
| Platform | Responsive primary navigation | Foundation |
| Platform | Shared theme provider (light/dark/system) | Foundation |
| Platform | Supabase client configuration | Foundation |
| Platform | Cloudinary shared upload contract | Foundation |
| Platform | Cloudinary signed upload function and media metadata | Planned |
| Platform | Supabase schema and RLS | Foundation |
| Platform | Authentication and recovery | Implemented |
| Platform | Central language/i18n system | Planned |
| Platform | Full settings catalogue | Implemented |
| Platform | Notifications | Planned |
| Platform | Admin console and audit logs | Planned |
| Social | Profiles, feed, posts, likes, comments | Implemented |
| Social | Follows, discovery, stories, reporting, bookmarks | Implemented |
| Social | Private accounts, blocks, hashtags, search (hardened RLS) | Implemented |
| Social | Media upload (depends on Cloudinary signing) | In progress |
| Social | Notification outbox contract | Implemented |
| Social | Shared notification UI/delivery | Planned |
| Games | Catalogue, rooms, solo play (TTT, Chess, Ludo) | Implemented |
| Games | Online rooms + authoritative match completion | Implemented |
| Games | Leaderboards, XP, achievements tables | Implemented |
| Games | Realtime match sync + matchmaking RPCs | Implemented |
| Games | Client XP/score mutation blocked (RLS/RPC) | Implemented |
| Games | E2E multiplayer verified on live Supabase | Planned |
| Chat | Direct messaging foundation + Realtime text | Implemented |
| Chat | Games-in-Chat invites + embedded play | Implemented |
| Chat | Groups, replies, editing/deletion, attachments, voice notes, search, receipts, presence/privacy | In progress (implementation added; backend not verified) |
| Chat | Direct WebRTC audio/video calls + call history | In progress (TURN and live end-to-end verification required; group calls need SFU) |
| Learn | Courses, lessons, quizzes and progress | Planned |

| Learn | Tutor applications & admin verification | Implemented |
| Learn | Learning groups (public/private, join rules) | Implemented |
| Learn | Group members, invites, join requests | Implemented |
| Learn | Group materials, announcements, sessions, assignments | Implemented |
| Learn | Community UI (Discover / My Groups / Tutor dashboard) | Implemented |
| Learn | Chat integration for group messaging/calls | In progress (link field + Chat reuse) |

| Platform | Phone + email OTP auth (Supabase Auth) | Implemented |
| Platform | Comprehensive settings (account/security/privacy/notifications/preferences/help) | Implemented |
| Platform | OTP rate-limit RPC | Implemented |
| Marketplace | Module foundation (categories, seller, products, orders schema) | Implemented |
| Marketplace | Buyer/seller roles (same account) | Implemented |
| Marketplace | Catalogue, cart, checkout, payments | Planned |
| Quality | Automated tests and CI pipeline | Planned |
| Release | PWA installability and deployment | Planned |

Do not change a status to Implemented or Verified without evidence and test results.

Social module evidence: schema migration `0002_social_module.sql`, module under `src/modules/social/`, unit test for hashtag extraction, typechecked data layer and UI. End-to-end Verified status requires a live Supabase project and deployed Cloudinary signing function.

| Learn | Core LMS (catalogue, enroll, progress, quiz RPC) | Implemented |
