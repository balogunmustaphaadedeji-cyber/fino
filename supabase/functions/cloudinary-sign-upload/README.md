# cloudinary-sign-upload

Trusted Edge Function for signed Cloudinary uploads.

## Secrets (set via Supabase dashboard or CLI)

```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided automatically to Edge Functions.

## Deploy

```bash
supabase functions deploy cloudinary-sign-upload
supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...
```

## Behaviour

- Requires a valid Supabase user JWT.
- Validates MIME type, size, resource type.
- Chooses folder as `fino/users/<auth.uid()>/<purpose>` (profile|cover|post|story).
- Returns only apiKey, timestamp, signature, folder — never the API secret.

## Client

`src/shared/media/cloudinary.ts` calls this function. Optional body field `purpose`.

## Status

Source is implemented. **Not operational until secrets are set and the function is deployed** against a real Cloudinary account.
