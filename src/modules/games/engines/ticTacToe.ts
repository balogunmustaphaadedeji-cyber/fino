export type Cell = 'X' | 'O' | null;
export type Board = [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell];

export interface TttState {
  board: Board;
  turn: 'X' | 'O';
  winner: 'X' | 'O' | null;
  isDraw: boolean;
  moves: number;
}

export function createTttState(): TttState {
  return {
    board: [null, null, null, null, null, null, null, null, null],
    turn: 'X',
    winner: null,
    isDraw: false,
    moves: 0,
  };
}

const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function checkWinner(board: Board): 'X' | 'O' | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

export function applyTttMove(state: TttState, index: number): TttState {
  if (state.winner || state.isDraw || index < 0 || index > 8 || state.board[index]) {
    return state;
  }
  const board = [...state.board] as Board;
  board[index] = state.turn;
  const winner = checkWinner(board);
  const moves = state.moves + 1;
  const isDraw = !winner && moves >= 9;
  return {
    board,
    turn: state.turn === 'X' ? 'O' : 'X',
    winner,
    isDraw,
    moves,
  };
}

/** Simple AI: win > block > center > corner > side */
export function tttAiMove(state: TttState, ai: 'X' | 'O' = 'O'): number {
  const board = state.board;
  const opp: 'X' | 'O' = ai === 'X' ? 'O' : 'X';
  for (const mark of [ai, opp]) {
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      const trial = [...board] as Board;
      trial[i] = mark;
      if (checkWinner(trial) === mark) return i;
    }
  }
  if (!board[4]) return 4;
  for (const i of [0, 2, 6, 8, 1, 3, 5, 7]) {
    if (!board[i]) return i;
  }
  return -1;
}
