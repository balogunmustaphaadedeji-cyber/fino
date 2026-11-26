import { supabase } from '../../lib/supabase';

export type CloudinaryResourceType = 'image' | 'video' | 'raw';

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  resource_type: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
};

/**
 * Secure Cloudinary upload flow.
 *
 * This client helper intentionally requires a trusted Supabase Edge Function
 * named `cloudinary-sign-upload` to return short-lived signing parameters.
 * The Cloudinary API secret must only exist in that server function's secrets.
 *
 * Uploads are not enabled until that function is implemented and deployed.
 */
export type CloudinaryUploadPurpose = 'profile' | 'cover' | 'post' | 'story' | 'chat';

export async function uploadToCloudinary(
  file: File,
  resourceType: CloudinaryResourceType = 'image',
  purpose: CloudinaryUploadPurpose = 'post',
): Promise<CloudinaryUploadResult> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;

  if (!cloudName) {
    throw new Error('Cloudinary is not configured: missing VITE_CLOUDINARY_CLOUD_NAME.');
  }
  if (!supabase) {
    throw new Error('Supabase is not configured. Connect the FINO backend before uploading media.');
  }
  if (!file.size) {
    throw new Error('The selected file is empty.');
  }

  const { data: signing, error: signingError } = await supabase.functions.invoke(
    'cloudinary-sign-upload',
    { body: { resourceType, fileName: file.name, contentType: file.type, size: file.size, purpose } },
  );

  if (signingError) throw new Error(`Could not prepare secure upload: ${signingError.message}`);
  if (!signing?.apiKey || !signing?.timestamp || !signing?.signature || !signing?.folder) {
    throw new Error('The media signing service returned an invalid response.');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signing.apiKey);
  form.append('timestamp', String(signing.timestamp));
  form.append('signature', signing.signature);
  form.append('folder', signing.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
    { method: 'POST', body: form },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Cloudinary upload failed.');
  }

  return payload as CloudinaryUploadResult;
}
