import { describe, it, expect } from 'vitest';

/** Mirror of extractHashtags used in api/client — pure unit test */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w]{2,50}/g) ?? [];
  return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

describe('extractHashtags', () => {
  it('finds unique lowercased tags', () => {
    expect(extractHashtags('Hello #FINO and #Social #fino')).toEqual(['fino', 'social']);
  });

  it('returns empty for no tags', () => {
    expect(extractHashtags('plain text')).toEqual([]);
  });

  it('ignores short tags under 2 chars after #', () => {
    expect(extractHashtags('#a #ok')).toEqual(['ok']);
  });
});
