# FINO Learn Module

Community-based learning platform (not admin-only course library).

## Roles
- **Learner** — default for all authenticated users
- **Tutor** — apply + admin approval (`learn_tutor_profiles`)
- **Admin** — platform `user_roles.role = admin`; reviews tutor applications

Users may hold learner + tutor on the same account.

## Tutor capabilities
- Create/edit/publish courses (RPC `learn_create_course` requires approved tutor)
- Create public/private learning groups with join rules (open / request / invite)
- Invite learners, approve join requests, manage members
- Upload materials (URL), post announcements
- Schedule live sessions
- Create assignments; learners submit
- Group messaging/calls: integrate with FINO Chat (do not duplicate Chat module)

## Learner capabilities
- Discover tutors, public groups, courses
- Join open groups or request private ones; accept invites
- Enroll in courses, complete lessons, quizzes (server-graded)
- Submit assignments; track progress / XP

## Migrations
- `0008_learn_module.sql` — LMS core
- `0009_learn_community.sql` — tutors, groups, materials, sessions, assignments, RLS + RPCs

## Security
- All mutating group/tutor operations go through SECURITY DEFINER RPCs
- RLS on community tables; membership checks via helper functions
- Quiz scoring remains server-side

## Chat integration
Group `chat_conversation_id` is reserved for linking to Chat conversations.
Use existing Chat messaging and 1:1 WebRTC; group A/V requires SFU (see Chat docs).
