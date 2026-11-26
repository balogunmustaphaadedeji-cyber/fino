import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './shared/layout/AppShell';
import SocialPage from './modules/social/SocialPage';
import GamesPage from './modules/games/GamesPage';
import ChatPage from './modules/chat/ChatPage';
import LearnPage from './modules/learn/LearnPage';
import MarketplacePage from './modules/marketplace/MarketplacePage';
import SettingsPage from './shared/settings/SettingsPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/social" replace />} />
        <Route path="/social" element={<SocialPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/market" element={<MarketplacePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/social" replace />} />
      </Routes>
    </AppShell>
  );
}
