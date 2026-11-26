import { useEffect, useMemo, useState } from 'react';
import { COUNTRIES, formatE164, searchCountries, type CountryDial } from './countries';
import {
  registerWithEmail,
  verifyEmailOtp,
  resendEmailOtp,
  signInWithPassword,
  requestPasswordReset,
} from './authApi';
import { hasSupabaseConfig } from '../../lib/env';
import './auth.css';

type Mode = 'register' | 'login' | 'reset';
type Step = 'form' | 'otp' | 'done';

const RESEND_SECONDS = 60;

export default function AuthPage({ onSuccess }: { onSuccess?: () => void }) {
  const [mode, setMode] = useState<Mode>('register');
  const [step, setStep] = useState<Step>('form');
  const [country, setCountry] = useState<CountryDial>(COUNTRIES[0]);
  const [countryQ, setCountryQ] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [fullName, setFullName] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loginId, setLoginId] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const filtered = useMemo(() => searchCountries(countryQ), [countryQ]);
  const phoneE164 = useMemo(() => formatE164(country.dial, national), [country.dial, national]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  function switchMode(next: Mode) {
    setMode(next);
    setStep('form');
    setError(null);
    setInfo(null);
    setOtp('');
  }

  if (!hasSupabaseConfig) {
    return (
      <section className="auth-page">
        <h1>Sign in</h1>
        <p className="muted">
          Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>,
          enable Email auth, and configure real email delivery. Verification codes are never simulated. SMS OTP is
          not used.
        </p>
      </section>
    );
  }

  async function handleRegister() {
    setError(null);
    setInfo(null);
    if (password !== password2) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await registerWithEmail({
        fullName,
        email,
        password,
        phoneE164,
        phoneCountry: country.code,
      });
      setStep('otp');
      setCountdown(RESEND_SECONDS);
      setInfo(`We sent a 6-digit verification code to ${email.trim().toLowerCase()}. Check your inbox (and spam).`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setBusy(true);
    try {
      if (!/^\d{6}$/.test(otp.trim())) throw new Error('Enter the 6-digit code from your email');
      try {
        await verifyEmailOtp(email, otp, 'signup');
      } catch {
        // Some projects deliver OTP as type "email"
        await verifyEmailOtp(email, otp, 'email');
      }
      setStep('done');
      setInfo('Email verified. Your account is active.');
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid or expired code');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError(null);
    setBusy(true);
    try {
      await resendEmailOtp(email);
      setCountdown(RESEND_SECONDS);
      setInfo('A new code was sent to your email.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not resend code');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPassword(loginId, password);
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setInfo('If an account exists for that email, a reset link was sent. Password reset is never sent to phone numbers.');
    } catch (e: unknown) {
      if (e instanceof Error && e.message.toLowerCase().includes('too many')) {
        setError(e.message);
      } else if (e instanceof Error && e.message.includes('phone')) {
        setError(e.message);
      } else {
        setInfo('If an account exists for that email, a reset link was sent. Password reset is never sent to phone numbers.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page">
      <p className="eyebrow">ACCOUNT</p>
      <h1>Welcome to FINO</h1>
      <p className="muted">One account for Social, Games, Chat, Learn and Marketplace. Email verification only.</p>

      <div className="auth-tabs">
        {(
          [
            ['register', 'Register'],
            ['login', 'Log in'],
            ['reset', 'Forgot password'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={mode === id ? 'active' : ''} onClick={() => switchMode(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="auth-alert error" role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="auth-alert info" role="status">
          {info}
        </div>
      )}

      {mode === 'register' && step === 'form' && (
        <div className="auth-form">
          <label>Full name</label>
          <input
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
          />

          <label>Country</label>
          <button type="button" className="country-btn" onClick={() => setShowCountries((v) => !v)}>
            <span>
              {country.flag} {country.name}
            </span>
            <span className="muted">{country.dial}</span>
          </button>
          {showCountries && (
            <div className="country-panel">
              <input
                placeholder="Search country or code"
                value={countryQ}
                onChange={(e) => setCountryQ(e.target.value)}
                autoFocus
              />
              <ul>
                {filtered.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => {
                        setCountry(c);
                        setShowCountries(false);
                        setCountryQ('');
                      }}
                    >
                      <span>
                        {c.flag} {c.name}
                      </span>
                      <span>{c.dial}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label>Phone number</label>
          <div className="phone-row">
            <span className="dial-prefix">{country.dial}</span>
            <input
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="8012345678"
              value={national}
              onChange={(e) => setNational(e.target.value)}
            />
          </div>
          <p className="muted tiny">Stored as {phoneE164 || '—'}. Used for login identity — not for SMS codes.</p>

          <label>Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          <label>Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <label>Confirm password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />

          <button type="button" className="auth-primary" disabled={busy} onClick={() => void handleRegister()}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="muted tiny">A 6-digit code will be sent to your email. SMS verification is not used.</p>
        </div>
      )}

      {mode === 'register' && step === 'otp' && (
        <div className="auth-form">
          <label>Email verification code</label>
          <input
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="6 digits"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button type="button" className="auth-primary" disabled={busy} onClick={() => void handleVerifyOtp()}>
            {busy ? 'Verifying…' : 'Verify email'}
          </button>
          <div className="auth-row">
            <button type="button" className="linkish" disabled={countdown > 0 || busy} onClick={() => void handleResend()}>
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setStep('form');
                setOtp('');
              }}
            >
              Change details
            </button>
          </div>
        </div>
      )}

      {mode === 'login' && (
        <div className="auth-form">
          <label>Email or phone</label>
          <input
            autoComplete="username"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="you@example.com or +234…"
          />
          <p className="muted tiny">Phone login uses your registered number with password. No SMS codes.</p>
          <label>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="auth-primary" disabled={busy} onClick={() => void handleLogin()}>
            {busy ? 'Signing in…' : 'Log in'}
          </button>
        </div>
      )}

      {mode === 'reset' && (
        <div className="auth-form">
          <label>Account email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <button type="button" className="auth-primary" disabled={busy} onClick={() => void handleReset()}>
            {busy ? 'Sending…' : 'Send reset email'}
          </button>
          <p className="muted tiny">
            Reset links are sent only to email. We never send password-reset codes to phone numbers.
          </p>
        </div>
      )}

      {step === 'done' && mode === 'register' && (
        <p className="muted">You are signed in. Continue to Settings or Marketplace.</p>
      )}
    </section>
  );
}
