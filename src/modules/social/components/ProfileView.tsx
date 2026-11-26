import { useEffect, useState } from 'react';
import { UserPlus, UserMinus, Link2, QrCode, Settings2 } from 'lucide-react';
import type { Post, Profile } from '../types';
import {
  getProfile,
  getUserPosts,
  followUser,
  unfollowUser,
  isFollowing,
  updateProfile,
  getFollowers,
  getFollowing,
} from '../api/client';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';
import { mediaImageUrl } from '../utils/media';

interface Props {
  userId: string;
  currentUserId?: string | null;
  onOpenComments?: (post: Post) => void;
  onOpenProfile?: (userId: string) => void;
  onEdit?: () => void;
}

export function ProfileView({
  userId,
  currentUserId,
  onOpenComments,
  onOpenProfile,
  onEdit,
}: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'posts' | 'followers' | 'following'>('posts');
  const [list, setList] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const isSelf = currentUserId === userId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await getProfile(userId);
        if (cancelled) return;
        setProfile(p);
        if (p) {
          const feed = await getUserPosts(userId);
          if (!cancelled) setPosts(feed.items);
          if (currentUserId && !isSelf) {
            const f = await isFollowing(userId);
            if (!cancelled) setFollowing(f);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, currentUserId, isSelf]);

  useEffect(() => {
    if (tab === 'posts') return;
    (async () => {
      try {
        const rows =
          tab === 'followers' ? await getFollowers(userId) : await getFollowing(userId);
        setList(rows);
      } catch {
        setList([]);
      }
    })();
  }, [tab, userId]);

  async function toggleFollow() {
    if (!currentUserId || isSelf) return;
    try {
      if (following) {
        await unfollowUser(userId);
        setFollowing(false);
        setProfile((p) =>
          p ? { ...p, followers_count: Math.max(0, p.followers_count - 1) } : p,
        );
      } else {
        const result = await followUser(userId);
        if (result === 'followed') {
          setFollowing(true);
          setProfile((p) =>
            p ? { ...p, followers_count: p.followers_count + 1 } : p,
          );
        } else {
          alert('Follow request sent');
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/social?profile=${userId}`;
    navigator.clipboard?.writeText(url);
    alert('Profile link copied');
  }

  async function showQr() {
    try {
      const { profileQrDataUrl } = await import('../utils/qr');
      const dataUrl = await profileQrDataUrl(userId);
      setQrUrl(dataUrl);
    } catch {
      alert('Could not generate QR code');
    }
  }

  if (loading) {
    return <div className="social-skeleton-card" style={{ height: 280 }} />;
  }
  if (error || !profile) {
    return (
      <div className="social-empty">
        <p>{error || 'Profile not found'}</p>
      </div>
    );
  }

  return (
    <div className="social-profile">
      <div
        className="social-cover"
        style={
          profile.cover_url
            ? { backgroundImage: `url(${mediaImageUrl(profile.cover_url, { width: 900 })})` }
            : undefined
        }
      />
      <div className="social-profile-main">
        <Avatar
          src={profile.avatar_url}
          name={profile.display_name || profile.username}
          size={80}
          className="social-profile-avatar"
        />
        <div className="social-profile-actions">
          {isSelf ? (
            <button type="button" className="social-btn" onClick={onEdit}>
              <Settings2 size={16} /> Edit profile
            </button>
          ) : currentUserId ? (
            <button
              type="button"
              className={`social-btn ${following ? '' : 'primary'}`}
              onClick={toggleFollow}
            >
              {following ? (
                <>
                  <UserMinus size={16} /> Unfollow
                </>
              ) : (
                <>
                  <UserPlus size={16} /> Follow
                </>
              )}
            </button>
          ) : null}
          <button type="button" className="icon-button social-icon-btn" onClick={copyLink} aria-label="Copy link">
            <Link2 size={18} />
          </button>
          <button type="button" className="icon-button social-icon-btn" onClick={showQr} aria-label="QR code">
            <QrCode size={18} />
          </button>
        </div>
        <h2>{profile.display_name || profile.username || 'User'}</h2>
        {profile.username && <p className="muted">@{profile.username}</p>}
        {profile.bio && <p className="social-bio">{profile.bio}</p>}
        {(profile.location || profile.website) && (
          <p className="muted social-meta-line">
            {profile.location}
            {profile.location && profile.website ? ' · ' : ''}
            {profile.website && (
              <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer">
                {profile.website}
              </a>
            )}
          </p>
        )}
        <div className="social-stats">
          <button type="button" onClick={() => setTab('posts')}>
            <strong>{profile.posts_count}</strong> posts
          </button>
          <button type="button" onClick={() => setTab('followers')}>
            <strong>{profile.followers_count}</strong> followers
          </button>
          <button type="button" onClick={() => setTab('following')}>
            <strong>{profile.following_count}</strong> following
          </button>
        </div>
        {profile.is_private && <span className="status-pill">Private account</span>}
      </div>

      {tab === 'posts' && (
        <div className="social-feed">
          {posts.length === 0 ? (
            <div className="social-empty">
              <p className="muted">No posts yet.</p>
            </div>
          ) : (
            posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                currentUserId={currentUserId}
                onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
                onOpenComments={onOpenComments}
                onOpenProfile={onOpenProfile}
              />
            ))
          )}
        </div>
      )}

      {(tab === 'followers' || tab === 'following') && (
        <div className="social-user-list">
          {list.length === 0 ? (
            <p className="muted">No users yet.</p>
          ) : (
            list.map((u) => (
              <button
                key={u.id}
                type="button"
                className="social-user-row"
                onClick={() => onOpenProfile?.(u.id)}
              >
                <Avatar src={u.avatar_url} name={u.display_name || u.username} size={40} />
                <div>
                  <strong>{u.display_name || u.username}</strong>
                  {u.username && <span className="muted">@{u.username}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
      {qrUrl && (
        <div className="social-story-viewer" role="dialog" aria-label="Profile QR" onClick={() => setQrUrl(null)}>
          <div className="social-story-content" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', color: 'var(--text)', padding: 16, borderRadius: 12 }}>
            <header style={{ marginBottom: 12 }}>
              <strong>Profile QR</strong>
              <button type="button" onClick={() => setQrUrl(null)}>Close</button>
            </header>
            <img src={qrUrl} alt="Profile QR code" width={200} height={200} style={{ margin: '0 auto', display: 'block' }} />
            <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>Scan to open this FINO profile</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditProps {
  profile: Profile;
  onSaved: (p: Profile) => void;
  onCancel: () => void;
}

export function EditProfileForm({ profile, onSaved, onCancel }: EditProps) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [website, setWebsite] = useState(profile.website ?? '');
  const [isPrivate, setIsPrivate] = useState(profile.is_private);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(profile.id, {
        display_name: displayName.trim() || null,
        username: username.trim() || null,
        bio: bio.trim(),
        location: location.trim() || null,
        website: website.trim() || null,
        is_private: isPrivate,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="social-edit-profile">
      <h2>Edit profile</h2>
      <label>
        Display name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
      </label>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
      </label>
      <label>
        Bio
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} />
      </label>
      <label>
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} />
      </label>
      <label>
        Website
        <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={120} />
      </label>
      <label className="social-check">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Private account (approve followers)
      </label>
      {error && <p className="social-error">{error}</p>}
      <div className="social-composer-actions">
        <button type="button" className="social-btn ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="social-btn primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

    </div>
  );
}
