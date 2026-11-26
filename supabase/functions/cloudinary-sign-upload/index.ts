/**
 * FINO trusted Cloudinary upload signing.
 *
 * Secrets (Supabase function secrets — never VITE_):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Deploy:
 *   supabase functions deploy cloudinary-sign-upload --no-verify-jwt=false
 *
 * Client: src/shared/media/cloudinary.ts invokes this function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const ALLOWED_PURPOSES = ['profile', 'cover', 'post', 'story', 'chat'] as const;
type Purpose = (typeof ALLOWED_PURPOSES)[number];

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_RAW_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/ogg', 'audio/mp4']);
const ALLOWED_RAW = new Set(['application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']);

interface SignBody {
  resourceType?: 'image' | 'video' | 'raw';
  fileName?: string;
  contentType?: string;
  size?: number;
  purpose?: Purpose;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Vary': 'Origin' },
  });
}

async function sha1Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY');

  if (!cloudName || !apiKey || !apiSecret || !supabaseUrl || !supabaseAnon) {
    return json(500, { error: 'server_misconfigured' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'unauthenticated' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return json(401, { error: 'unauthenticated' });
  }

  let body: SignBody;
  try {
    body = (await req.json()) as SignBody;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const resourceType = body.resourceType ?? 'image';
  const purpose: Purpose = ALLOWED_PURPOSES.includes(body.purpose as Purpose)
    ? (body.purpose as Purpose)
    : 'post';
  const contentType = (body.contentType ?? '').toLowerCase();
  const size = Number(body.size ?? 0);

  if (resourceType !== 'image' && resourceType !== 'video' && !(resourceType === 'raw' && purpose === 'chat')) {
    return json(400, { error: 'invalid_resource_type' });
  }
  if (resourceType === 'image') {
    if (!ALLOWED_IMAGE.has(contentType)) {
      return json(400, { error: 'invalid_mime_type' });
    }
    if (size <= 0 || size > MAX_IMAGE_BYTES) {
      return json(400, { error: 'invalid_file_size' });
    }
  } else if (resourceType === 'video') {
    if (!ALLOWED_VIDEO.has(contentType)) return json(400, { error: 'invalid_mime_type' });
    if (size <= 0 || size > MAX_VIDEO_BYTES) return json(400, { error: 'invalid_file_size' });
  } else {
    if (purpose !== 'chat' || !ALLOWED_RAW.has(contentType)) return json(400, { error: 'invalid_mime_type' });
    if (size <= 0 || size > MAX_RAW_BYTES) return json(400, { error: 'invalid_file_size' });
  }

  // Folder is server-chosen from authenticated user id — never trust client path
  const folder = `fino/users/${user.id}/${purpose}`;
  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary signature: sorted params string + api_secret, SHA-1
  const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = await sha1Hex(toSign);

  return json(200, {
    apiKey,
    timestamp,
    signature,
    folder,
    cloudName,
    resourceType,
  });
});
