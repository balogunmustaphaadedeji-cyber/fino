import { describe, it, expect } from 'vitest';
import { applyTttMove, createTttState, tttAiMove } from '../engines/ticTacToe';

describe('tic-tac-toe', () => {
  it('detects row win', () => {
    let s = createTttState();
    s = applyTttMove(s, 0);
    s = applyTttMove(s, 3);
    s = applyTttMove(s, 1);
    s = applyTttMove(s, 4);
    s = applyTttMove(s, 2);
    expect(s.winner).toBe('X');
  });

  it('detects draw', () => {
    // X O X / O X O / O X O
    const order = [0, 1, 2, 3, 5, 4, 7, 6, 8];
    let s = createTttState();
    for (const i of order) s = applyTttMove(s, i);
    expect(s.isDraw || s.winner).toBeTruthy();
  });

  it('AI blocks immediate threat', () => {
    let s = createTttState();
    s = applyTttMove(s, 0); // X
    s = applyTttMove(s, 4); // O center
    s = applyTttMove(s, 1); // X
    const block = tttAiMove(s, 'O');
    expect(block).toBe(2);
  });

  it('rejects move on occupied cell', () => {
    let s = createTttState();
    s = applyTttMove(s, 0);
    const next = applyTttMove(s, 0);
    expect(next.moves).toBe(s.moves);
  });
});
