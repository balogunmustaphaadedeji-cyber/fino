import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { createPost } from '../api/client';
import { uploadToCloudinary } from '../../../shared/media/cloudinary';
import type { Visibility } from '../types';

interface Props {
  onCreated?: () => void;
  onCancel?: () => void;
}

type PendingMedia = {
  file: File;
  preview: string;
  resourceType: 'image' | 'video';
};

export function CreatePost({ onCreated, onCancel }: Props) {
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFilesSelected(files: FileList | null) {
    if (!files) return;
    const next: PendingMedia[] = [];
    for (const file of Array.from(files).slice(0, 4 - media.length)) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) continue;
      if (file.size > (isVideo ? 80 * 1024 * 1024 : 12 * 1024 * 1024)) {
        setError('File too large (max 12MB image / 80MB video).');
        continue;
      }
      next.push({
        file,
        preview: URL.createObjectURL(file),
        resourceType: isVideo ? 'video' : 'image',
      });
    }
    setMedia((m) => [...m, ...next]);
  }

  function removeMedia(index: number) {
    setMedia((m) => {
      const copy = [...m];
      URL.revokeObjectURL(copy[index].preview);
      copy.splice(index, 1);
      return copy;
    });
  }

  async function publish() {
    if (!caption.trim() && media.length === 0) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const uploaded: {
        cloudinary_public_id: string;
        resource_type: 'image' | 'video';
        mime_type: string | null;
        width: number | null;
        height: number | null;
        duration_seconds: number | null;
        owner_id: string;
        sort_order: number;
      }[] = [];

      for (let i = 0; i < media.length; i++) {
        const item = media[i];
        setProgress(Math.round(((i + 0.5) / Math.max(media.length, 1)) * 100));
        try {
          const result = await uploadToCloudinary(item.file, item.resourceType, 'post');
          uploaded.push({
            cloudinary_public_id: result.public_id,
            resource_type: item.resourceType,
            mime_type: item.file.type || null,
            width: result.width ?? null,
            height: result.height ?? null,
            duration_seconds: null,
            owner_id: '', // filled by API from session
            sort_order: i,
          });
        } catch (e) {
          // Signing function not deployed yet — allow text-only posts
          throw new Error(
            e instanceof Error
              ? e.message
              : 'Media upload unavailable. Text posts still work.',
          );
        }
      }

      // owner_id is set server-side via RLS / insert; API expects it but we override in createPost
      await createPost({
        caption,
        visibility,
        media: uploaded.map((u) => ({
          ...u,
          owner_id: 'placeholder', // createPost replaces with real uid
        })),
      });
      media.forEach((m) => URL.revokeObjectURL(m.preview));
      setCaption('');
      setMedia([]);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div className="social-composer">
      <textarea
        className="social-composer-input"
        placeholder="What's happening?"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={3}
        maxLength={2000}
        disabled={uploading}
      />
      {media.length > 0 && (
        <div className="social-composer-media">
          {media.map((m, i) => (
            <div key={m.preview} className="social-composer-thumb">
              {m.resourceType === 'video' ? (
                <video src={m.preview} muted />
              ) : (
                <img src={m.preview} alt="" />
              )}
              <button
                type="button"
                className="social-thumb-remove"
                onClick={() => removeMedia(i)}
                aria-label="Remove media"
                disabled={uploading}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="social-error">{error}</p>}
      {uploading && (
        <div className="social-progress">
          <div className="social-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="social-composer-toolbar">
        <button
          type="button"
          className="icon-button social-icon-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || media.length >= 4}
          aria-label="Add media"
        >
          <ImagePlus size={18} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <select
          className="social-select"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          disabled={uploading}
        >
          <option value="public">Public</option>
          <option value="followers">Followers</option>
          <option value="private">Only me</option>
        </select>
        <div className="social-composer-actions">
          {onCancel && (
            <button type="button" className="social-btn ghost" onClick={onCancel} disabled={uploading}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="social-btn primary"
            onClick={publish}
            disabled={uploading || (!caption.trim() && media.length === 0)}
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="spin" /> Publishing…
              </>
            ) : (
              'Post'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
