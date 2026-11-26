import { useCallback, useEffect, useState } from 'react';
import {
  getUid,
  listCategories,
  listCourses,
  listLessons,
  enroll,
  completeLesson,
  myEnrollments,
  getStudentStats,
  myCertificates,
  getQuizForCourse,
  getQuizQuestions,
  submitQuiz,
  listDiscussions,
  listFlashcards,
  createCourseAsTutor,
  addLesson,
  getMyTutorProfile,
  applyAsTutor,
  listApprovedTutors,
  listPendingTutorApplications,
  reviewTutor,
  isAdmin,
  createGroup,
  listPublicGroups,
  listMyGroups,
  getGroup,
  listGroupMembers,
  joinGroup,
  respondJoinRequest,
  acceptInvite,
  listMyInvites,
  leaveOrRemove,
  addMaterial,
  listMaterials,
  postAnnouncement,
  listAnnouncements,
  scheduleSession,
  listSessions,
  createAssignment,
  listAssignments,
  submitAssignment,
  ensureGroupChat,
  setSessionStatus,
  uploadLearnMaterial,
} from './api/client';
import { openDirect, startCall } from '../chat/api/client';
import { useNavigate } from 'react-router-dom';
import type {
  LearnCategory,
  LearnCourse,
  LearnEnrollment,
  LearnLesson,
  QuizQuestion,
  TutorProfile,
  LearnGroup,
  GroupMember,
  GroupInvite,
  GroupMaterial,
  GroupAnnouncement,
  ScheduledSession,
  GroupAssignment,
  GroupJoinRule,
} from './types';
import './learn.css';

type View =
  | 'home'
  | 'courses'
  | 'course'
  | 'lesson'
  | 'quiz'
  | 'create-course'
  | 'tutors'
  | 'apply-tutor'
  | 'admin-tutors'
  | 'groups'
  | 'my-groups'
  | 'group'
  | 'create-group';

export default function LearnPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [categories, setCategories] = useState<LearnCategory[]>([]);
  const [courses, setCourses] = useState<LearnCourse[]>([]);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState<LearnCourse | null>(null);
  const [lessons, setLessons] = useState<LearnLesson[]>([]);
  const [lesson, setLesson] = useState<LearnLesson | null>(null);
  const [enrollments, setEnrollments] = useState<LearnEnrollment[]>([]);
  const [stats, setStats] = useState<{ xp?: number; streak_days?: number; courses_completed?: number } | null>(null);
  const [discussions, setDiscussions] = useState<{ id: string; body: string; user_id: string }[]>([]);
  const [flashcards, setFlashcards] = useState<{ front: string; back: string }[]>([]);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', summary: '', description: '', category_id: 'technology', difficulty: 'beginner' });
  const [lessonForm, setLessonForm] = useState({ title: '', content: '' });

  const [tutorProfile, setTutorProfile] = useState<TutorProfile | null>(null);
  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [pendingTutors, setPendingTutors] = useState<TutorProfile[]>([]);
  const [admin, setAdmin] = useState(false);
  const [publicGroups, setPublicGroups] = useState<LearnGroup[]>([]);
  const [myGroups, setMyGroups] = useState<LearnGroup[]>([]);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [activeGroup, setActiveGroup] = useState<LearnGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [materials, setMaterials] = useState<GroupMaterial[]>([]);
  const [announcements, setAnnouncements] = useState<GroupAnnouncement[]>([]);
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [assignments, setAssignments] = useState<GroupAssignment[]>([]);
  const [groupTab, setGroupTab] = useState<'overview' | 'members' | 'materials' | 'sessions' | 'assignments' | 'announce'>('overview');
  const [tutorForm, setTutorForm] = useState({ expertise: '', qualifications: '', bio: '' });
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    subject: '',
    is_private: false,
    join_rule: 'request' as GroupJoinRule,
  });
  const [materialForm, setMaterialForm] = useState({ title: '', description: '', file_url: '', file_type: 'document' });
  const [announceBody, setAnnounceBody] = useState('');
  const [sessionForm, setSessionForm] = useState({ title: '', description: '', starts_at: '', duration_minutes: 60 });
  const [assignmentForm, setAssignmentForm] = useState({ title: '', description: '', due_at: '' });
  const [submitContent, setSubmitContent] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [callNote, setCallNote] = useState<string | null>(null);

  const refreshHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await getUid();
      setUid(id);
      const [cats, list] = await Promise.all([
        listCategories().catch(() => [] as LearnCategory[]),
        listCourses({
          category: category === 'all' ? undefined : category,
          q: query || undefined,
        }).catch(() => [] as LearnCourse[]),
      ]);
      setCategories(cats);
      setCourses(list);
      if (id) {
        setEnrollments(await myEnrollments().catch(() => []));
        setStats(await getStudentStats().catch(() => null));
        setTutorProfile(await getMyTutorProfile().catch(() => null));
        setAdmin(await isAdmin().catch(() => false));
        setMyGroups(await listMyGroups().catch(() => []));
        setInvites(await listMyInvites().catch(() => []));
      }
      setPublicGroups(await listPublicGroups(query || undefined).catch(() => []));
      setTutors(await listApprovedTutors().catch(() => []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [category, query]);

  useEffect(() => {
    refreshHome();
  }, [refreshHome]);

  async function openCourse(c: LearnCourse) {
    setError(null);
    setCourse(c);
    setLessons(await listLessons(c.id).catch(() => []));
    setDiscussions(await listDiscussions(c.id).catch(() => []));
    setFlashcards(await listFlashcards(c.id).catch(() => []));
    const q = await getQuizForCourse(c.id).catch(() => null);
    setQuizId(q?.id ?? null);
    setView('course');
  }

  async function openGroup(g: LearnGroup) {
    setError(null);
    setActiveGroup(g);
    setGroupTab('overview');
    try {
      const [m, mat, ann, ses, asg] = await Promise.all([
        listGroupMembers(g.id),
        listMaterials(g.id).catch(() => []),
        listAnnouncements(g.id).catch(() => []),
        listSessions(g.id).catch(() => []),
        listAssignments(g.id).catch(() => []),
      ]);
      setMembers(m);
      setMaterials(mat);
      setAnnouncements(ann);
      setSessions(ses);
      setAssignments(asg);
      setView('group');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to open group');
    }
  }

  async function handleEnroll() {
    if (!course) return;
    try {
      await enroll(course.id);
      setEnrollments(await myEnrollments());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Enroll failed');
    }
  }

  async function handleComplete(l: LearnLesson) {
    try {
      await completeLesson(l.id);
      setEnrollments(await myEnrollments());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Complete failed');
    }
  }

  async function startQuiz() {
    if (!quizId) return;
    setQuestions(await getQuizQuestions(quizId));
    setAnswers({});
    setQuizResult(null);
    setView('quiz');
  }

  async function handleSubmitQuiz() {
    if (!quizId) return;
    const payload = Object.entries(answers).map(([question_id, selected_index]) => ({
      question_id,
      selected_index,
    }));
    try {
      const res = await submitQuiz(quizId, payload);
      setQuizResult({ score: res.score, passed: res.passed });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Quiz submit failed');
    }
  }

  async function handleCreateCourse() {
    try {
      const c = await createCourseAsTutor(form);
      if (lessonForm.title) {
        await addLesson({
          course_id: c.id,
          title: lessonForm.title,
          content: lessonForm.content,
          lesson_type: 'article',
        });
      }
      setView('home');
      await refreshHome();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Create course failed — approved tutor required');
    }
  }

  async function handleApplyTutor() {
    try {
      const expertise = tutorForm.expertise
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const p = await applyAsTutor({
        expertise,
        qualifications: tutorForm.qualifications,
        bio: tutorForm.bio,
      });
      setTutorProfile(p);
      setView('home');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Application failed');
    }
  }

  async function loadAdminTutors() {
    try {
      setPendingTutors(await listPendingTutorApplications());
      setView('admin-tutors');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Admin access required');
    }
  }

  async function handleReview(userId: string, status: 'approved' | 'rejected') {
    try {
      await reviewTutor(userId, status);
      setPendingTutors(await listPendingTutorApplications());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Review failed');
    }
  }

  async function handleCreateGroup() {
    try {
      if (groupForm.is_private && groupForm.join_rule === 'open') {
        setError('Private groups cannot use open join — use request or invite');
        return;
      }
      const g = await createGroup(groupForm);
      await refreshHome();
      await openGroup(g);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Create group failed — approved tutor required');
    }
  }

  async function handleJoin(g: LearnGroup) {
    try {
      await joinGroup(g.id);
      await refreshHome();
      await openGroup(g);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Join failed');
    }
  }

  async function handleAcceptInvite(inv: GroupInvite) {
    try {
      await acceptInvite(inv.group_id);
      await refreshHome();
      const g = await getGroup(inv.group_id);
      if (g) await openGroup(g);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Accept failed');
    }
  }

  async function handleRespondRequest(userId: string, accept: boolean) {
    if (!activeGroup) return;
    try {
      await respondJoinRequest(activeGroup.id, userId, accept);
      setMembers(await listGroupMembers(activeGroup.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Respond failed');
    }
  }

  async function handleAddMaterial() {
    if (!activeGroup) return;
    try {
      await addMaterial({
        groupId: activeGroup.id,
        title: materialForm.title,
        description: materialForm.description,
        fileUrl: materialForm.file_url,
        fileType: materialForm.file_type,
      });
      setMaterials(await listMaterials(activeGroup.id));
      setMaterialForm({ title: '', description: '', file_url: '', file_type: 'document' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Add material failed');
    }
  }

  async function handlePostAnnounce() {
    if (!activeGroup || !announceBody.trim()) return;
    try {
      await postAnnouncement(activeGroup.id, announceBody);
      setAnnouncements(await listAnnouncements(activeGroup.id));
      setAnnounceBody('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Announce failed');
    }
  }

  async function handleSchedule() {
    if (!activeGroup) return;
    try {
      await scheduleSession({
        groupId: activeGroup.id,
        title: sessionForm.title,
        description: sessionForm.description,
        startsAt: new Date(sessionForm.starts_at).toISOString(),
        durationMinutes: sessionForm.duration_minutes,
      });
      setSessions(await listSessions(activeGroup.id));
      setSessionForm({ title: '', description: '', starts_at: '', duration_minutes: 60 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Schedule failed');
    }
  }

  async function handleCreateAssignment() {
    if (!activeGroup) return;
    try {
      await createAssignment({
        groupId: activeGroup.id,
        title: assignmentForm.title,
        description: assignmentForm.description,
        dueAt: assignmentForm.due_at ? new Date(assignmentForm.due_at).toISOString() : null,
      });
      setAssignments(await listAssignments(activeGroup.id));
      setAssignmentForm({ title: '', description: '', due_at: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assignment create failed');
    }
  }

  async function handleSubmitAssignment(assignmentId: string) {
    try {
      await submitAssignment(assignmentId, submitContent[assignmentId] || '');
      setSubmitContent((s) => ({ ...s, [assignmentId]: '' }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    }
  }


  async function openGroupChat() {
    if (!activeGroup) return;
    try {
      let chatId = activeGroup.chat_conversation_id;
      if (!chatId) {
        chatId = await ensureGroupChat(activeGroup.id);
        setActiveGroup({ ...activeGroup, chat_conversation_id: chatId });
      }
      navigate(`/chat?c=${encodeURIComponent(chatId)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open group chat');
    }
  }

  async function openPrivateTutorChat() {
    if (!activeGroup?.tutor_id) return;
    try {
      const conv = await openDirect(activeGroup.tutor_id);
      navigate(`/chat?c=${encodeURIComponent(conv.id)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open private chat');
    }
  }

  async function handleMaterialFile(file: File | null) {
    if (!file || !activeGroup) return;
    setUploading(true);
    setError(null);
    try {
      const { url, resourceType } = await uploadLearnMaterial(file);
      const fileType =
        resourceType === 'video' ? 'video' : resourceType === 'image' ? 'image' : file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'document';
      await addMaterial({
        groupId: activeGroup.id,
        title: materialForm.title || file.name,
        description: materialForm.description,
        fileUrl: url,
        fileType,
      });
      setMaterials(await listMaterials(activeGroup.id));
      setMaterialForm({ title: '', description: '', file_url: '', file_type: 'document' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed — Cloudinary signing required');
    } finally {
      setUploading(false);
    }
  }

  async function startLiveSession(sessionId: string) {
    if (!activeGroup) return;
    setCallNote(null);
    try {
      await setSessionStatus(sessionId, 'live');
      setSessions(await listSessions(activeGroup.id));
      let chatId = activeGroup.chat_conversation_id;
      if (!chatId) {
        chatId = await ensureGroupChat(activeGroup.id);
        setActiveGroup({ ...activeGroup, chat_conversation_id: chatId });
      }
      // Real Chat WebRTC call path — group multi-party requires SFU (Chat rejects without it)
      try {
        await startCall(chatId, 'video');
        setCallNote('Live session marked live. Opening Chat call signalling… Multi-participant group video requires a deployed SFU (e.g. LiveKit). 1:1 calls work with TURN.');
        navigate(`/chat?c=${encodeURIComponent(chatId)}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setCallNote(
          `Session is live. Group WebRTC call: ${msg}. ` +
            'FINO Chat supports 1:1 WebRTC with STUN/TURN. Reliable multi-participant lessons need an SFU. Open the group chat to coordinate or start 1:1 tutor calls.'
        );
        navigate(`/chat?c=${encodeURIComponent(chatId)}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start live session');
    }
  }

  async function joinLiveSession() {
    if (!activeGroup?.chat_conversation_id) {
      setError('No linked chat conversation for this group yet');
      return;
    }
    setCallNote(
      'Joining via FINO Chat. Use microphone/camera controls in the Chat call UI. Group multi-party video requires SFU infrastructure.'
    );
    navigate(`/chat?c=${encodeURIComponent(activeGroup.chat_conversation_id)}`);
  }

  const enrolledIds = new Set(enrollments.map((e) => e.course_id));
  const isTutor = tutorProfile?.verification_status === 'approved';
  const isGroupTutor = !!(activeGroup && uid === activeGroup.tutor_id);

  return (
    <div className="learn-page">
      <header className="learn-header">
        <h1>Learn</h1>
        <p className="learn-tagline">Community learning · Courses · Live groups</p>
        <nav className="learn-nav">
          <button type="button" className={view === 'home' || view === 'courses' ? 'active' : ''} onClick={() => { setView('home'); refreshHome(); }}>
            Discover
          </button>
          <button type="button" className={view === 'my-groups' ? 'active' : ''} onClick={() => setView('my-groups')}>
            My Groups
          </button>
          <button type="button" className={view === 'tutors' ? 'active' : ''} onClick={() => setView('tutors')}>
            Tutors
          </button>
          {isTutor && (
            <>
              <button type="button" onClick={() => setView('create-group')}>Create Group</button>
              <button type="button" onClick={() => setView('create-course')}>Create Course</button>
            </>
          )}
          {!isTutor && uid && (
            <button type="button" onClick={() => setView('apply-tutor')}>Become a Tutor</button>
          )}
          {admin && (
            <button type="button" onClick={loadAdminTutors}>Admin · Tutors</button>
          )}
        </nav>
      </header>

      {error && (
        <div className="learn-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {loading && view === 'home' && <p className="learn-muted">Loading…</p>}

      {(view === 'home' || view === 'courses') && !loading && (
        <section className="learn-section">
          {stats && (
            <div className="learn-stats">
              <span>XP {stats.xp ?? 0}</span>
              <span>Streak {stats.streak_days ?? 0}d</span>
              <span>Completed {stats.courses_completed ?? 0}</span>
            </div>
          )}

          {invites.length > 0 && (
            <div className="learn-card">
              <h3>Group invitations</h3>
              {invites.map((inv) => (
                <div key={inv.id} className="learn-row">
                  <span>Group invite</span>
                  <button type="button" onClick={() => handleAcceptInvite(inv)}>Accept</button>
                </div>
              ))}
            </div>
          )}

          <div className="learn-toolbar">
            <input
              placeholder="Search courses & groups…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refreshHome()}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <button type="button" onClick={refreshHome}>Search</button>
          </div>

          <h2>Learning groups</h2>
          <div className="learn-grid">
            {publicGroups.map((g) => (
              <article key={g.id} className="learn-card" onClick={() => openGroup(g)}>
                <h3>{g.name}</h3>
                <p className="learn-muted">{g.subject} · {g.member_count} members · {g.join_rule}</p>
                <p>{g.description.slice(0, 120)}</p>
              </article>
            ))}
            {publicGroups.length === 0 && <p className="learn-muted">No public groups yet.</p>}
          </div>

          <h2>Courses</h2>
          <div className="learn-grid">
            {courses.map((c) => (
              <article key={c.id} className="learn-card" onClick={() => openCourse(c)}>
                <h3>{c.title}</h3>
                <p className="learn-muted">{c.difficulty} · {c.lesson_count} lessons · {c.enrollment_count} enrolled</p>
                <p>{c.summary}</p>
                {enrolledIds.has(c.id) && <span className="learn-badge">Enrolled</span>}
              </article>
            ))}
            {courses.length === 0 && <p className="learn-muted">No published courses.</p>}
          </div>

          {myGroups.length > 0 && (
            <>
              <h2>Your groups</h2>
              <div className="learn-grid">
                {myGroups.map((g) => (
                  <article key={g.id} className="learn-card" onClick={() => openGroup(g)}>
                    <h3>{g.name}</h3>
                    <p className="learn-muted">{g.subject}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {view === 'tutors' && (
        <section className="learn-section">
          <h2>Verified tutors</h2>
          <div className="learn-grid">
            {tutors.map((t) => (
              <article key={t.user_id} className="learn-card">
                <h3>Tutor</h3>
                <p className="learn-muted">{(t.expertise || []).join(', ') || '—'}</p>
                <p>{t.bio}</p>
                <p className="learn-muted">{t.qualifications}</p>
              </article>
            ))}
            {tutors.length === 0 && <p className="learn-muted">No approved tutors yet.</p>}
          </div>
        </section>
      )}

      {view === 'apply-tutor' && (
        <section className="learn-section learn-form">
          <h2>Apply to become a tutor</h2>
          {tutorProfile && (
            <p>Status: <strong>{tutorProfile.verification_status}</strong>
              {tutorProfile.rejection_reason ? ` — ${tutorProfile.rejection_reason}` : ''}
            </p>
          )}
          <label>Expertise (comma-separated)</label>
          <input value={tutorForm.expertise} onChange={(e) => setTutorForm({ ...tutorForm, expertise: e.target.value })} />
          <label>Qualifications</label>
          <textarea value={tutorForm.qualifications} onChange={(e) => setTutorForm({ ...tutorForm, qualifications: e.target.value })} />
          <label>Bio</label>
          <textarea value={tutorForm.bio} onChange={(e) => setTutorForm({ ...tutorForm, bio: e.target.value })} />
          <button type="button" onClick={handleApplyTutor}>Submit application</button>
          <button type="button" className="secondary" onClick={() => setView('home')}>Cancel</button>
        </section>
      )}

      {view === 'admin-tutors' && (
        <section className="learn-section">
          <h2>Pending tutor applications</h2>
          {pendingTutors.map((t) => (
            <div key={t.user_id} className="learn-card">
              <p><strong>User</strong> {t.user_id.slice(0, 8)}…</p>
              <p>{(t.expertise || []).join(', ')}</p>
              <p>{t.qualifications}</p>
              <p>{t.bio}</p>
              <button type="button" onClick={() => handleReview(t.user_id, 'approved')}>Approve</button>
              <button type="button" className="secondary" onClick={() => handleReview(t.user_id, 'rejected')}>Reject</button>
            </div>
          ))}
          {pendingTutors.length === 0 && <p className="learn-muted">No pending applications.</p>}
          <button type="button" className="secondary" onClick={() => setView('home')}>Back</button>
        </section>
      )}

      {view === 'create-group' && (
        <section className="learn-section learn-form">
          <h2>Create learning group</h2>
          <label>Name</label>
          <input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
          <label>Subject</label>
          <input value={groupForm.subject} onChange={(e) => setGroupForm({ ...groupForm, subject: e.target.value })} />
          <label>Description</label>
          <textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} />
          <label>
            <input type="checkbox" checked={groupForm.is_private} onChange={(e) => setGroupForm({ ...groupForm, is_private: e.target.checked })} />
            Private
          </label>
          <label>Join rule</label>
          <select value={groupForm.join_rule} onChange={(e) => setGroupForm({ ...groupForm, join_rule: e.target.value as GroupJoinRule })}>
            <option value="open">Open</option>
            <option value="request">Request to join</option>
            <option value="invite">Invite only</option>
          </select>
          <button type="button" onClick={handleCreateGroup}>Create</button>
          <button type="button" className="secondary" onClick={() => setView('home')}>Cancel</button>
        </section>
      )}

      {view === 'my-groups' && (
        <section className="learn-section">
          <h2>My groups</h2>
          <div className="learn-grid">
            {myGroups.map((g) => (
              <article key={g.id} className="learn-card" onClick={() => openGroup(g)}>
                <h3>{g.name}</h3>
                <p className="learn-muted">{g.subject} · {g.member_count} members</p>
              </article>
            ))}
            {myGroups.length === 0 && <p className="learn-muted">You are not in any groups yet. Discover public groups on the home page.</p>}
          </div>
        </section>
      )}

      {view === 'group' && activeGroup && (
        <section className="learn-section">
          <button type="button" className="secondary" onClick={() => setView('home')}>← Back</button>
          <h2>{activeGroup.name}</h2>
          <p className="learn-muted">{activeGroup.subject} · {activeGroup.member_count} members · {activeGroup.join_rule} · {activeGroup.is_private ? 'Private' : 'Public'}</p>
          <p>{activeGroup.description}</p>

          <div className="learn-toolbar">
            {!members.some((m) => m.user_id === uid && m.status === 'active') && uid !== activeGroup.tutor_id && (
              <button type="button" onClick={() => handleJoin(activeGroup)}>
                {activeGroup.join_rule === 'open' ? 'Join' : 'Request to join'}
              </button>
            )}
            {members.some((m) => m.user_id === uid && m.status === 'active') && uid !== activeGroup.tutor_id && (
              <button type="button" className="secondary" onClick={() => leaveOrRemove(activeGroup.id).then(refreshHome)}>Leave</button>
            )}
            <button type="button" onClick={() => void openGroupChat()}>Open group chat</button>
            {uid && uid !== activeGroup.tutor_id && (
              <button type="button" className="secondary" onClick={() => void openPrivateTutorChat()}>
                Private chat with tutor
              </button>
            )}
          </div>
          {callNote && <p className="learn-muted" role="status">{callNote}</p>}

          <nav className="learn-nav">
            {(['overview', 'members', 'materials', 'sessions', 'assignments', 'announce'] as const).map((t) => (
              <button key={t} type="button" className={groupTab === t ? 'active' : ''} onClick={() => setGroupTab(t)}>
                {t}
              </button>
            ))}
          </nav>

          {groupTab === 'overview' && (
            <div>
              <h3>Announcements</h3>
              {announcements.slice(0, 5).map((a) => (
                <div key={a.id} className="learn-card"><p>{a.body}</p><p className="learn-muted">{new Date(a.created_at).toLocaleString()}</p></div>
              ))}
              <h3>Upcoming sessions</h3>
              {sessions.filter((s) => s.status === 'scheduled').map((s) => (
                <div key={s.id} className="learn-card">
                  <strong>{s.title}</strong> — {new Date(s.starts_at).toLocaleString()} ({s.duration_minutes} min)
                </div>
              ))}
            </div>
          )}

          {groupTab === 'members' && (
            <div>
              {members.map((m) => (
                <div key={m.user_id} className="learn-row">
                  <span>{m.user_id.slice(0, 8)}… · {m.role} · {m.status}</span>
                  {isGroupTutor && m.status === 'pending' && (
                    <>
                      <button type="button" onClick={() => handleRespondRequest(m.user_id, true)}>Approve</button>
                      <button type="button" className="secondary" onClick={() => handleRespondRequest(m.user_id, false)}>Reject</button>
                    </>
                  )}
                  {isGroupTutor && m.status === 'active' && m.role !== 'tutor' && (
                    <button type="button" className="secondary" onClick={() => leaveOrRemove(activeGroup.id, m.user_id).then(() => listGroupMembers(activeGroup.id).then(setMembers))}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {groupTab === 'materials' && (
            <div>
              {materials.map((mat) => (
                <div key={mat.id} className="learn-card">
                  <strong>{mat.title}</strong> ({mat.file_type})
                  <p>{mat.description}</p>
                  <a href={mat.file_url} target="_blank" rel="noreferrer">Open</a>
                </div>
              ))}
              {isGroupTutor && (
                <div className="learn-form">
                  <h4>Upload material</h4>
                  <input placeholder="Title (optional)" value={materialForm.title} onChange={(e) => setMaterialForm({ ...materialForm, title: e.target.value })} />
                  <input
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.zip"
                    onChange={(e) => void handleMaterialFile(e.target.files?.[0] ?? null)}
                    disabled={uploading}
                  />
                  <p className="learn-muted">{uploading ? 'Uploading via Cloudinary…' : 'Uploads use signed Cloudinary (Edge Function cloudinary-sign-upload).'}</p>
                  <details>
                    <summary>Or paste URL</summary>
                    <input placeholder="File URL" value={materialForm.file_url} onChange={(e) => setMaterialForm({ ...materialForm, file_url: e.target.value })} />
                    <select value={materialForm.file_type} onChange={(e) => setMaterialForm({ ...materialForm, file_type: e.target.value })}>
                      <option value="document">Document</option>
                      <option value="pdf">PDF</option>
                      <option value="video">Video</option>
                      <option value="image">Image</option>
                    </select>
                    <button type="button" onClick={handleAddMaterial}>Add by URL</button>
                  </details>
                </div>
              )}
            </div>
          )}

          {groupTab === 'sessions' && (
            <div>
              {sessions.map((s) => (
                <div key={s.id} className="learn-card">
                  <strong>{s.title}</strong>
                  <p>{new Date(s.starts_at).toLocaleString()} · {s.duration_minutes} min · {s.status}</p>
                  <p className="learn-muted">
                    {s.status === 'live'
                      ? 'Live now — join via group chat WebRTC (group multi-party needs SFU).'
                      : 'Scheduled. Tutor can start a live lesson.'}
                  </p>
                  {isGroupTutor && s.status === 'scheduled' && (
                    <button type="button" onClick={() => void startLiveSession(s.id)}>Start live lesson</button>
                  )}
                  {s.status === 'live' && (
                    <button type="button" onClick={() => void joinLiveSession()}>Join live lesson</button>
                  )}
                </div>
              ))}
              {isGroupTutor && (
                <div className="learn-form">
                  <h4>Schedule session</h4>
                  <input placeholder="Title" value={sessionForm.title} onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })} />
                  <input type="datetime-local" value={sessionForm.starts_at} onChange={(e) => setSessionForm({ ...sessionForm, starts_at: e.target.value })} />
                  <input type="number" value={sessionForm.duration_minutes} onChange={(e) => setSessionForm({ ...sessionForm, duration_minutes: Number(e.target.value) })} />
                  <button type="button" onClick={handleSchedule}>Schedule</button>
                </div>
              )}
            </div>
          )}

          {groupTab === 'assignments' && (
            <div>
              {assignments.map((a) => (
                <div key={a.id} className="learn-card">
                  <strong>{a.title}</strong>
                  <p>{a.description}</p>
                  {a.due_at && <p className="learn-muted">Due {new Date(a.due_at).toLocaleString()}</p>}
                  {uid && uid !== activeGroup.tutor_id && (
                    <div>
                      <textarea
                        placeholder="Your submission"
                        value={submitContent[a.id] || ''}
                        onChange={(e) => setSubmitContent({ ...submitContent, [a.id]: e.target.value })}
                      />
                      <button type="button" onClick={() => handleSubmitAssignment(a.id)}>Submit</button>
                    </div>
                  )}
                </div>
              ))}
              {isGroupTutor && (
                <div className="learn-form">
                  <h4>New assignment</h4>
                  <input placeholder="Title" value={assignmentForm.title} onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })} />
                  <textarea placeholder="Description" value={assignmentForm.description} onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })} />
                  <input type="datetime-local" value={assignmentForm.due_at} onChange={(e) => setAssignmentForm({ ...assignmentForm, due_at: e.target.value })} />
                  <button type="button" onClick={handleCreateAssignment}>Create</button>
                </div>
              )}
            </div>
          )}

          {groupTab === 'announce' && isGroupTutor && (
            <div className="learn-form">
              <h4>Post announcement</h4>
              <textarea value={announceBody} onChange={(e) => setAnnounceBody(e.target.value)} />
              <button type="button" onClick={handlePostAnnounce}>Post</button>
            </div>
          )}
        </section>
      )}

      {view === 'course' && course && (
        <section className="learn-section">
          <button type="button" className="secondary" onClick={() => setView('home')}>← Back</button>
          <h2>{course.title}</h2>
          <p className="learn-muted">{course.difficulty} · {course.lesson_count} lessons</p>
          <p>{course.description}</p>
          {!enrolledIds.has(course.id) ? (
            <button type="button" onClick={handleEnroll}>Enroll</button>
          ) : (
            <span className="learn-badge">Enrolled · {enrollments.find((e) => e.course_id === course.id)?.progress_percent ?? 0}%</span>
          )}
          <h3>Lessons</h3>
          <ul className="learn-list">
            {lessons.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => { setLesson(l); setView('lesson'); }}>
                  {l.title} ({l.lesson_type})
                </button>
                {enrolledIds.has(course.id) && (
                  <button type="button" className="secondary" onClick={() => handleComplete(l)}>Complete</button>
                )}
              </li>
            ))}
          </ul>
          {quizId && enrolledIds.has(course.id) && (
            <button type="button" onClick={startQuiz}>Take quiz</button>
          )}
          <h3>Discussions</h3>
          {discussions.map((d) => (
            <div key={d.id} className="learn-card"><p>{d.body}</p></div>
          ))}
          {flashcards.length > 0 && (
            <>
              <h3>Flashcards</h3>
              {flashcards.map((f, i) => (
                <div key={i} className="learn-card"><strong>{f.front}</strong><p>{f.back}</p></div>
              ))}
            </>
          )}
        </section>
      )}

      {view === 'lesson' && lesson && (
        <section className="learn-section">
          <button type="button" className="secondary" onClick={() => setView('course')}>← Back</button>
          <h2>{lesson.title}</h2>
          {lesson.media_url && <p><a href={lesson.media_url} target="_blank" rel="noreferrer">Media</a></p>}
          <div className="learn-content">{lesson.content}</div>
          <button type="button" onClick={() => handleComplete(lesson)}>Mark complete</button>
        </section>
      )}

      {view === 'quiz' && (
        <section className="learn-section">
          <button type="button" className="secondary" onClick={() => setView('course')}>← Back</button>
          <h2>Quiz</h2>
          {quizResult ? (
            <p>Score: {quizResult.score}% — {quizResult.passed ? 'Passed' : 'Not passed'}</p>
          ) : (
            <>
              {questions.map((q) => (
                <div key={q.id} className="learn-card">
                  <p>{q.prompt}</p>
                  {(q.options || []).map((opt, idx) => (
                    <label key={idx}>
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === idx}
                        onChange={() => setAnswers({ ...answers, [q.id]: idx })}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              ))}
              <button type="button" onClick={handleSubmitQuiz}>Submit</button>
            </>
          )}
        </section>
      )}

      {view === 'create-course' && (
        <section className="learn-section learn-form">
          <h2>Create course (tutor)</h2>
          <label>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label>Summary</label>
          <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          <label>Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label>Category</label>
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <label>Difficulty</label>
          <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <label>First lesson title</label>
          <input value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
          <label>Lesson content</label>
          <textarea value={lessonForm.content} onChange={(e) => setLessonForm({ ...lessonForm, content: e.target.value })} />
          <button type="button" onClick={handleCreateCourse}>Create draft</button>
          <button type="button" className="secondary" onClick={() => setView('home')}>Cancel</button>
        </section>
      )}
    </div>
  );
}
