# FINO Learn — Change Report

## Implemented
- Learn home (search, categories, continue learning, catalogue)
- Courses, lessons, enroll, progress, complete lesson
- Bookmarks, notes
- Quizzes with server grading
- Flashcards list, discussions, reviews
- Certificates, student XP/streak stats
- Create/publish course + add lesson (instructor = authenticated user)
- RLS + RPCs: learn_enroll, learn_complete_lesson, learn_submit_quiz

## Database
- Migration **0008_learn_module.sql**

## Files
- `src/modules/learn/**` (LearnPage, api, types, css, README)
- `CHANGE_REPORT_LEARN.md`
- `docs/FEATURE_REGISTER.md` updated

## Preserved
Social, Games, Chat, shell, auth, theme — not redesigned.

## Tests
**Not executed** in this environment (no npm registry run).

## Limitations
- Admin approve queue is status-based; no separate admin UI console
- Video/PDF use URL fields (Cloudinary URLs can be stored; upload uses existing shared signing when wired by instructor)
- correct_index still in base table (instructors); students should use public view
- No automated seed courses (real data only via create UI)
- Share-to-Social achievement post is not automated
