/**
 * Simplified 2–4 player Ludo.
 * Path length 52 main track + 5 home path per colour.
 * Safe squares: starts and every 13th index from each start.
 */

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface LudoToken {
  id: number; // 0-3
  position: number; // -1 yard, 0-51 main, 100-104 home path, 200 finished
}

export interface LudoPlayer {
  color: LudoColor;
  tokens: LudoToken[];
  isCpu?: boolean;
  userId?: string | null;
}

export interface LudoState {
  players: LudoPlayer[];
  currentIndex: number;
  dice: number | null;
  consecutiveSixes: number;
  winnerColor: LudoColor | null;
  phase: 'roll' | 'move' | 'done';
}

const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
const HOME_ENTRY: Record<LudoColor, number> = { red: 50, green: 11, yellow: 24, blue: 37 };

export function createLudoState(colors: LudoColor[], cpuMask: boolean[] = []): LudoState {
  return {
    players: colors.map((color, i) => ({
      color,
      isCpu: cpuMask[i] ?? false,
      tokens: [0, 1, 2, 3].map((id) => ({ id, position: -1 })),
    })),
    currentIndex: 0,
    dice: null,
    consecutiveSixes: 0,
    winnerColor: null,
    phase: 'roll',
  };
}

export function isSafeSquare(pos: number): boolean {
  if (pos < 0 || pos >= 52) return true;
  return pos % 13 === 0;
}

function mainIndex(color: LudoColor, stepsFromStart: number): number {
  return (START[color] + stepsFromStart) % 52;
}

/** Absolute main-track index for a token, or null if in yard/home/finished */
export function tokenMainPos(color: LudoColor, position: number): number | null {
  if (position < 0 || position >= 100) return null;
  return position;
}

export function rollDice(): number {
  return 1 + Math.floor(Math.random() * 6);
}

export function applyRoll(state: LudoState, value: number): LudoState {
  if (state.phase !== 'roll' || state.winnerColor) return state;
  const consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;
  if (consecutiveSixes >= 3) {
    // Bust: lose turn
    return nextTurn({ ...state, dice: value, consecutiveSixes: 0, phase: 'roll' });
  }
  const moves = legalMoves({ ...state, dice: value, consecutiveSixes });
  if (moves.length === 0) {
    return nextTurn({ ...state, dice: value, consecutiveSixes, phase: 'roll' });
  }
  return { ...state, dice: value, consecutiveSixes, phase: 'move' };
}

export interface LegalMove {
  tokenId: number;
  to: number;
}

export function legalMoves(state: LudoState): LegalMove[] {
  const dice = state.dice;
  if (!dice) return [];
  const player = state.players[state.currentIndex];
  const moves: LegalMove[] = [];
  for (const token of player.tokens) {
    if (token.position === 200) continue;
    if (token.position === -1) {
      if (dice === 6) moves.push({ tokenId: token.id, to: START[player.color] });
      continue;
    }
    if (token.position >= 100 && token.position < 200) {
      const homePos = token.position - 100;
      const next = homePos + dice;
      if (next === 5) moves.push({ tokenId: token.id, to: 200 });
      else if (next < 5) moves.push({ tokenId: token.id, to: 100 + next });
      continue;
    }
    // On main track — check home entry
    const from = token.position;
    const entry = HOME_ENTRY[player.color];
    let stepsToEntry = (entry - from + 52) % 52;
    if (from === entry) stepsToEntry = 0;
    if (dice > stepsToEntry) {
      const intoHome = dice - stepsToEntry - 1;
      if (intoHome === 5) moves.push({ tokenId: token.id, to: 200 });
      else if (intoHome < 5 && intoHome >= 0) moves.push({ tokenId: token.id, to: 100 + intoHome });
    } else {
      const to = (from + dice) % 52;
      moves.push({ tokenId: token.id, to });
    }
  }
  return moves;
}

export function applyMove(state: LudoState, tokenId: number): LudoState {
  if (state.phase !== 'move' || state.dice == null) return state;
  const moves = legalMoves(state);
  const chosen = moves.find((m) => m.tokenId === tokenId);
  if (!chosen) return state;

  const players = state.players.map((p) => ({
    ...p,
    tokens: p.tokens.map((t) => ({ ...t })),
  }));
  const player = players[state.currentIndex];
  const token = player.tokens.find((t) => t.id === tokenId)!;
  token.position = chosen.to;

  // Capture
  if (chosen.to >= 0 && chosen.to < 52 && !isSafeSquare(chosen.to)) {
    for (let pi = 0; pi < players.length; pi++) {
      if (pi === state.currentIndex) continue;
      for (const t of players[pi].tokens) {
        if (t.position === chosen.to) t.position = -1;
      }
    }
  }

  const allHome = player.tokens.every((t) => t.position === 200);
  if (allHome) {
    return { ...state, players, winnerColor: player.color, phase: 'done', dice: null };
  }

  const rolledSix = state.dice === 6;
  if (rolledSix) {
    return { ...state, players, dice: null, phase: 'roll' };
  }
  return nextTurn({ ...state, players, dice: null });
}

function nextTurn(state: LudoState): LudoState {
  const next = (state.currentIndex + 1) % state.players.length;
  return { ...state, currentIndex: next, dice: null, consecutiveSixes: 0, phase: 'roll' };
}

export function cpuPlay(state: LudoState): LudoState {
  let s = state;
  if (s.phase === 'roll') {
    s = applyRoll(s, rollDice());
  }
  if (s.phase === 'move') {
    const moves = legalMoves(s);
    if (moves.length) {
      // Prefer captures / home
      const preferred = moves.find((m) => m.to === 200) ?? moves[moves.length - 1];
      s = applyMove(s, preferred.tokenId);
    }
  }
  return s;
}
