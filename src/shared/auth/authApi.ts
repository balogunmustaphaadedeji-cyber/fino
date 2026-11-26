/**
 * FINO authentication — EMAIL is the only OTP / verification channel.
 * Phone is collected for identity and password login lookup; SMS OTP is not used.
 * Never accepts simulated or hardcoded verification codes.
 */
import { supabase } from '../../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/** Rate-limit gate before email OTP / recovery (server RPC). */
export async function checkOtpRate(identifier: string, channel: 'email' = 'email') {
  const { error } = await client().rpc('auth_check_otp_rate', {
    p_identifier: identifier,
    p_channel: channel,
  });
  if (error) throw new Error(error.message);
}

export type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
  phoneE164: string;
  phoneCountry: string;
};

/**
 * Register with email + password. Phone and name stored in metadata / profile.
 * Supabase sends a real email confirmation / OTP (project email templates).
 */
export async function registerWithEmail(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Enter a valid email address');
  if (input.password.length < 8) throw new Error('Password must be at least 8 characters');
  if (!input.fullName.trim()) throw new Error('Enter your full name');
  if (input.phoneE164.replace(/\D/g, '').length < 8) throw new Error('Enter a valid phone number');

  await checkOtpRate(email, 'email');

  const { data, error } = await client().auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        display_name: input.fullName.trim(),
        full_name: input.fullName.trim(),
        phone_e164: input.phoneE164,
        phone_country: input.phoneCountry,
      },
    },
  });
  if (error) throw new Error(error.message);

  if (data.user) {
    await client()
      .from('profiles')
      .upsert({
        id: data.user.id,
        display_name: input.fullName.trim(),
        phone_e164: input.phoneE164,
        phone_country: input.phoneCountry,
        account_status: 'pending_verification',
      });
  }

  return data;
}

/** Verify 6-digit email OTP from the registration / email template. */
export async function verifyEmailOtp(
  email: string,
  token: string,
  type: 'signup' | 'email' | 'email_change' = 'signup',
) {
  const { data, error } = await client().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type,
  });
  if (error) throw new Error(error.message);

  if (data.user) {
    await client()
      .from('profiles')
      .update({
        email_verified_at: new Date().toISOString(),
        account_status: 'active',
      })
      .eq('id', data.user.id);
    await logEvent(data.user.id, 'otp_verified', 'email');
  }
  return data;
}

/** Resend email verification OTP (rate-limited). */
export async function resendEmailOtp(email: string) {
  const normalized = email.trim().toLowerCase();
  await checkOtpRate(normalized, 'email');
  const { error } = await client().auth.resend({
    type: 'signup',
    email: normalized,
  });
  if (error) {
    const { error: otpErr } = await client().auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false },
    });
    if (otpErr) throw new Error(otpErr.message);
  }
}

/**
 * Login with email + password, or phone (E.164) + password.
 * Phone path resolves email server-side; failures use a generic credentials error.
 */
export async function signInWithPassword(identifier: string, password: string) {
  const raw = identifier.trim();
  let email = raw.toLowerCase();

  if (!raw.includes('@')) {
    const phone = raw;
    const { data, error } = await client().rpc('auth_email_for_phone', { p_phone: phone });
    if (error) throw new Error(error.message);
    email = (data as string | null) || '__no_account__@invalid.local';
  }

  const { data, error } = await client().auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw new Error('Invalid email/phone or password');
  }
  if (data.user) await logEvent(data.user.id, 'login', raw.includes('@') ? 'email' : 'phone');
  return data;
}

export async function updatePassword(newPassword: string) {
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters');
  const { error } = await client().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/** Password reset — email channel only (never SMS / phone). */
export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    throw new Error('Enter the email address for your account. Password reset is not sent to phone numbers.');
  }
  await checkOtpRate(normalized, 'email');
  const redirectTo = `${window.location.origin}/settings`;
  const { error } = await client().auth.resetPasswordForEmail(normalized, { redirectTo });
  if (error) throw new Error(error.message);
}

/** Change email — Supabase sends confirmation to the new address. */
export async function updateEmail(newEmail: string) {
  const email = newEmail.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Enter a valid email');
  await checkOtpRate(email, 'email');
  const { error } = await client().auth.updateUser({ email });
  if (error) throw new Error(error.message);
}

/** Update phone on profile (requires authenticated session; no SMS). */
export async function updatePhoneOnProfile(phoneE164: string, phoneCountry: string) {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await client()
    .from('profiles')
    .update({
      phone_e164: phoneE164,
      phone_country: phoneCountry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (error) throw new Error(error.message);
}

export async function signOut() {
  const uid = (await getUser())?.id;
  const { error } = await client().auth.signOut();
  if (error) throw new Error(error.message);
  if (uid) {
    try {
      await logEvent(uid, 'logout', null);
    } catch {
      /* ignore */
    }
  }
}

async function logEvent(
  userId: string,
  eventType: 'login' | 'logout' | 'password_reset' | 'otp_verified' | 'failed_login',
  channel: string | null,
) {
  try {
    await client().from('auth_login_events').insert({
      user_id: userId,
      event_type: eventType,
      channel,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : null,
    });
  } catch {
    /* non-fatal */
  }
}

export async function listLoginEvents(limit = 20) {
  const { data, error } = await client()
    .from('auth_login_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function onAuthStateChange(cb: (session: Session | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
