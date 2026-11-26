import { useCallback, useEffect, useState } from 'react';
import {
  Globe2,
  Moon,
  ShieldCheck,
  Bell,
  Accessibility,
  CircleHelp,
  UserRound,
  LogOut,
  KeyRound,
  Smartphone,
  Mail,
  Store,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import AuthPage from '../auth/AuthPage';
import {
  signOut,
  updatePassword,
  updateEmail,
  requestPasswordReset,
  listLoginEvents,
} from '../auth/authApi';
import { supabase } from '../../lib/supabase';
import { COUNTRIES } from '../auth/countries';

type Prefs = {
  theme?: string;
  locale?: string;
  time_zone?: string | null;
  currency?: string;
  country_code?: string | null;
  privacy?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  accessibility?: Record<string, unknown>;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  phone_e164: string | null;
  phone_verified_at: string | null;
  email_verified_at: string | null;
  account_status: string;
};

type Section =
  | 'home'
  | 'account'
  | 'security'
  | 'privacy'
  | 'notifications'
  | 'preferences'
  | 'help'
  | 'auth';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, loading: authLoading, configured } = useAuth();
  const [section, setSection] = useState<Section>('home');
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<{ event_type: string; channel: string | null; created_at: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setError(null);
    try {
      const [{ data: p }, { data: pr }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      ]);
      if (p) {
        setProfile(p as Profile);
        setDisplayName(p.display_name ?? '');
        setUsername(p.username ?? '');
      }
      if (pr) setPrefs(pr as Prefs);
      try {
        setEvents((await listLoginEvents(15)) as typeof events);
      } catch {
        setEvents([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load settings');
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    if (!supabase || !user) return;
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: displayName, username: username || null })
      .eq('id', user.id);
    if (err) setError(err.message);
    else {
      setInfo('Profile updated');
      await load();
    }
  }

  async function savePrefs(patch: Partial<Prefs>) {
    if (!supabase || !user) return;
    const { error: err } = await supabase.from('user_preferences').upsert({
      user_id: user.id,
      theme: (patch.theme as string) ?? prefs?.theme ?? theme,
      locale: patch.locale ?? prefs?.locale ?? 'en',
      time_zone: patch.time_zone ?? prefs?.time_zone,
      currency: patch.currency ?? prefs?.currency ?? 'USD',
      country_code: patch.country_code ?? prefs?.country_code,
      privacy: patch.privacy ?? prefs?.privacy,
      notifications: patch.notifications ?? prefs?.notifications,
      accessibility: patch.accessibility ?? prefs?.accessibility,
      updated_at: new Date().toISOString(),
    });
    if (err) setError(err.message);
    else {
      setPrefs({ ...prefs, ...patch });
      setInfo('Preferences saved');
      if (patch.theme === 'light' || patch.theme === 'dark' || patch.theme === 'system') {
        setTheme(patch.theme);
      }
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      setSection('auth');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign out failed');
    }
  }

  if (authLoading) {
    return (
      <section className="page-stack">
        <p className="muted">Loading account…</p>
      </section>
    );
  }

  if (!user || section === 'auth') {
    return (
      <section className="page-stack">
        <AuthPage
          onSuccess={() => {
            setSection('home');
            void load();
          }}
        />
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <p className="eyebrow">YOUR FINO</p>
        <h1>Settings</h1>
        <p className="muted">Account, security, privacy and preferences for every pillar.</p>
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

      {section === 'home' && (
        <>
          <div className="settings-card">
            <button type="button" className="settings-row settings-btn" onClick={() => setSection('account')}>
              <div className="settings-icon"><UserRound size={19} /></div>
              <div className="settings-copy"><strong>Account</strong><span>Profile, phone, email, verification</span></div>
            </button>
            <button type="button" className="settings-row settings-btn" onClick={() => setSection('security')}>
              <div className="settings-icon"><ShieldCheck size={19} /></div>
              <div className="settings-copy"><strong>Security</strong><span>Password, sessions, login history</span></div>
            </button>
            <button type="button" className="settings-row settings-btn" onClick={() => setSection('privacy')}>
              <div className="settings-icon"><KeyRound size={19} /></div>
              <div className="settings-copy"><strong>Privacy</strong><span>Visibility and contact preferences</span></div>
            </button>
            <button type="button" className="settings-row settings-btn" onClick={() => setSection('notifications')}>
              <div className="settings-icon"><Bell size={19} /></div>
              <div className="settings-copy"><strong>Notifications</strong><span>Push, email, SMS, orders</span></div>
            </button>
            <button type="button" className="settings-row settings-btn" onClick={() => setSection('preferences')}>
              <div className="settings-icon"><Globe2 size={19} /></div>
              <div className="settings-copy"><strong>Preferences</strong><span>Theme, language, currency, accessibility</span></div>
            </button>
            <button type="button" className="settings-row settings-btn" onClick={() => setSection('help')}>
              <div className="settings-icon"><CircleHelp size={19} /></div>
              <div className="settings-copy"><strong>Help & support</strong><span>Help, terms, privacy, about</span></div>
            </button>
          </div>
          <div className="settings-card" style={{ marginTop: 14 }}>
            <div className="settings-row">
              <div className="settings-icon"><Store size={19} /></div>
              <div className="settings-copy"><strong>Marketplace roles</strong><span>One account can buy and sell</span></div>
            </div>
            <button type="button" className="settings-row settings-btn" onClick={() => void handleSignOut()}>
              <div className="settings-icon"><LogOut size={19} /></div>
              <div className="settings-copy"><strong>Log out</strong><span>End this session</span></div>
            </button>
          </div>
        </>
      )}

      {section === 'account' && (
        <div className="settings-card settings-panel">
          <button type="button" className="linkish" onClick={() => setSection('home')}>← Back</button>
          <h2>Account</h2>
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
          <button type="button" className="auth-primary" onClick={() => void saveProfile()}>Save profile</button>
          <div className="settings-row" style={{ marginTop: 16 }}>
            <div className="settings-icon"><Smartphone size={19} /></div>
            <div className="settings-copy">
              <strong>Phone</strong>
              <span>{profile?.phone_e164 ?? 'Not set'} · {profile?.phone_verified_at ? 'Verified' : 'Not verified'}</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-icon"><Mail size={19} /></div>
            <div className="settings-copy">
              <strong>Email</strong>
              <span>{user.email ?? 'Not set'} · {profile?.email_verified_at || user.email_confirmed_at ? 'Verified' : 'Not verified'}</span>
            </div>
          </div>
          <label>Change email</label>
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <button type="button" className="auth-primary" onClick={() => void updateEmail(newEmail).then(() => setInfo('Confirm via the email Supabase sends.')).catch((e: Error) => setError(e.message))}>Update email</button>
          <p className="muted tiny">Status: {profile?.account_status ?? '—'}. Email is the only verification channel; phone is for login identity. Deletion RPC planned later.</p>
        </div>
      )}

      {section === 'security' && (
        <div className="settings-card settings-panel">
          <button type="button" className="linkish" onClick={() => setSection('home')}>← Back</button>
          <h2>Security</h2>
          <label>New password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          <button type="button" className="auth-primary" onClick={() => void updatePassword(newPassword).then(() => { setInfo('Password updated'); setNewPassword(''); }).catch((e: Error) => setError(e.message))}>Change password</button>
          <button type="button" className="linkish" onClick={() => void requestPasswordReset(user.email || '').then(() => setInfo('Reset email sent if registered.')).catch((e: Error) => setError(e.message))}>Send password reset email</button>
          <h3>Recent security events</h3>
          {events.length === 0 && <p className="muted">No events yet.</p>}
          <ul className="settings-list">
            {events.map((ev, i) => (
              <li key={i}>{ev.event_type}{ev.channel ? ` · ${ev.channel}` : ''} · {new Date(ev.created_at).toLocaleString()}</li>
            ))}
          </ul>
          <p className="muted tiny">MFA and full device session lists require Supabase Auth MFA configuration on the project.</p>
        </div>
      )}

      {section === 'privacy' && (
        <div className="settings-card settings-panel">
          <button type="button" className="linkish" onClick={() => setSection('home')}>← Back</button>
          <h2>Privacy</h2>
          <label>Profile visibility</label>
          <select value={String((prefs?.privacy as { profile_visibility?: string })?.profile_visibility ?? 'public')} onChange={(e) => void savePrefs({ privacy: { ...(prefs?.privacy as object), profile_visibility: e.target.value } })}>
            <option value="public">Public</option>
            <option value="followers">Followers only</option>
            <option value="private">Private</option>
          </select>
          <label>Who can contact you</label>
          <select value={String((prefs?.privacy as { who_can_contact?: string })?.who_can_contact ?? 'everyone')} onChange={(e) => void savePrefs({ privacy: { ...(prefs?.privacy as object), who_can_contact: e.target.value } })}>
            <option value="everyone">Everyone</option>
            <option value="followers">Followers</option>
            <option value="nobody">Nobody</option>
          </select>
          <label>
            <input type="checkbox" checked={Boolean((prefs?.privacy as { show_activity?: boolean })?.show_activity ?? true)} onChange={(e) => void savePrefs({ privacy: { ...(prefs?.privacy as object), show_activity: e.target.checked } })} /> Show activity status
          </label>
          <p className="muted tiny">Blocked users are managed in Social.</p>
        </div>
      )}

      {section === 'notifications' && (
        <div className="settings-card settings-panel">
          <button type="button" className="linkish" onClick={() => setSection('home')}>← Back</button>
          <h2>Notifications</h2>
          {([['push', 'Push'], ['email', 'Email'], ['sms', 'SMS'], ['orders', 'Order updates'], ['messages', 'Messages'], ['promotions', 'Promotional']] as const).map(([key, label]) => (
            <label key={key}>
              <input type="checkbox" checked={Boolean((prefs?.notifications as Record<string, boolean>)?.[key] ?? key !== 'promotions')} onChange={(e) => void savePrefs({ notifications: { ...(prefs?.notifications as object), [key]: e.target.checked } })} /> {label}
            </label>
          ))}
        </div>
      )}

      {section === 'preferences' && (
        <div className="settings-card settings-panel">
          <button type="button" className="linkish" onClick={() => setSection('home')}>← Back</button>
          <h2>Preferences</h2>
          <div className="settings-row">
            <div className="settings-icon"><Moon size={19} /></div>
            <div className="settings-copy"><strong>Appearance</strong><span>Light, dark or system</span></div>
            <select aria-label="Appearance theme" value={theme} onChange={(e) => { const v = e.target.value as 'light' | 'dark' | 'system'; setTheme(v); void savePrefs({ theme: v }); }}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <label>Language</label>
          <select value={prefs?.locale ?? 'en'} onChange={(e) => void savePrefs({ locale: e.target.value })}>
            <option value="en">English</option>
          </select>
          <label>Country</label>
          <select value={prefs?.country_code ?? ''} onChange={(e) => void savePrefs({ country_code: e.target.value || null })}>
            <option value="">Not set</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
          <label>Currency</label>
          <select value={prefs?.currency ?? 'USD'} onChange={(e) => void savePrefs({ currency: e.target.value })}>
            {['USD', 'NGN', 'GHS', 'KES', 'ZAR', 'EUR', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label>Time zone</label>
          <input value={prefs?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={(e) => void savePrefs({ time_zone: e.target.value })} />
          <h3><Accessibility size={16} style={{ verticalAlign: 'middle' }} /> Accessibility</h3>
          {([['reduced_motion', 'Reduced motion'], ['large_text', 'Larger text'], ['high_contrast', 'High contrast']] as const).map(([key, label]) => (
            <label key={key}>
              <input type="checkbox" checked={Boolean((prefs?.accessibility as Record<string, boolean>)?.[key])} onChange={(e) => void savePrefs({ accessibility: { ...(prefs?.accessibility as object), [key]: e.target.checked } })} /> {label}
            </label>
          ))}
        </div>
      )}

      {section === 'help' && (
        <div className="settings-card settings-panel">
          <button type="button" className="linkish" onClick={() => setSection('home')}>← Back</button>
          <h2>Help & support</h2>
          <p><strong>Help centre</strong> — Publish docs when ready.</p>
          <p><strong>Contact support</strong> — Configure a real support address before launch.</p>
          <p><strong>Terms</strong> · <strong>Privacy policy</strong> — Link legal pages before public launch.</p>
          <p className="muted">FINO · Marketplace Stage 1 foundation.</p>
          <p className="muted tiny">Backend configured: {configured ? 'yes' : 'no'}</p>
        </div>
      )}
    </section>
  );
}
