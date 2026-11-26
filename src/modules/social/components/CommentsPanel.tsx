import { useEffect, useState } from 'react';
import { X, Send, Heart } from 'lucide-react';
import type { Comment, Post } from '../types';
import {
  fetchComments,
  createComment,
  deleteComment,
  likeComment,
  unlikeComment,
} from '../api/client';
import { Avatar } from './Avatar';

interface Props {
  post: Post;
  currentUserId?: string | null;
  onClose: () => void;
}

export function CommentsPanel({ post, currentUserId, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fetchComments(post.id);
        if (!cancelled) setComments(result.items);
      } catch {
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  async function send() {
    if (!body.trim() || !currentUserId || sending) return;
    setSending(true);
    try {
      const created = await createComment(post.id, body, replyTo);
      if (replyTo) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo
              ? { ...c, replies: [...(c.replies ?? []), created] }
              : c,
          ),
        );
      } else {
        setComments((prev) => [...prev, created]);
      }
      setBody('');
      setReplyTo(null);
    } catch {
      alert('Could not post comment');
    } finally {
      setSending(false);
    }
  }

  async function remove(commentId: string, parentId?: string | null) {
    try {
      await deleteComment(commentId);
      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: (c.replies ?? []).filter((r) => r.id !== commentId) }
              : c,
          ),
        );
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch {
      /* ignore */
    }
  }

  async function toggleLike(comment: Comment) {
    if (!currentUserId) return;
    const next = !comment.liked_by_me;
    try {
      if (next) await likeComment(comment.id);
      else await unlikeComment(comment.id);
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === comment.id) {
            return {
              ...c,
              liked_by_me: next,
              like_count: c.like_count + (next ? 1 : -1),
            };
          }
          if (c.replies) {
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === comment.id
                  ? {
                      ...r,
                      liked_by_me: next,
                      like_count: r.like_count + (next ? 1 : -1),
                    }
                  : r,
              ),
            };
          }
          return c;
        }),
      );
    } catch {
      /* ignore */
    }
  }

  function CommentRow({
    comment,
    depth = 0,
  }: {
    comment: Comment;
    depth?: number;
  }) {
    const isOwner = currentUserId === comment.author_id;
    return (
      <div className={`social-comment ${depth > 0 ? 'reply' : ''}`}>
        <Avatar
          src={comment.author?.avatar_url}
          name={comment.author?.display_name || comment.author?.username}
          size={32}
        />
        <div className="social-comment-body">
          <strong>{comment.author?.display_name || comment.author?.username || 'User'}</strong>
          <p>{comment.body}</p>
          <div className="social-comment-meta">
            <button type="button" onClick={() => toggleLike(comment)} disabled={!currentUserId}>
              <Heart size={12} fill={comment.liked_by_me ? 'currentColor' : 'none'} />
              {comment.like_count || ''}
            </button>
            {depth < 2 && currentUserId && (
              <button type="button" onClick={() => setReplyTo(comment.id)}>
                Reply
              </button>
            )}
            {isOwner && (
              <button type="button" onClick={() => remove(comment.id, comment.parent_id)}>
                Delete
              </button>
            )}
          </div>
          {comment.replies?.map((r) => (
            <CommentRow key={r.id} comment={r} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="social-comments-panel" role="dialog" aria-label="Comments">
      <header>
        <h3>Comments</h3>
        <button type="button" className="icon-button social-icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>
      <div className="social-comments-list">
        {loading && <p className="muted">Loading…</p>}
        {!loading && comments.length === 0 && (
          <p className="muted">No comments yet. Start the conversation.</p>
        )}
        {comments.map((c) => (
          <CommentRow key={c.id} comment={c} />
        ))}
      </div>
      {currentUserId ? (
        <div className="social-comment-compose">
          {replyTo && (
            <div className="social-reply-hint">
              Replying…
              <button type="button" onClick={() => setReplyTo(null)}>
                Cancel
              </button>
            </div>
          )}
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            maxLength={2000}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          />
          <button type="button" className="social-btn primary" onClick={send} disabled={sending || !body.trim()}>
            <Send size={16} />
          </button>
        </div>
      ) : (
        <p className="muted social-login-hint">Sign in to comment.</p>
      )}
    </div>
  );
}
