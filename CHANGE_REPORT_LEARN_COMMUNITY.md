# FINO Learn Community — Change Report

## Summary
Transformed Learn from a course-library LMS into a **community-based learning platform** with Learner / Tutor / Admin roles, tutor verification, learning groups, materials, scheduled sessions, and assignments. Existing course/lesson/quiz flows are preserved.

## Files added
- `supabase/migrations/0009_learn_community.sql`
- `CHANGE_REPORT_LEARN_COMMUNITY.md`

## Files modified
- `src/modules/learn/types/index.ts` — community types
- `src/modules/learn/api/client.ts` — tutor/group/material/session/assignment APIs + RPCs
- `src/modules/learn/LearnPage.tsx` — Discover, Tutors, Groups, Admin review, Group detail tabs
- `src/modules/learn/learn.css` — nav, forms, error, rows
- `src/modules/learn/README.md`
- `docs/FEATURE_REGISTER.md` (Learn community rows)

## Files deleted
None.

## Database migrations added
- `0009_learn_community.sql`
  - Tables: `learn_tutor_profiles`, `learn_groups`, `learn_group_members`, `learn_group_invites`, `learn_group_materials`, `learn_group_announcements`, `learn_scheduled_sessions`, `learn_assignments`, `learn_assignment_submissions`
  - Helpers: `is_approved_tutor`, `is_platform_admin`, `is_group_member`, `is_group_tutor`
  - RPCs: apply/review tutor, create/join group, invites, materials, announcements, sessions, assignments, submit assignment, create course (tutor-gated)
  - RLS policies for all new tables

## Environment variables added
None.

## Tests executed
Not executed in this environment (no live Supabase / npm registry run for full E2E).

## Known limitations
- Full WebRTC group live class requires Chat SFU; UI points users to Chat for messaging/calls
- Material “upload” accepts URLs (Cloudinary signed upload can be wired via shared media contract)
- Tutor discovery shows profile fields only (no follow graph yet; Social follows can be used separately)
- Admin tutor queue is status-based UI inside Learn (no separate global admin console)
- `createCourse` direct insert still exists for backward compatibility; UI uses `createCourseAsTutor` RPC
- Private group visibility relies on RLS + membership; invite flow uses `learn_group_invites`

## Unrelated modules
Social, Games, Chat, shell, auth, theme — **not modified**.
