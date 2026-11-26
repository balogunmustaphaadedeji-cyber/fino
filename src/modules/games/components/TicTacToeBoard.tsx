import { useEffect, useState } from 'react';
import {
  applyTttMove,
  createTttState,
  tttAiMove,
  type TttState,
} from '../engines/ticTacToe';

interface Props {
  vsCpu?: boolean;
  onGameEnd?: (result: 'X' | 'O' | 'draw') => void;
}

export function TicTacToeBoard({ vsCpu = true, onGameEnd }: Props) {
  const [state, setState] = useState<TttState>(() => createTttState());

  useEffect(() => {
    if (!vsCpu || state.winner || state.isDraw || state.turn !== 'O') return;
    const t = window.setTimeout(() => {
      const idx = tttAiMove(state, 'O');
      if (idx >= 0) setState((s) => applyTttMove(s, idx));
    }, 350);
    return () => window.clearTimeout(t);
  }, [state, vsCpu]);

  useEffect(() => {
    if (state.winner) onGameEnd?.(state.winner);
    else if (state.isDraw) onGameEnd?.('draw');
  }, [state.winner, state.isDraw, onGameEnd]);

  function click(i: number) {
    if (vsCpu && state.turn !== 'X') return;
    setState((s) => applyTttMove(s, i));
  }

  function reset() {
    setState(createTttState());
  }

  return (
    <div className="games-board-wrap">
      <p className="muted">
        {state.winner
          ? `Winner: ${state.winner}`
          : state.isDraw
            ? 'Draw'
            : `Turn: ${state.turn}${vsCpu && state.turn === 'O' ? ' (CPU)' : ''}`}
      </p>
      <div className="ttt-grid" role="grid" aria-label="Tic-Tac-Toe board">
        {state.board.map((cell, i) => (
          <button
            key={i}
            type="button"
            className="ttt-cell"
            onClick={() => click(i)}
            disabled={Boolean(cell) || Boolean(state.winner) || state.isDraw}
            aria-label={`Cell ${i + 1}`}
          >
            {cell}
          </button>
        ))}
      </div>
      <button type="button" className="games-btn" onClick={reset}>
        New game
      </button>
    </div>
  );
}
