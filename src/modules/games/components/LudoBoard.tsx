import { useState } from 'react';
import {
  applyMove,
  applyRoll,
  cpuPlay,
  createLudoState,
  legalMoves,
  rollDice,
  type LudoColor,
  type LudoState,
} from '../engines/ludoEngine';

interface Props {
  vsCpu?: boolean;
  onGameEnd?: (winner: LudoColor) => void;
}

const COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

export function LudoBoard({ vsCpu = true, onGameEnd }: Props) {
  const [state, setState] = useState<LudoState>(() =>
    createLudoState(COLORS, vsCpu ? [false, true, true, true] : [false, false, false, false]),
  );

  function afterHuman(next: LudoState) {
    setState(next);
    if (next.winnerColor) {
      onGameEnd?.(next.winnerColor);
      return;
    }
    if (vsCpu && next.players[next.currentIndex]?.isCpu) {
      window.setTimeout(() => {
        setState((s) => {
          let cur = s;
          // CPU may get extra turns on six
          for (let i = 0; i < 3; i++) {
            if (!cur.players[cur.currentIndex]?.isCpu || cur.winnerColor) break;
            cur = cpuPlay(cur);
            if (cur.winnerColor) {
              onGameEnd?.(cur.winnerColor);
              break;
            }
            if (cur.phase === 'roll' && !cur.players[cur.currentIndex]?.isCpu) break;
          }
          return cur;
        });
      }, 500);
    }
  }

  function onRoll() {
    if (state.phase !== 'roll' || state.players[state.currentIndex]?.isCpu) return;
    afterHuman(applyRoll(state, rollDice()));
  }

  function onToken(tokenId: number) {
    if (state.phase !== 'move' || state.players[state.currentIndex]?.isCpu) return;
    afterHuman(applyMove(state, tokenId));
  }

  const player = state.players[state.currentIndex];
  const moves = state.phase === 'move' ? legalMoves(state) : [];

  return (
    <div className="game-board-wrap">
      <p className="muted">
        {state.winnerColor
          ? `Winner: ${state.winnerColor}`
          : `${player?.color}'s turn — ${state.phase}${state.dice ? ` (rolled ${state.dice})` : ''}`}
      </p>
      <div className="ludo-players">
        {state.players.map((p) => (
          <div key={p.color} className={`ludo-player-card ${p.color}`}>
            <strong>{p.color}{p.isCpu ? ' (CPU)' : ''}</strong>
            <div className="ludo-tokens">
              {p.tokens.map((t) => {
                const canMove =
                  p === player && moves.some((m) => m.tokenId === t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`ludo-token ${canMove ? 'movable' : ''}`}
                    disabled={!canMove}
                    onClick={() => onToken(t.id)}
                  >
                    {t.position === -1
                      ? 'Yard'
                      : t.position === 200
                        ? 'Home'
                        : t.position >= 100
                          ? `H${t.position - 100}`
                          : t.position}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="ludo-actions">
        <button
          type="button"
          className="games-btn primary"
          onClick={onRoll}
          disabled={state.phase !== 'roll' || Boolean(player?.isCpu) || Boolean(state.winnerColor)}
        >
          Roll dice
        </button>
        <button
          type="button"
          className="games-btn"
          onClick={() => setState(createLudoState(COLORS, vsCpu ? [false, true, true, true] : [false, false, false, false]))}
        >
          New game
        </button>
      </div>
    </div>
  );
}
