import { useCallback, useEffect, useState } from 'react';
import {
  applyTttMove,
  createTttState,
  type TttState,
} from '../engines/ticTacToe';
import {
  completeMatch,
  getMatch,
  submitMatchAction,
  subscribeMatch,
} from '../api/client';
import type { GameMatch } from '../types';

interface Props {
  matchId: string;
  userId: string;
  seat: number; // 0 = X, 1 = O
  onDone?: () => void;
}

export function OnlineTicTacToe({ matchId, userId, seat, onDone }: Props) {
  const mark = seat === 0 ? 'X' : 'O';
  const [state, setState] = useState<TttState>(() => createTttState());
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyRemote = useCallback((m: GameMatch) => {
    const s = m.state?.ttt as TttState | undefined;
    if (s?.board) setState(s);
    setVersion(m.version ?? 0);
  }, []);

  useEffect(() => {
    getMatch(matchId).then((m) => m && applyRemote(m)).catch(() => {});
    return subscribeMatch(matchId, applyRemote);
  }, [matchId, applyRemote]);

  async function play(index: number) {
    if (busy || state.winner || state.isDraw) return;
    if (state.turn !== mark) {
      setError('Not your turn');
      return;
    }
    const next = applyTttMove(state, index);
    if (next === state) return;
    setBusy(true);
    setError(null);
    try {
      const m = await submitMatchAction(matchId, version, {
        type: 'ttt_move',
        index,
        state: { ttt: next },
      });
      applyRemote(m);
      if (next.winner || next.isDraw) {
        const winnerId =
          next.isDraw ? null : next.winner === mark ? userId : null;
        // Winner submission: both may call; RPC is idempotent
        if (next.isDraw || next.winner === mark) {
          await completeMatch(matchId, winnerId, next.isDraw, { ttt: next });
        }
        onDone?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Move failed');
      const m = await getMatch(matchId);
      if (m) applyRemote(m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="game-board-wrap">
      <p className="muted">
        You are {mark}. {state.winner ? `Winner: ${state.winner}` : state.isDraw ? 'Draw' : `Turn: ${state.turn}`}
      </p>
      {error && <p className="games-error">{error}</p>}
      <div className="ttt-grid">
        {state.board.map((cell, i) => (
          <button
            key={i}
            type="button"
            className="ttt-cell"
            disabled={Boolean(cell) || Boolean(state.winner) || state.isDraw || state.turn !== mark || busy}
            onClick={() => play(i)}
          >
            {cell}
          </button>
        ))}
      </div>
    </div>
  );
}
