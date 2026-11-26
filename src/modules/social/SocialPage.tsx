import { useEffect, useMemo, useState } from 'react';
import { Home, Compass, User, PenSquare, Bookmark } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuthSession } from './hooks/useAuthSession';
import { Feed } from './components/Feed';
import { CreatePost } from './components/CreatePost';
import { ProfileView, EditProfileForm } from './components/ProfileView';
import { CommentsPanel } from './components/CommentsPanel';
import { SearchDiscover } from './components/SearchDiscover';
import { StoriesBar } from './components/StoriesBar';
import { getProfile, getBookmarkedPosts } from './api/client';
import type { FeedMode, Post, Profile } from './types';
import { PostCard } from './components/PostCard';
import './social.css';

type Tab = 'home' | 'discover' | 'compose' | 'saved' | 'profile';

export default function SocialPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthSession();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('home');
  const [feedMode, setFeedMode] = useState<FeedMode>('chronological');
  const [refreshKey, setRefreshKey] = useState(0);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState<Post[]>([]);
  const [showComposer, setShowComposer] = useState(false);

  const currentUserId = user?.id ?? null;

  useEffect(() => {
    const profile = params.get('profile');
    if (profile) {
      setViewProfileId(profile);
      setTab('profile');
    }
  }, [params]);

  useEffect(() => {
    if (!currentUserId) {
      setMyProfile(null);
      return;
    }
    getProfile(currentUserId)
      .then(setMyProfile)
      .catch(() => setMyProfile(null));
  }, [currentUserId]);

  useEffect(() => {
    if (tab !== 'saved' || !currentUserId) return;
    getBookmarkedPosts()
      .then((r) => setSaved(r.items))
      .catch(() => setSaved([]));
  }, [tab, currentUserId, refreshKey]);

  const profileIdToShow = useMemo(() => {
    if (viewProfileId) return viewProfileId;
    if (tab === 'profile' && currentUserId) return currentUserId;
    return null;
  }, [viewProfileId, tab, currentUserId]);

  function openProfile(id: string) {
    setViewProfileId(id);
    setEditingProfile(false);
    setTab('profile');
    setParams({ profile: id });
  }

  function goHome() {
    setViewProfileId(null);
    setEditingProfile(false);
    setTab('home');
    setParams({});
  }

  if (authLoading) {
    return (
      <div className="page-stack">
        <div className="social-skeleton-card" style={{ height: 120 }} />
      </div>
    );
  }

  return (
    <div className="social-root page-stack">
      <header className="social-header">
        <div>
          <p className="eyebrow">PILLAR 01</p>
          <h1>Social</h1>
        </div>
        {!isAuthenticated && (
          <p className="muted notice">
            Connect Supabase auth to post, follow and interact. Feed still works for public content.
          </p>
        )}
      </header>

      {tab === 'home' && (
        <>
          <StoriesBar currentUserId={currentUserId} />
          {isAuthenticated && (
            <div className="social-feed-modes">
              <button
                type="button"
                className={feedMode === 'chronological' ? 'active' : ''}
                onClick={() => setFeedMode('chronological')}
              >
                Latest
              </button>
              <button
                type="button"
                className={feedMode === 'following' ? 'active' : ''}
                onClick={() => setFeedMode('following')}
              >
                Following
              </button>
              <button
                type="button"
                className={feedMode === 'discover' ? 'active' : ''}
                onClick={() => setFeedMode('discover')}
              >
                Discover
              </button>
            </div>
          )}
          {showComposer && isAuthenticated && (
            <CreatePost
              onCreated={() => {
                setShowComposer(false);
                setRefreshKey((k) => k + 1);
              }}
              onCancel={() => setShowComposer(false)}
            />
          )}
          <Feed
            mode={feedMode}
            currentUserId={currentUserId}
            refreshKey={refreshKey}
            onOpenComments={setCommentPost}
            onOpenProfile={openProfile}
          />
        </>
      )}

      {tab === 'discover' && (
        <SearchDiscover
          currentUserId={currentUserId}
          onOpenProfile={openProfile}
          onOpenComments={setCommentPost}
        />
      )}

      {tab === 'compose' && isAuthenticated && (
        <CreatePost
          onCreated={() => {
            setRefreshKey((k) => k + 1);
            setTab('home');
          }}
          onCancel={() => setTab('home')}
        />
      )}

      {tab === 'saved' && (
        <div className="social-feed">
          <h2>Saved</h2>
          {!isAuthenticated && <p className="muted">Sign in to see saved posts.</p>}
          {isAuthenticated && saved.length === 0 && (
            <p className="muted">No saved posts yet.</p>
          )}
          {saved.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUserId={currentUserId}
              onOpenComments={setCommentPost}
              onOpenProfile={openProfile}
              onDeleted={(id) => setSaved((s) => s.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}

      {tab === 'profile' && profileIdToShow && (
        editingProfile && myProfile && myProfile.id === profileIdToShow ? (
          <EditProfileForm
            profile={myProfile}
            onSaved={(p) => {
              setMyProfile(p);
              setEditingProfile(false);
            }}
            onCancel={() => setEditingProfile(false)}
          />
        ) : (
          <ProfileView
            userId={profileIdToShow}
            currentUserId={currentUserId}
            onOpenComments={setCommentPost}
            onOpenProfile={openProfile}
            onEdit={() => setEditingProfile(true)}
          />
        )
      )}

      {tab === 'profile' && !profileIdToShow && (
        <div className="social-empty">
          <p className="muted">Sign in to view your profile.</p>
        </div>
      )}

      {commentPost && (
        <CommentsPanel
          post={commentPost}
          currentUserId={currentUserId}
          onClose={() => setCommentPost(null)}
        />
      )}

      <nav className="social-subnav" aria-label="Social navigation">
        <button
          type="button"
          className={tab === 'home' ? 'active' : ''}
          onClick={goHome}
        >
          <Home size={20} />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={tab === 'discover' ? 'active' : ''}
          onClick={() => {
            setTab('discover');
            setViewProfileId(null);
          }}
        >
          <Compass size={20} />
          <span>Discover</span>
        </button>
        {isAuthenticated && (
          <button
            type="button"
            className={tab === 'compose' || showComposer ? 'active' : ''}
            onClick={() => {
              setTab('compose');
              setShowComposer(true);
            }}
          >
            <PenSquare size={20} />
            <span>Post</span>
          </button>
        )}
        {isAuthenticated && (
          <button
            type="button"
            className={tab === 'saved' ? 'active' : ''}
            onClick={() => setTab('saved')}
          >
            <Bookmark size={20} />
            <span>Saved</span>
          </button>
        )}
        <button
          type="button"
          className={tab === 'profile' ? 'active' : ''}
          onClick={() => {
            setViewProfileId(currentUserId);
            setTab('profile');
            if (currentUserId) setParams({ profile: currentUserId });
          }}
        >
          <User size={20} />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}
