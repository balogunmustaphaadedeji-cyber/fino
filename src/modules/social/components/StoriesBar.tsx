import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Story } from '../types';
import { fetchActiveStories, markStoryViewed, deleteStory, createStory } from '../api/client';
import { uploadToCloudinary } from '../../../shared/media/cloudinary';
import { Avatar } from './Avatar';
import { mediaImageUrl, mediaVideoUrl } from '../utils/media';

interface Props {
  currentUserId?: string | null;
}

const IMAGE_DURATION_MS = 5000;

export function StoriesBar({ currentUserId }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    fetchActiveStories()
      .then((s) => {
        if (!cancelled) setStories(s.filter((x) => new Date(x.expires_at) > new Date()));
      })
      .catch(() => {
        if (!cancelled) setStories([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Group by author, latest first per author, keep ordered list for viewer
  const rings = useMemo(() => {
    const byAuthor = new Map<string, Story>();
    for (const s of stories) {
      const existing = byAuthor.get(s.author_id);
      if (!existing || new Date(s.created_at) > new Date(existing.created_at)) {
        byAuthor.set(s.author_id, s);
      }
    }
    return Array.from(byAuthor.values());
  }, [stories]);

  const active = viewerIndex !== null ? rings[viewerIndex] ?? null : null;

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const goNext = useCallback(() => {
    setViewerIndex((i) => {
      if (i === null) return null;
      if (i >= rings.length - 1) return null;
      return i + 1;
    });
    setProgress(0);
    elapsedRef.current = 0;
  }, [rings.length]);

  const goPrev = useCallback(() => {
    setViewerIndex((i) => {
      if (i === null || i <= 0) return i;
      return i - 1;
    });
    setProgress(0);
    elapsedRef.current = 0;
  }, []);

  useEffect(() => {
    if (viewerIndex === null || !active || paused) {
      clearTimer();
      return;
    }
    if (active.resource_type === 'video') {
      // video drives its own end via onEnded
      return;
    }
    startRef.current = Date.now();
    const duration = IMAGE_DURATION_MS;
    timerRef.current = window.setInterval(() => {
      const elapsed = elapsedRef.current + (Date.now() - startRef.current);
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        elapsedRef.current = 0;
        goNext();
      }
    }, 50);
    return clearTimer;
  }, [viewerIndex, active, paused, goNext]);

  useEffect(() => {
    if (!active || !currentUserId) return;
    if (currentUserId !== active.author_id) {
      markStoryViewed(active.id).catch(() => {});
    }
  }, [active?.id, currentUserId]);

  async function onAddStory(file: File | null) {
    if (!file || !currentUserId) return;
    setUploading(true);
    try {
      const isVideo = file.type.startsWith('video/');
      if (file.size > (isVideo ? 80 * 1024 * 1024 : 12 * 1024 * 1024)) {
        throw new Error('File too large');
      }
      const result = await uploadToCloudinary(file, isVideo ? 'video' : 'image', 'story');
      const created = await createStory({
        cloudinary_public_id: result.public_id,
        resource_type: isVideo ? 'video' : 'image',
        mime_type: file.type,
      });
      setStories((prev) => [created, ...prev]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Story upload requires Cloudinary signing.');
    } finally {
      setUploading(false);
    }
  }

  async function removeOwn() {
    if (!active || active.author_id !== currentUserId) return;
    await deleteStory(active.id);
    setStories((prev) => prev.filter((s) => s.id !== active.id));
    goNext();
  }

  function onPointerDown() {
    if (active?.resource_type === 'image') {
      elapsedRef.current += Date.now() - startRef.current;
      setPaused(true);
    }
  }
  function onPointerUp() {
    setPaused(false);
  }

  if (loading && rings.length === 0) {
    return null;
  }

  return (
    <>
      <div className="social-stories-bar" aria-label="Stories">
        {currentUserId && (
          <label className="social-story-ring add">
            <span className="social-story-add-icon">{uploading ? '…' : <Plus size={20} />}</span>
            <span>Your story</span>
            <input
              type="file"
              accept="image/*,video/*"
              hidden
              disabled={uploading}
              onChange={(e) => onAddStory(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {rings.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            className={`social-story-ring ${s.viewed_by_me ? 'viewed' : ''}`}
            onClick={() => {
              setViewerIndex(idx);
              setProgress(0);
              elapsedRef.current = 0;
            }}
          >
            <Avatar
              src={s.author?.avatar_url}
              name={s.author?.display_name || s.author?.username}
              size={56}
            />
            <span>{s.author?.username || s.author?.display_name || 'User'}</span>
          </button>
        ))}
      </div>

      {active && viewerIndex !== null && (
        <div
          className="social-story-viewer"
          role="dialog"
          aria-label="Story viewer"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <div className="social-story-content" onClick={(e) => e.stopPropagation()}>
            <div className="social-story-progress-track">
              <div className="social-story-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <header>
              <Avatar
                src={active.author?.avatar_url}
                name={active.author?.display_name}
                size={32}
              />
              <strong>{active.author?.display_name || active.author?.username}</strong>
              <button type="button" onClick={() => setViewerIndex(null)} aria-label="Close">
                <X size={18} />
              </button>
              {active.author_id === currentUserId && (
                <button type="button" onClick={removeOwn}>
                  Delete
                </button>
              )}
            </header>
            <div className="social-story-nav">
              <button type="button" className="social-story-nav-btn prev" onClick={goPrev} aria-label="Previous">
                <ChevronLeft size={28} />
              </button>
              {active.resource_type === 'video' ? (
                <video
                  key={active.id}
                  src={mediaVideoUrl(active.cloudinary_public_id)}
                  autoPlay
                  playsInline
                  controls
                  onEnded={goNext}
                  onPlay={() => setPaused(false)}
                  onPause={() => setPaused(true)}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (v.duration && Number.isFinite(v.duration)) {
                      setProgress(Math.min(100, (v.currentTime / v.duration) * 100));
                    }
                  }}
                  onError={() => {
                    setProgress(100);
                    window.setTimeout(() => goNext(), 800);
                  }}
                />
              ) : (
                <img
                  key={active.id}
                  src={mediaImageUrl(active.cloudinary_public_id, { width: 720 })}
                  alt={active.caption || ''}
                />
              )}
              <button type="button" className="social-story-nav-btn next" onClick={goNext} aria-label="Next">
                <ChevronRight size={28} />
              </button>
            </div>
            {active.caption && <p>{active.caption}</p>}
          </div>
        </div>
      )}
    </>
  );
}
