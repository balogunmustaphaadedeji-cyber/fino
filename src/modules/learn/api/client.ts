import { supabase } from '../../../lib/supabase';
import type {
  LearnCategory,
  LearnCourse,
  LearnEnrollment,
  LearnLesson,
  QuizAttempt,
  QuizQuestion,
  TutorProfile,
  LearnGroup,
  GroupMember,
  GroupInvite,
  GroupMaterial,
  GroupAnnouncement,
  ScheduledSession,
  GroupAssignment,
  AssignmentSubmission,
  GroupJoinRule,
} from '../types';

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function getUid() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function listCategories(): Promise<LearnCategory[]> {
  const { data, error } = await client().from('learn_categories').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []) as LearnCategory[];
}

export async function listCourses(filters?: {
  category?: string;
  q?: string;
}): Promise<LearnCourse[]> {
  let q = client().from('learn_courses').select('*').eq('status', 'published').order('published_at', { ascending: false });
  if (filters?.category) q = q.eq('category_id', filters.category);
  if (filters?.q) q = q.or(`title.ilike.%${filters.q}%,summary.ilike.%${filters.q}%`);
  const { data, error } = await q.limit(50);
  if (error) throw error;
  return (data ?? []) as LearnCourse[];
}

export async function getCourse(idOrSlug: string): Promise<LearnCourse | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const { data, error } = await client()
    .from('learn_courses')
    .select('*')
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .maybeSingle();
  if (error) throw error;
  return data as LearnCourse | null;
}

export async function listLessons(courseId: string): Promise<LearnLesson[]> {
  const { data, error } = await client()
    .from('learn_lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as LearnLesson[];
}

export async function enroll(courseId: string): Promise<LearnEnrollment> {
  const { data, error } = await client().rpc('learn_enroll', { p_course_id: courseId });
  if (error) throw error;
  return data as LearnEnrollment;
}

export async function myEnrollments(): Promise<LearnEnrollment[]> {
  const uid = await getUid();
  if (!uid) return [];
  const { data, error } = await client().from('learn_enrollments').select('*').eq('user_id', uid);
  if (error) throw error;
  return (data ?? []) as LearnEnrollment[];
}

export async function completeLesson(lessonId: string): Promise<LearnEnrollment> {
  const { data, error } = await client().rpc('learn_complete_lesson', { p_lesson_id: lessonId });
  if (error) throw error;
  return data as LearnEnrollment;
}

export async function toggleBookmark(lessonId: string, on: boolean) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (on) {
    const { error } = await client().from('learn_bookmarks').insert({ user_id: uid, lesson_id: lessonId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await client().from('learn_bookmarks').delete().eq('user_id', uid).eq('lesson_id', lessonId);
    if (error) throw error;
  }
}

export async function saveNote(lessonId: string, body: string) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client().from('learn_notes').insert({ user_id: uid, lesson_id: lessonId, body });
  if (error) throw error;
}

export async function getQuizForCourse(courseId: string) {
  const { data, error } = await client().from('learn_quizzes').select('*').eq('course_id', courseId).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  const { data, error } = await client()
    .from('learn_quiz_questions_public')
    .select('*')
    .eq('quiz_id', quizId)
    .order('sort_order');
  if (error) {
    // fallback if view missing
    const r = await client().from('learn_quiz_questions').select('id,quiz_id,prompt,question_type,options,sort_order,explanation').eq('quiz_id', quizId).order('sort_order');
    if (r.error) throw r.error;
    return (r.data ?? []).map((x) => ({
      ...x,
      options: Array.isArray(x.options) ? x.options : [],
    })) as QuizQuestion[];
  }
  return (data ?? []).map((x) => ({
    ...x,
    options: Array.isArray(x.options) ? x.options : [],
  })) as QuizQuestion[];
}

export async function submitQuiz(quizId: string, answers: { question_id: string; selected_index: number }[]): Promise<QuizAttempt> {
  const { data, error } = await client().rpc('learn_submit_quiz', {
    p_quiz_id: quizId,
    p_answers: answers,
  });
  if (error) throw error;
  return data as QuizAttempt;
}

export async function postDiscussion(courseId: string, body: string, parentId?: string) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client().from('learn_discussions').insert({
    course_id: courseId,
    user_id: uid,
    body,
    parent_id: parentId ?? null,
  });
  if (error) throw error;
}

export async function listDiscussions(courseId: string) {
  const { data, error } = await client()
    .from('learn_discussions')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function postReview(courseId: string, rating: number, body: string) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client().from('learn_reviews').upsert({
    course_id: courseId,
    user_id: uid,
    rating,
    body,
  });
  if (error) throw error;
}

export async function listReviews(courseId: string) {
  const { data, error } = await client().from('learn_reviews').select('*').eq('course_id', courseId);
  if (error) throw error;
  return data ?? [];
}

export async function getStudentStats() {
  const uid = await getUid();
  if (!uid) return null;
  const { data } = await client().from('learn_student_stats').select('*').eq('user_id', uid).maybeSingle();
  return data;
}

export async function createCourse(input: {
  title: string;
  summary: string;
  description: string;
  category_id: string;
  difficulty: string;
}): Promise<LearnCourse> {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const slug =
    input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 6);
  const { data, error } = await client()
    .from('learn_courses')
    .insert({
      title: input.title,
      summary: input.summary,
      description: input.description,
      category_id: input.category_id,
      difficulty: input.difficulty,
      instructor_id: uid,
      slug,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as LearnCourse;
}

export async function addLesson(input: {
  course_id: string;
  title: string;
  content: string;
  lesson_type?: string;
}): Promise<LearnLesson> {
  const { count } = await client()
    .from('learn_lessons')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', input.course_id);
  const { data, error } = await client()
    .from('learn_lessons')
    .insert({
      course_id: input.course_id,
      title: input.title,
      content: input.content,
      lesson_type: input.lesson_type ?? 'article',
      sort_order: count ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  await client()
    .from('learn_courses')
    .update({ lesson_count: (count ?? 0) + 1 })
    .eq('id', input.course_id);
  return data as LearnLesson;
}

export async function listFlashcards(courseId: string) {
  const { data, error } = await client()
    .from('learn_flashcards')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function myCertificates() {
  const uid = await getUid();
  if (!uid) return [];
  const { data, error } = await client().from('learn_certificates').select('*').eq('user_id', uid);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Community: tutors, groups, materials, sessions, assignments
// ---------------------------------------------------------------------------

export async function getMyTutorProfile(): Promise<TutorProfile | null> {
  const uid = await getUid();
  if (!uid) return null;
  const { data, error } = await client()
    .from('learn_tutor_profiles')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data as TutorProfile | null;
}

export async function applyAsTutor(input: {
  expertise: string[];
  qualifications: string;
  bio: string;
}): Promise<TutorProfile> {
  const { data, error } = await client().rpc('learn_apply_tutor', {
    p_expertise: input.expertise,
    p_qualifications: input.qualifications,
    p_bio: input.bio,
  });
  if (error) throw error;
  return data as TutorProfile;
}

export async function listApprovedTutors(): Promise<TutorProfile[]> {
  const { data, error } = await client()
    .from('learn_tutor_profiles')
    .select('*')
    .eq('verification_status', 'approved')
    .order('applied_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as TutorProfile[];
}

export async function listPendingTutorApplications(): Promise<TutorProfile[]> {
  const { data, error } = await client()
    .from('learn_tutor_profiles')
    .select('*')
    .eq('verification_status', 'pending')
    .order('applied_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TutorProfile[];
}

export async function reviewTutor(
  userId: string,
  status: 'approved' | 'rejected',
  reason?: string
): Promise<TutorProfile> {
  const { data, error } = await client().rpc('learn_review_tutor', {
    p_user_id: userId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as TutorProfile;
}

export async function isAdmin(): Promise<boolean> {
  const uid = await getUid();
  if (!uid) return false;
  const { data, error } = await client()
    .from('user_roles')
    .select('role')
    .eq('user_id', uid)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function createGroup(input: {
  name: string;
  description: string;
  subject: string;
  is_private: boolean;
  join_rule: GroupJoinRule;
}): Promise<LearnGroup> {
  const { data, error } = await client().rpc('learn_create_group', {
    p_name: input.name,
    p_description: input.description,
    p_subject: input.subject,
    p_is_private: input.is_private,
    p_join_rule: input.join_rule,
  });
  if (error) throw error;
  return data as LearnGroup;
}

export async function listPublicGroups(q?: string): Promise<LearnGroup[]> {
  let query = client()
    .from('learn_groups')
    .select('*')
    .eq('status', 'active')
    .eq('is_private', false)
    .order('created_at', { ascending: false });
  if (q) query = query.or(`name.ilike.%${q}%,subject.ilike.%${q}%,description.ilike.%${q}%`);
  const { data, error } = await query.limit(40);
  if (error) throw error;
  return (data ?? []) as LearnGroup[];
}

export async function listMyGroups(): Promise<LearnGroup[]> {
  const uid = await getUid();
  if (!uid) return [];
  const { data: memberships, error: mErr } = await client()
    .from('learn_group_members')
    .select('group_id')
    .eq('user_id', uid)
    .eq('status', 'active');
  if (mErr) throw mErr;
  const ids = (memberships ?? []).map((m) => m.group_id);
  if (ids.length === 0) return [];
  const { data, error } = await client()
    .from('learn_groups')
    .select('*')
    .in('id', ids)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LearnGroup[];
}

export async function getGroup(id: string): Promise<LearnGroup | null> {
  const { data, error } = await client().from('learn_groups').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as LearnGroup | null;
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await client()
    .from('learn_group_members')
    .select('*')
    .eq('group_id', groupId)
    .in('status', ['active', 'pending', 'invited'])
    .order('joined_at');
  if (error) throw error;
  return (data ?? []) as GroupMember[];
}

export async function joinGroup(groupId: string): Promise<GroupMember> {
  const { data, error } = await client().rpc('learn_join_group', { p_group_id: groupId });
  if (error) throw error;
  return data as GroupMember;
}

export async function respondJoinRequest(
  groupId: string,
  userId: string,
  accept: boolean
): Promise<GroupMember> {
  const { data, error } = await client().rpc('learn_respond_join_request', {
    p_group_id: groupId,
    p_user_id: userId,
    p_accept: accept,
  });
  if (error) throw error;
  return data as GroupMember;
}

export async function inviteToGroup(groupId: string, inviteeId: string): Promise<GroupInvite> {
  const { data, error } = await client().rpc('learn_invite_to_group', {
    p_group_id: groupId,
    p_invitee_id: inviteeId,
  });
  if (error) throw error;
  return data as GroupInvite;
}

export async function acceptInvite(groupId: string): Promise<GroupMember> {
  const { data, error } = await client().rpc('learn_accept_invite', { p_group_id: groupId });
  if (error) throw error;
  return data as GroupMember;
}

export async function leaveOrRemove(groupId: string, userId?: string): Promise<void> {
  const { error } = await client().rpc('learn_leave_or_remove', {
    p_group_id: groupId,
    p_user_id: userId ?? null,
  });
  if (error) throw error;
}

export async function listMyInvites(): Promise<GroupInvite[]> {
  const uid = await getUid();
  if (!uid) return [];
  const { data, error } = await client()
    .from('learn_group_invites')
    .select('*')
    .eq('invitee_id', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as GroupInvite[];
}

export async function addMaterial(input: {
  groupId: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType?: string;
}): Promise<GroupMaterial> {
  const { data, error } = await client().rpc('learn_add_material', {
    p_group_id: input.groupId,
    p_title: input.title,
    p_description: input.description ?? '',
    p_file_url: input.fileUrl,
    p_file_type: input.fileType ?? 'document',
  });
  if (error) throw error;
  return data as GroupMaterial;
}

export async function listMaterials(groupId: string): Promise<GroupMaterial[]> {
  const { data, error } = await client()
    .from('learn_group_materials')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as GroupMaterial[];
}

export async function postAnnouncement(groupId: string, body: string): Promise<GroupAnnouncement> {
  const { data, error } = await client().rpc('learn_post_announcement', {
    p_group_id: groupId,
    p_body: body,
  });
  if (error) throw error;
  return data as GroupAnnouncement;
}

export async function listAnnouncements(groupId: string): Promise<GroupAnnouncement[]> {
  const { data, error } = await client()
    .from('learn_group_announcements')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as GroupAnnouncement[];
}

export async function scheduleSession(input: {
  groupId: string;
  title: string;
  description?: string;
  startsAt: string;
  durationMinutes?: number;
}): Promise<ScheduledSession> {
  const { data, error } = await client().rpc('learn_schedule_session', {
    p_group_id: input.groupId,
    p_title: input.title,
    p_description: input.description ?? '',
    p_starts_at: input.startsAt,
    p_duration_minutes: input.durationMinutes ?? 60,
  });
  if (error) throw error;
  return data as ScheduledSession;
}

export async function listSessions(groupId: string): Promise<ScheduledSession[]> {
  const { data, error } = await client()
    .from('learn_scheduled_sessions')
    .select('*')
    .eq('group_id', groupId)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduledSession[];
}

export async function createAssignment(input: {
  groupId: string;
  title: string;
  description?: string;
  dueAt?: string | null;
}): Promise<GroupAssignment> {
  const { data, error } = await client().rpc('learn_create_assignment', {
    p_group_id: input.groupId,
    p_title: input.title,
    p_description: input.description ?? '',
    p_due_at: input.dueAt ?? null,
  });
  if (error) throw error;
  return data as GroupAssignment;
}

export async function listAssignments(groupId: string): Promise<GroupAssignment[]> {
  const { data, error } = await client()
    .from('learn_assignments')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as GroupAssignment[];
}

export async function submitAssignment(
  assignmentId: string,
  content: string,
  fileUrl?: string
): Promise<AssignmentSubmission> {
  const { data, error } = await client().rpc('learn_submit_assignment', {
    p_assignment_id: assignmentId,
    p_content: content,
    p_file_url: fileUrl ?? null,
  });
  if (error) throw error;
  return data as AssignmentSubmission;
}

export async function createCourseAsTutor(input: {
  title: string;
  summary: string;
  description: string;
  category_id: string;
  difficulty: string;
}): Promise<LearnCourse> {
  const { data, error } = await client().rpc('learn_create_course', {
    p_title: input.title,
    p_summary: input.summary,
    p_description: input.description,
    p_category_id: input.category_id,
    p_difficulty: input.difficulty,
  });
  if (error) throw error;
  return data as LearnCourse;
}


export async function ensureGroupChat(groupId: string): Promise<string> {
  const { data, error } = await client().rpc('learn_ensure_group_chat', { p_group_id: groupId });
  if (error) throw error;
  return data as string;
}

export async function setSessionStatus(
  sessionId: string,
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
) {
  const { data, error } = await client().rpc('learn_set_session_status', {
    p_session_id: sessionId,
    p_status: status,
  });
  if (error) throw error;
  return data;
}

/** Upload learning material via shared Cloudinary signing (purpose: post). */
export async function uploadLearnMaterial(file: File): Promise<{ url: string; resourceType: string }> {
  const { uploadToCloudinary } = await import('../../../shared/media/cloudinary');
  const resourceType =
    file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'raw';
  const result = await uploadToCloudinary(file, resourceType, 'post');
  return { url: result.secure_url, resourceType: result.resource_type };
}
