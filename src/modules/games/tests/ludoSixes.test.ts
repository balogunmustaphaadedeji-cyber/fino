import { describe, it, expect } from 'vitest';
import { applyRoll, createLudoState } from '../engines/ludoEngine';

describe('ludo three sixes', () => {
  it('busts turn after third consecutive six', () => {
    let s = createLudoState(['red', 'green', 'yellow', 'blue']);
    s = { ...s, consecutiveSixes: 2, phase: 'roll' };
    s = applyRoll(s, 6);
    // After third six, turn should advance (phase roll, different index or reset sixes)
    expect(s.consecutiveSixes).toBe(0);
    expect(s.currentIndex).not.toBe(0);
  });
});
