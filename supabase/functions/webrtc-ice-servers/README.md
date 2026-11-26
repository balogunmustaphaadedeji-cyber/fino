# WebRTC TURN credential function

Deploy with `supabase functions deploy webrtc-ice-servers --no-verify-jwt=false`.

Configure Edge Function secrets:
- `TURN_URLS`: comma-separated TURN/TURNS URLs
- `TURN_SHARED_SECRET`: coturn REST API shared secret (never expose as a VITE_ variable)
- `TURN_TTL_SECONDS`: optional credential lifetime (300–86400; defaults to 3600)

The function requires an authenticated FINO session and returns short-lived HMAC-SHA1 coturn REST credentials. If TURN is not configured it returns an empty TURN list; the client falls back to STUN, which is not sufficient for reliable production connectivity behind restrictive NATs.
