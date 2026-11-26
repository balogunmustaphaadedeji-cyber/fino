-- FINO Learn Module

create table if not exists public.learn_categories (
  id text primary key,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0
);

insert into public.learn_categories (id, title, description, sort_order) values
  ('technology', 'Technology', 'Programming, tools, digital skills', 1),
  ('business', 'Business', 'Entrepreneurship and management', 2),
  ('language', 'Language', 'Language learning', 3),
  ('life-skills', 'Life Skills', 'Practical everyday skills', 4)
on conflict do nothing;

create table if not exists public.learn_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null default '',
  description text not null default '',
  category_id text references public.learn_categories(id) on delete set null,
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  cover_url text,
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'published', 'archived')),
  is_free boolean not null default true,
  lesson_count integer not null default 0 check (lesson_count >= 0),
  enrollment_count integer not null default 0 check (enrollment_count >= 0),
  rating_sum numeric not null default 0,
  rating_count integer not null default 0 check (rating_count >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learn_courses_status_idx on public.learn_courses (status, published_at desc);
create index if not exists learn_courses_category_idx on public.learn_courses (category_id);

create table if not exists public.learn_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.learn_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  section_id uuid references public.learn_sections(id) on delete set null,
  title text not null,
  lesson_type text not null default 'article' check (lesson_type in ('article', 'video', 'pdf', 'quiz')),
  content text not null default '',
  media_url text,
  duration_minutes integer not null default 0,
  sort_order integer not null default 0,
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learn_lessons_course_idx on public.learn_lessons (course_id, sort_order);

create table if not exists public.learn_enrollments (
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  completed_at timestamptz,
  last_lesson_id uuid references public.learn_lessons(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table if not exists public.learn_lesson_progress (
  lesson_id uuid not null references public.learn_lessons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  position_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);

create table if not exists public.learn_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.learn_lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.learn_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.learn_lessons(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learn_quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.learn_lessons(id) on delete cascade,
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  title text not null,
  pass_score integer not null default 70 check (pass_score between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.learn_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.learn_quizzes(id) on delete cascade,
  prompt text not null,
  question_type text not null check (question_type in ('multiple_choice', 'true_false')),
  options jsonb not null default '[]'::jsonb,
  correct_index integer not null default 0,
  explanation text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.learn_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.learn_quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null default 0,
  passed boolean not null default false,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.learn_reviews (
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table if not exists public.learn_discussions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.learn_discussions(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.learn_certificates (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  issued_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create table if not exists public.learn_flashcards (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learn_courses(id) on delete cascade,
  front text not null,
  back text not null,
  sort_order integer not null default 0
);

create table if not exists public.learn_student_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp integer not null default 0,
  streak_days integer not null default 0,
  last_study_date date,
  courses_completed integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Server-side quiz grading (does not trust client score)
create or replace function public.learn_submit_quiz(p_quiz_id uuid, p_answers jsonb)
returns public.learn_quiz_attempts
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  q record;
  total integer := 0;
  correct integer := 0;
  ans jsonb;
  idx integer;
  score integer;
  passed boolean;
  att public.learn_quiz_attempts;
  pass_score integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into q from public.learn_quizzes where id = p_quiz_id;
  if q is null then raise exception 'quiz not found'; end if;
  pass_score := q.pass_score;

  for q in
    select * from public.learn_quiz_questions where quiz_id = p_quiz_id order by sort_order
  loop
    total := total + 1;
    idx := null;
    for ans in select * from jsonb_array_elements(p_answers) loop
      if (ans->>'question_id')::uuid = q.id then
        idx := (ans->>'selected_index')::int;
      end if;
    end loop;
    if idx is not null and idx = q.correct_index then
      correct := correct + 1;
    end if;
  end loop;

  score := case when total = 0 then 0 else (correct * 100 / total) end;
  passed := score >= pass_score;

  insert into public.learn_quiz_attempts (quiz_id, user_id, score, passed, answers)
  values (p_quiz_id, v_uid, score, passed, p_answers)
  returning * into att;

  insert into public.learn_student_stats (user_id, xp)
  values (v_uid, case when passed then 20 else 5 end)
  on conflict (user_id) do update set
    xp = public.learn_student_stats.xp + excluded.xp,
    updated_at = now();

  return att;
end;
$$;
revoke all on function public.learn_submit_quiz(uuid, jsonb) from public;
grant execute on function public.learn_submit_quiz(uuid, jsonb) to authenticated;

-- Enroll
create or replace function public.learn_enroll(p_course_id uuid)
returns public.learn_enrollments
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  e public.learn_enrollments;
  c public.learn_courses;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into c from public.learn_courses where id = p_course_id and status = 'published';
  if c is null then raise exception 'course not available'; end if;
  insert into public.learn_enrollments (course_id, user_id)
  values (p_course_id, v_uid)
  on conflict do nothing;
  select * into e from public.learn_enrollments where course_id = p_course_id and user_id = v_uid;
  update public.learn_courses set enrollment_count = (
    select count(*) from public.learn_enrollments where course_id = p_course_id
  ) where id = p_course_id;
  return e;
end;
$$;
revoke all on function public.learn_enroll(uuid) from public;
grant execute on function public.learn_enroll(uuid) to authenticated;

-- Mark lesson complete + recompute progress
create or replace function public.learn_complete_lesson(p_lesson_id uuid)
returns public.learn_enrollments
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  les public.learn_lessons;
  total integer;
  done integer;
  pct integer;
  e public.learn_enrollments;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into les from public.learn_lessons where id = p_lesson_id;
  if les is null then raise exception 'lesson not found'; end if;
  if not exists (select 1 from public.learn_enrollments where course_id = les.course_id and user_id = v_uid) then
    raise exception 'not enrolled';
  end if;

  insert into public.learn_lesson_progress (lesson_id, user_id, completed, completed_at)
  values (p_lesson_id, v_uid, true, now())
  on conflict (lesson_id, user_id) do update set completed = true, completed_at = now(), updated_at = now();

  select count(*) into total from public.learn_lessons where course_id = les.course_id;
  select count(*) into done from public.learn_lesson_progress lp
  join public.learn_lessons l on l.id = lp.lesson_id
  where l.course_id = les.course_id and lp.user_id = v_uid and lp.completed;
  pct := case when total = 0 then 0 else least(100, (done * 100 / total)) end;

  update public.learn_enrollments set
    progress_percent = pct,
    last_lesson_id = p_lesson_id,
    completed_at = case when pct >= 100 then coalesce(completed_at, now()) else completed_at end
  where course_id = les.course_id and user_id = v_uid
  returning * into e;

  if pct >= 100 then
    insert into public.learn_certificates (course_id, user_id) values (les.course_id, v_uid)
    on conflict do nothing;
    insert into public.learn_student_stats (user_id, courses_completed, xp)
    values (v_uid, 1, 50)
    on conflict (user_id) do update set
      courses_completed = public.learn_student_stats.courses_completed + 1,
      xp = public.learn_student_stats.xp + 50,
      updated_at = now();
  end if;

  insert into public.learn_student_stats (user_id, xp, last_study_date, streak_days)
  values (v_uid, 5, current_date, 1)
  on conflict (user_id) do update set
    xp = public.learn_student_stats.xp + 5,
    streak_days = case
      when public.learn_student_stats.last_study_date = current_date then public.learn_student_stats.streak_days
      when public.learn_student_stats.last_study_date = current_date - 1 then public.learn_student_stats.streak_days + 1
      else 1
    end,
    last_study_date = current_date,
    updated_at = now();

  return e;
end;
$$;
revoke all on function public.learn_complete_lesson(uuid) from public;
grant execute on function public.learn_complete_lesson(uuid) to authenticated;

-- RLS
alter table public.learn_categories enable row level security;
alter table public.learn_courses enable row level security;
alter table public.learn_sections enable row level security;
alter table public.learn_lessons enable row level security;
alter table public.learn_enrollments enable row level security;
alter table public.learn_lesson_progress enable row level security;
alter table public.learn_bookmarks enable row level security;
alter table public.learn_notes enable row level security;
alter table public.learn_quizzes enable row level security;
alter table public.learn_quiz_questions enable row level security;
alter table public.learn_quiz_attempts enable row level security;
alter table public.learn_reviews enable row level security;
alter table public.learn_discussions enable row level security;
alter table public.learn_certificates enable row level security;
alter table public.learn_flashcards enable row level security;
alter table public.learn_student_stats enable row level security;

create policy "learn_categories_read" on public.learn_categories for select to authenticated using (true);
create policy "learn_categories_read_anon" on public.learn_categories for select to anon using (true);

create policy "learn_courses_read_pub" on public.learn_courses for select to authenticated
  using (status = 'published' or instructor_id = auth.uid());
create policy "learn_courses_read_anon" on public.learn_courses for select to anon using (status = 'published');
create policy "learn_courses_insert" on public.learn_courses for insert to authenticated
  with check (auth.uid() = instructor_id);
create policy "learn_courses_update_own" on public.learn_courses for update to authenticated
  using (auth.uid() = instructor_id) with check (auth.uid() = instructor_id);

create policy "learn_sections_read" on public.learn_sections for select to authenticated using (
  exists (select 1 from public.learn_courses c where c.id = course_id and (c.status = 'published' or c.instructor_id = auth.uid()))
);
create policy "learn_sections_write" on public.learn_sections for all to authenticated
  using (exists (select 1 from public.learn_courses c where c.id = course_id and c.instructor_id = auth.uid()))
  with check (exists (select 1 from public.learn_courses c where c.id = course_id and c.instructor_id = auth.uid()));

create policy "learn_lessons_read" on public.learn_lessons for select to authenticated using (
  exists (select 1 from public.learn_courses c where c.id = course_id and (c.status = 'published' or c.instructor_id = auth.uid()))
);
create policy "learn_lessons_write" on public.learn_lessons for all to authenticated
  using (exists (select 1 from public.learn_courses c where c.id = course_id and c.instructor_id = auth.uid()))
  with check (exists (select 1 from public.learn_courses c where c.id = course_id and c.instructor_id = auth.uid()));

create policy "learn_enroll_select_own" on public.learn_enrollments for select to authenticated
  using (auth.uid() = user_id or exists (select 1 from public.learn_courses c where c.id = course_id and c.instructor_id = auth.uid()));
-- insert via enroll RPC

create policy "learn_progress_own" on public.learn_lesson_progress for select to authenticated using (auth.uid() = user_id);
create policy "learn_bookmarks_own" on public.learn_bookmarks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "learn_notes_own" on public.learn_notes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "learn_quizzes_read" on public.learn_quizzes for select to authenticated using (true);
create policy "learn_quiz_questions_read" on public.learn_quiz_questions for select to authenticated using (true);
-- hide correct answers from direct select would need a view; questions exposed for simplicity —
-- grading still server-side. For stronger security, use a view without correct_index in production.

create policy "learn_attempts_own" on public.learn_quiz_attempts for select to authenticated using (auth.uid() = user_id);
create policy "learn_reviews_read" on public.learn_reviews for select to authenticated using (true);
create policy "learn_reviews_write" on public.learn_reviews for insert to authenticated with check (auth.uid() = user_id);
create policy "learn_discussions_read" on public.learn_discussions for select to authenticated using (true);
create policy "learn_discussions_write" on public.learn_discussions for insert to authenticated with check (auth.uid() = user_id);
create policy "learn_certs_read" on public.learn_certificates for select to authenticated
  using (auth.uid() = user_id or true);
create policy "learn_flash_read" on public.learn_flashcards for select to authenticated using (true);
create policy "learn_stats_read" on public.learn_student_stats for select to authenticated using (true);
create policy "learn_stats_own_insert" on public.learn_student_stats for insert to authenticated with check (auth.uid() = user_id);

create or replace view public.learn_quiz_questions_public as
select id, quiz_id, prompt, question_type, options, sort_order, explanation
from public.learn_quiz_questions;

grant select on public.learn_quiz_questions_public to authenticated;
