import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedMode, Post } from '../types';
import { fetchFeed } from '../api/client';
import { PostCard } from './PostCard';

interface Props {
  mode: FeedMode;
  currentUserId?: string | null;
  onOpenComments?: (post: Post) => void;
  onOpenProfile?: (userId: string) => void;
  refreshKey?: number;
}

export function Feed({
  mode,
  currentUserId,
  onOpenComments,
  onOpenProfile,
  refreshKey = 0,
}: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (reset = false) => {
      try {
        if (reset) {
          setLoading(true);
          setError(null);
        } else {
          setLoadingMore(true);
        }
        const result = await fetchFeed(mode, {
          cursor: reset ? undefined : cursor ?? undefined,
        });
        setPosts((prev) => (reset ? result.items : [...prev, ...result.items]));
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load feed');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mode, cursor],
  );

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refreshKey]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) load(false);
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, load]);

  function handleDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading && posts.length === 0) {
    return (
      <div className="social-feed-skeleton" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="social-skeleton-card" />
        ))}
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className="social-empty">
        <p>{error}</p>
        <button type="button" className="social-btn" onClick={() => load(true)}>
          Retry
        </button>
      </div>
    );
  }

  if (!loading && posts.length === 0) {
    return (
      <div className="social-empty">
        <p className="muted">
          {mode === 'following'
            ? 'No posts from people you follow yet. Discover people to get started.'
            : 'No posts yet. Be the first to share something.'}
        </p>
      </div>
    );
  }

  return (
    <div className="social-feed">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          onDeleted={handleDeleted}
          onOpenComments={onOpenComments}
          onOpenProfile={onOpenProfile}
        />
      ))}
      <div ref={sentinelRef} />
      {loadingMore && <p className="muted social-loading-more">Loading more…</p>}
      {!hasMore && posts.length > 0 && (
        <p className="muted social-loading-more">You are all caught up.</p>
      )}
    </div>
  );
}
