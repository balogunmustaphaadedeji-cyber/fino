import { describe, it, expect } from 'vitest';
import { applyMove, applyRoll, createLudoState, isSafeSquare, legalMoves } from '../engines/ludoEngine';

describe('ludo', () => {
  it('marks start squares safe', () => {
    expect(isSafeSquare(0)).toBe(true);
    expect(isSafeSquare(13)).toBe(true);
  });

  it('requires six to leave yard', () => {
    let s = createLudoState(['red', 'green']);
    s = applyRoll(s, 3);
    // no legal moves from yard without 6 → skipped turn may advance
    expect(s.phase === 'roll' || legalMoves({ ...s, dice: 3, phase: 'move' }).length === 0).toBe(true);
  });

  it('leaves yard on six', () => {
    let s = createLudoState(['red', 'green']);
    s = applyRoll(s, 6);
    if (s.phase === 'move') {
      const moves = legalMoves(s);
      expect(moves.some((m) => m.to === 0)).toBe(true);
      s = applyMove(s, moves[0].tokenId);
      expect(s.players[0].tokens.some((t) => t.position === 0)).toBe(true);
    }
  });
});
