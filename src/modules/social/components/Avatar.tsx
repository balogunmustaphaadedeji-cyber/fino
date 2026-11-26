import { avatarUrl } from '../utils/media';

interface Props {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className = '' }: Props) {
  const url = avatarUrl(src, size * 2);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className={`social-avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
      aria-hidden={!name}
    >
      {url ? (
        <img src={url} alt="" width={size} height={size} loading="lazy" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
