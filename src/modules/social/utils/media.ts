/**
 * Media URL helpers for the Social module.
 * Uses the public Cloudinary cloud name from env for delivery URLs.
 * Upload still requires the shared signed-upload function.
 */

const cloudName = () => (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined) ?? '';

export function mediaImageUrl(
  publicId: string,
  options?: { width?: number; height?: number; crop?: string },
): string {
  const name = cloudName();
  if (!name || !publicId) return '';
  if (publicId.startsWith('http')) return publicId;
  const w = options?.width ?? 800;
  const h = options?.height;
  const crop = options?.crop ?? 'limit';
  const transforms = [`c_${crop}`, `w_${w}`, h ? `h_${h}` : null, 'q_auto', 'f_auto']
    .filter(Boolean)
    .join(',');
  return `https://res.cloudinary.com/${name}/image/upload/${transforms}/${publicId}`;
}

export function mediaVideoUrl(publicId: string): string {
  const name = cloudName();
  if (!name || !publicId) return '';
  if (publicId.startsWith('http')) return publicId;
  return `https://res.cloudinary.com/${name}/video/upload/q_auto/${publicId}`;
}

export function avatarUrl(publicIdOrUrl: string | null | undefined, size = 96): string | null {
  if (!publicIdOrUrl) return null;
  if (publicIdOrUrl.startsWith('http')) return publicIdOrUrl;
  return mediaImageUrl(publicIdOrUrl, { width: size, height: size, crop: 'fill' });
}
