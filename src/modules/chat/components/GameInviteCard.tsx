import { Gamepad2 } from 'lucide-react';

interface Props {
  gameId: string;
  status: string;
  inviterLabel?: string;
  isMine: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onOpen?: () => void;
}

const TITLES: Record<string, string> = {
  ludo: 'Ludo',
  chess: 'Chess',
  'tic-tac-toe': 'Tic-Tac-Toe',
};

export function GameInviteCard({
  gameId,
  status,
  inviterLabel,
  isMine,
  onAccept,
  onDecline,
  onOpen,
}: Props) {
  return (
    <div className="chat-game-card">
      <div className="chat-game-card-head">
        <Gamepad2 size={18} />
        <strong>{TITLES[gameId] ?? gameId}</strong>
        <span className="muted">{status}</span>
      </div>
      {inviterLabel && <p className="muted chat-game-meta">From {inviterLabel}</p>}
      <div className="chat-game-actions">
        {!isMine && status === 'invited' && (
          <>
            <button type="button" className="games-btn primary" onClick={onAccept}>
              Accept
            </button>
            <button type="button" className="games-btn" onClick={onDecline}>
              Decline
            </button>
          </>
        )}
        {(status === 'active' || status === 'invited') && onOpen && (
          <button type="button" className="game-btn" onClick={onOpen}>
            Open game
          </button>
        )}
      </div>
    </div>
  );
}
