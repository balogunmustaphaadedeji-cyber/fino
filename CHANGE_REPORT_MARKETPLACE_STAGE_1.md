# FINO Marketplace Stage 1 — Change Report

## Implemented

### Authentication (shared account — not a second identity system)
- Phone registration with searchable country/flag/dial-code list and E.164 formatting
- Real Supabase `signInWithOtp` / `verifyOtp` for SMS and email (no simulated codes)
- Password sign-in, password set after OTP, password reset email
- Resend countdown, change phone/email, error handling
- Server OTP rate limit RPC `auth_check_otp_rate` (5 / 15 min per identifier)
- Login event log table + anti-enumeration messaging on reset
- `AuthProvider` + `AuthPage` under `src/shared/auth/`

### Settings
- Account: profile, phone/email verification display, change email, password
- Security: change password, reset email, login history
- Privacy: visibility, who can contact, activity
- Notifications: push/email/sms/orders/messages/promotions preferences
- Preferences: theme, language, country, currency, timezone, accessibility
- Help & support placeholders
- Logout / session via Supabase Auth

### Marketplace foundation
- Migration `0011_marketplace_auth_settings.sql`
- Tables: categories, seller_profiles, products, orders (+ RLS)
- Module `src/modules/marketplace/` with Stage 1 shell (roles, categories, seller create, product list empty state)
- Nav item **Market** in AppShell
- Buyer = any authenticated user; seller = seller profile row (same account)

## Preserved
Social, Games, Chat, Learn modules — not redesigned. Shared shell extended with Market nav and AuthProvider only.

## External services still required
1. Supabase project with migrations applied through `0011`
2. **Phone auth provider** (Twilio/MessageBird/Vonage) in Supabase Dashboard
3. **Email** templates / SMTP for OTP and password recovery
4. Optional: MFA enablement for full 2FA UX
5. Push notification delivery (preferences stored only)

## Tests executed
| Test | Result |
|------|--------|
| Static review: authApi calls real supabase.auth OTP APIs | Pass |
| Static review: no hardcoded OTP acceptance | Pass |
| Static review: RLS on marketplace tables | Pass (SQL) |
| Live SMS/email OTP delivery | **Not executed** — no provider credentials in this environment |
| Live rate-limit RPC | **Not executed** — needs Supabase project |
| Browser E2E auth/settings | **Not executed** |

## Files added
- `supabase/migrations/0011_marketplace_auth_settings.sql`
- `src/shared/auth/*` (AuthPage, AuthProvider, authApi, countries, auth.css)
- `src/modules/marketplace/**`
- `CHANGE_REPORT_MARKETPLACE_STAGE_1.md`

## Files modified
- `src/App.tsx`, `src/main.tsx`, `src/shared/layout/AppShell.tsx`
- `src/shared/settings/SettingsPage.tsx`
- `src/styles.css`, `.env.example`, `docs/FEATURE_REGISTER.md`

## Not in Stage 1
Product CRUD UI, cart, checkout, payments, shipping, reviews, admin marketplace console.
