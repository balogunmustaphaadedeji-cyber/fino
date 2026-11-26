export interface LearnCategory {
  id: string;
  title: string;
  description: string;
}

export interface LearnCourse {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category_id: string | null;
  instructor_id: string;
  cover_url: string | null;
  difficulty: string;
  status: string;
  is_free: boolean;
  lesson_count: number;
  enrollment_count: number;
  rating_sum: number;
  rating_count: number;
  published_at: string | null;
}

export interface LearnLesson {
  id: string;
  course_id: string;
  section_id: string | null;
  title: string;
  lesson_type: string;
  content: string;
  media_url: string | null;
  duration_minutes: number;
  sort_order: number;
  is_preview: boolean;
}

export interface LearnEnrollment {
  course_id: string;
  user_id: string;
  progress_percent: number;
  completed_at: string | null;
  last_lesson_id: string | null;
  enrolled_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  prompt: string;
  question_type: string;
  options: string[];
  sort_order: number;
  explanation?: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  score: number;
  passed: boolean;
  created_at: string;
}

// Community types

export type TutorVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface TutorProfile {
  user_id: string;
  expertise: string[];
  qualifications: string;
  bio: string;
  verification_status: TutorVerificationStatus;
  applied_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
}

export type GroupJoinRule = 'open' | 'request' | 'invite';

export interface LearnGroup {
  id: string;
  tutor_id: string;
  name: string;
  description: string;
  subject: string;
  is_private: boolean;
  join_rule: GroupJoinRule;
  cover_url: string | null;
  chat_conversation_id: string | null;
  member_count: number;
  status: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: 'tutor' | 'member';
  status: 'active' | 'pending' | 'invited' | 'removed';
  joined_at: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
  created_at: string;
}

export interface GroupMaterial {
  id: string;
  group_id: string;
  uploader_id: string;
  title: string;
  description: string;
  file_url: string;
  file_type: string;
  created_at: string;
}

export interface GroupAnnouncement {
  id: string;
  group_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface ScheduledSession {
  id: string;
  group_id: string;
  title: string;
  description: string;
  starts_at: string;
  duration_minutes: number;
  status: string;
  created_by: string;
  created_at: string;
}

export interface GroupAssignment {
  id: string;
  group_id: string;
  title: string;
  description: string;
  due_at: string | null;
  created_by: string;
  created_at: string;
}

export interface AssignmentSubmission {
  assignment_id: string;
  user_id: string;
  content: string;
  file_url: string | null;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
}
