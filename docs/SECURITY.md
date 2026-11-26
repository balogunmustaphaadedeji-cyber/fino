# FINO Security Baseline

- Supabase anon/publishable key may be used in the client only with correctly configured RLS.
- Service-role keys, database passwords, signing secrets and private API keys must remain server-side.
- Enable RLS on every table exposed through the Supabase API.
- Default to deny; add only the policies required for a feature.
- Never allow a user to self-assign privileged roles.
- Validate and authorise every trusted-server operation.
- Rate-limit login-adjacent, messaging, search, upload, report and invitation flows.
- Validate uploaded file type, size and ownership; do not trust file extensions alone.
- Use secure session handling and provide session revocation.
- Minimise personal data collection and define retention/deletion behaviour.
- Log privileged administrative actions without logging passwords, tokens or private message content.
- Test cross-user access denial, not only successful owner access.
- Treat all client input, uploaded content and external AI output as untrusted.

- FINO Chat message records and attachment metadata are protected by conversation RLS. The current Cloudinary upload flow still produces publicly deliverable asset URLs; do not treat these URLs as private attachment storage until authenticated delivery/signing is implemented.
- TURN shared secrets must be stored only as Supabase Edge Function secrets. The client receives short-lived per-user TURN credentials from `webrtc-ice-servers`.
