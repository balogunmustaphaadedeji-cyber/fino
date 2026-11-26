import { NavLink } from 'react-router-dom';
import { BookOpen, Gamepad2, MessageCircle, Settings, Users, Store } from 'lucide-react';
import { hasSupabaseConfig } from '../../lib/env';
import type { ReactNode } from 'react';

const navItems = [
  { to: '/social', label: 'Social', icon: Users },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/learn', label: 'Learn', icon: BookOpen },
  { to: '/market', label: 'Market', icon: Store },
];

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <NavLink to="/social" className="brand" aria-label="FINO home">
          <span className="brand-mark">F</span>
          <span>FINO</span>
        </NavLink>
        <div className="topbar-right">
          <span className={`connection-dot ${hasSupabaseConfig ? 'connected' : ''}`} />
          <span className="connection-label">{hasSupabaseConfig ? 'Backend configured' : 'Setup required'}</span>
          <NavLink to="/settings" className="icon-button" aria-label="Settings"><Settings size={19} /></NavLink>
        </div>
      </header>

      <main className="main-content">{children}</main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Icon size={21} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Settings size={21} />
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
