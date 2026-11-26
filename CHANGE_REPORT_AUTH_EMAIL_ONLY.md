# Auth decision: email-only OTP

## Changes
- Removed SMS / phone OTP send and verify from `authApi` and `AuthPage`
- Registration: full name, country, phone (E.164 stored), email, password + confirm → **email OTP** only
- Login: email **or** phone + password (phone resolved via `auth_email_for_phone` RPC)
- Forgot password: **email only**; explicit error if phone is entered
- Change email: Supabase confirmation to new address
- Change phone: profile update while authenticated (no SMS)
- Rate limit still applies to email OTP / recovery via `auth_check_otp_rate`
- Migration `0012_auth_email_only.sql` adds `auth_email_for_phone`

## Shared account
Unchanged — one Supabase Auth user across Social, Games, Chat, Learn, Marketplace.

## Configure
1. Supabase Email provider + templates (6-digit OTP / signup confirmation)
2. Apply migrations through `0012`
3. No SMS provider required for this version

## Tests
| Check | Result |
|-------|--------|
| No SMS OTP API usage in auth module | Pass (static) |
| Register form collects required fields | Pass (static) |
| Reset rejects non-email | Pass (static) |
| Live email delivery | Not executed (needs project SMTP) |
