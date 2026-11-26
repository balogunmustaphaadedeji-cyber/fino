import { useCallback, useMemo, useState } from 'react';
import type { Square } from 'chess.js';
import {
  chessRandomMove,
  chessToJson,
  createChess,
  legalMoves,
  tryMove,
} from '../engines/chessEngine';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

const PIECES: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

interface Props {
  vsCpu?: boolean;
  onGameEnd?: (result: 'white' | 'black' | 'draw') => void;
}

export function ChessBoard({ vsCpu = true, onGameEnd }: Props) {
  const [game, setGame] = useState(() => createChess());
  const [selected, setSelected] = useState<Square | null>(null);
  const meta = useMemo(() => chessToJson(game), [game]);
  const highlights = selected ? legalMoves(game, selected) : [];

  const endIfNeeded = useCallback(
    (g: ReturnType<typeof createChess>) => {
      const j = chessToJson(g);
      if (j.isCheckmate) onGameEnd?.(j.turn === 'w' ? 'black' : 'white');
      else if (j.isDraw || j.isStalemate) onGameEnd?.('draw');
    },
    [onGameEnd],
  );

  function onSquare(sq: Square) {
    if (meta.gameOver) return;
    if (vsCpu && meta.turn === 'b') return;
    if (selected) {
      const g = createChess();
      g.load(game.fen());
      if (tryMove(g, selected, sq)) {
        setGame(g);
        setSelected(null);
        endIfNeeded(g);
        if (vsCpu && !chessToJson(g).gameOver && g.turn() === 'b') {
          window.setTimeout(() => {
            const ai = createChess();
            ai.load(g.fen());
            const mv = chessRandomMove(ai);
            if (mv) {
              tryMove(ai, mv.from, mv.to);
              setGame(ai);
              endIfNeeded(ai);
            }
          }, 400);
        }
        return;
      }
    }
    const piece = game.get(sq);
    if (piece && piece.color === game.turn()) setSelected(sq);
    else setSelected(null);
  }

  return (
    <div className="game-board-wrap">
      <p className="muted">
        {meta.isCheckmate
          ? 'Checkmate'
          : meta.isStalemate
            ? 'Stalemate'
            : meta.isDraw
              ? 'Draw'
              : `${meta.turn === 'w' ? 'White' : 'Black'}${meta.isCheck ? ' — check' : ''}`}
      </p>
      <div className="chess-grid">
        {RANKS.map((rank) =>
          FILES.map((file) => {
            const sq = `${file}${rank}` as Square;
            const dark = (FILES.indexOf(file) + rank) % 2 === 0;
            const piece = game.get(sq);
            const key = piece ? `${piece.color}${piece.type.toUpperCase()}` : '';
            const active = selected === sq || highlights.includes(sq);
            return (
              <button
                key={sq}
                type="button"
                className={`chess-sq ${dark ? 'dark' : 'light'}${active ? ' active' : ''}`}
                onClick={() => onSquare(sq)}
              >
                {key ? PIECES[key] : ''}
              </button>
            );
          }),
        )}
      </div>
      <button
        type="button"
        className="games-btn"
        onClick={() => {
          setGame(createChess());
          setSelected(null);
        }}
      >
        New game
      </button>
    </div>
  );
}
