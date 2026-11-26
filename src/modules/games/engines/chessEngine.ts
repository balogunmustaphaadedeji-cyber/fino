import { Chess, type Square } from 'chess.js';

export type ChessStateJson = {
  fen: string;
  pgn: string;
  turn: 'w' | 'b';
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  gameOver: boolean;
};

export function createChess(): Chess {
  return new Chess();
}

export function chessToJson(game: Chess): ChessStateJson {
  return {
    fen: game.fen(),
    pgn: game.pgn(),
    turn: game.turn(),
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isDraw: game.isDraw(),
    gameOver: game.isGameOver(),
  };
}

export function fromFen(fen: string): Chess {
  return new Chess(fen);
}

export function legalMoves(game: Chess, square: Square): Square[] {
  return game.moves({ square, verbose: true }).map((m) => m.to as Square);
}

export function tryMove(
  game: Chess,
  from: Square,
  to: Square,
  promotion: 'q' | 'r' | 'b' | 'n' = 'q',
): boolean {
  try {
    const result = game.move({ from, to, promotion });
    return Boolean(result);
  } catch {
    return false;
  }
}

/** Very weak random legal move for solo practice */
export function chessRandomMove(game: Chess): { from: Square; to: Square } | null {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;
  const m = moves[Math.floor(Math.random() * moves.length)];
  return { from: m.from as Square, to: m.to as Square };
}
