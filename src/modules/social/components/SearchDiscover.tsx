import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { Post, Profile } from '../types';
import {
  searchProfiles,
  searchPosts,
  getTrendingHashtags,
  upsertSocialPreferences,
  getSocialPreferences,
} from '../api/client';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';

interface Props {
  currentUserId?: string | null;
  onOpenProfile?: (userId: string) => void;
  onOpenComments?: (post: Post) => void;
}

export function SearchDiscover({ currentUserId, onOpenProfile, onOpenComments }: Props) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [trending, setTrending] = useState<{ tag: string; post_count: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    getTrendingHashtags(8).then(setTrending).catch(() => setTrending([]));
    if (currentUserId) {
      getSocialPreferences()
        .then((p) => setHistory((p?.search_history as string[]) ?? []))
        .catch(() => {});
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      setPosts([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const [u, p] = await Promise.all([
          searchProfiles(query, 12),
          searchPosts(query, 12),
        ]);
        setUsers(u);
        setPosts(p);
        if (currentUserId && query.trim().length > 1) {
          const next = [query.trim(), ...history.filter((h) => h !== query.trim())].slice(0, 10);
          setHistory(next);
          upsertSocialPreferences({ search_history: next }).catch(() => {});
        }
      } catch {
        setUsers([]);
        setPosts([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, currentUserId]);

  async function clearHistory() {
    setHistory([]);
    if (currentUserId) {
      await upsertSocialPreferences({ search_history: [] });
    }
  }

  return (
    <div className="social-search">
      <div className="social-search-bar">
        <Search size={18} />
        <input
          type="search"
          placeholder="Search people, posts, hashtags"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
      </div>

      {!query.trim() && (
        <>
          {history.length > 0 && (
            <section className="social-section">
              <div className="social-section-head">
                <h3>Recent</h3>
                <button type="button" className="social-link-btn" onClick={clearHistory}>
                  Clear
                </button>
              </div>
              <div className="social-chip-row">
                {history.map((h) => (
                  <button key={h} type="button" className="social-chip" onClick={() => setQuery(h)}>
                    {h}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="social-section">
            <h3>Trending hashtags</h3>
            {trending.length === 0 ? (
              <p className="muted">No trending tags yet.</p>
            ) : (
              <div className="social-chip-row">
                {trending.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    className="social-chip"
                    onClick={() => setQuery(`#${t.tag}`)}
                  >
                    #{t.tag} <span className="muted">{t.post_count}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {query.trim() && (
        <>
          {searching && <p className="muted">Searching…</p>}
          <section className="social-section">
            <h3>People</h3>
            {users.length === 0 && !searching ? (
              <p className="muted">No people found.</p>
            ) : (
              <div className="social-user-list">
                {users.map((u) => (
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
                ))}
              </div>
            )}
          </section>
          <section className="social-section">
            <h3>Posts</h3>
            {posts.length === 0 && !searching ? (
              <p className="muted">No posts found.</p>
            ) : (
              <div className="social-feed">
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    currentUserId={currentUserId}
                    onOpenComments={onOpenComments}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
