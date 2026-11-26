import { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  Trash2,
  Flag,
  EyeOff,
} from 'lucide-react';
import type { Post } from '../types';
import { Avatar } from './Avatar';
import { mediaImageUrl, mediaVideoUrl } from '../utils/media';
import {
  likePost,
  unlikePost,
  bookmarkPost,
  unbookmarkPost,
  deletePost,
  hidePost,
  reportContent,
} from '../api/client';

interface Props {
  post: Post;
  currentUserId?: string | null;
  onDeleted?: (id: string) => void;
  onOpenComments?: (post: Post) => void;
  onOpenProfile?: (userId: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function PostCard({
  post,
  currentUserId,
  onDeleted,
  onOpenComments,
  onOpenProfile,
}: Props) {
  const [liked, setLiked] = useState(Boolean(post.liked_by_me));
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [bookmarked, setBookmarked] = useState(Boolean(post.bookmarked_by_me));
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = currentUserId === post.author_id;
  const author = post.author;

  async function toggleLike() {
    if (!currentUserId || busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      if (next) await likePost(post.id);
      else await unlikePost(post.id);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark() {
    if (!currentUserId || busy) return;
    setBusy(true);
    const next = !bookmarked;
    setBookmarked(next);
    try {
      if (next) await bookmarkPost(post.id);
      else await unbookmarkPost(post.id);
    } catch {
      setBookmarked(!next);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!isOwner || busy) return;
    if (!window.confirm('Delete this post?')) return;
    setBusy(true);
    try {
      await deletePost(post.id);
      onDeleted?.(post.id);
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  async function handleHide() {
    if (busy) return;
    setBusy(true);
    try {
      await hidePost(post.id);
      onDeleted?.(post.id);
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  async function handleReport() {
    if (busy) return;
    setBusy(true);
    try {
      await reportContent({
        target_type: 'post',
        target_id: post.id,
        reason: 'other',
        details: 'Reported from feed',
      });
      alert('Report submitted. Thank you.');
    } catch {
      alert('Could not submit report.');
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  function sharePost() {
    const url = `${window.location.origin}/social?post=${post.id}`;
    if (navigator.share) {
      navigator.share({ title: 'FINO post', url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      alert('Link copied');
    }
  }

  return (
    <article className="social-post-card">
      <header className="social-post-header">
        <button
          type="button"
          className="social-author-btn"
          onClick={() => onOpenProfile?.(post.author_id)}
        >
          <Avatar src={author?.avatar_url} name={author?.display_name || author?.username} size={40} />
          <div className="social-author-meta">
            <strong>{author?.display_name || author?.username || 'User'}</strong>
            <span className="muted">
              {author?.username ? `@${author.username}` : ''} · {timeAgo(post.created_at)}
              {post.is_edited ? ' · edited' : ''}
            </span>
          </div>
        </button>
        <div className="social-post-menu-wrap">
          <button
            type="button"
            className="icon-button social-icon-btn"
            aria-label="Post options"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div className="social-menu">
              {isOwner && (
                <button type="button" onClick={handleDelete}>
                  <Trash2 size={16} /> Delete
                </button>
              )}
              {!isOwner && (
                <>
                  <button type="button" onClick={handleHide}>
                    <EyeOff size={16} /> Hide
                  </button>
                  <button type="button" onClick={handleReport}>
                    <Flag size={16} /> Report
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {post.caption && <p className="social-post-caption">{post.caption}</p>}

      {post.media && post.media.length > 0 && (
        <div className={`social-media-grid count-${Math.min(post.media.length, 4)}`}>
          {post.media.slice(0, 4).map((m) =>
            m.resource_type === 'video' ? (
              <video
                key={m.id}
                className="social-media-item"
                src={mediaVideoUrl(m.cloudinary_public_id)}
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                key={m.id}
                className="social-media-item"
                src={mediaImageUrl(m.cloudinary_public_id, { width: 720 })}
                alt=""
                loading="lazy"
              />
            ),
          )}
        </div>
      )}

      <footer className="social-post-actions">
        <button
          type="button"
          className={`social-action ${liked ? 'active' : ''}`}
          onClick={toggleLike}
          disabled={!currentUserId}
          aria-pressed={liked}
        >
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
          <span>{likeCount || ''}</span>
        </button>
        <button
          type="button"
          className="social-action"
          onClick={() => onOpenComments?.(post)}
        >
          <MessageCircle size={18} />
          <span>{post.comment_count || ''}</span>
        </button>
        <button type="button" className="social-action" onClick={sharePost}>
          <Share2 size={18} />
        </button>
        <button
          type="button"
          className={`social-action ${bookmarked ? 'active' : ''}`}
          onClick={toggleBookmark}
          disabled={!currentUserId}
          aria-pressed={bookmarked}
        >
          <Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
      </footer>
    </article>
  );
}
