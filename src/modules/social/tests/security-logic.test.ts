import { describe, it, expect } from 'vitest';
import { extractMentions, splitCaptionWithMentions } from '../utils/mentions';

/** Pure mirrors of DB rules used in UI / docs for unit verification */

function canDirectFollow(isPrivate: boolean, hasAcceptedRequest: boolean, isBlocked: boolean, isSelf: boolean): boolean {
  if (isSelf || isBlocked) return false;
  if (isPrivate && !hasAcceptedRequest) return false;
  return true;
}

function commentDepthAllowed(parentDepth: number | null): boolean {
  const depth = parentDepth === null ? 0 : parentDepth + 1;
  return depth <= 2;
}

function storyViewAllowed(expired: boolean, canViewProfile: boolean, isSelf: boolean): boolean {
  if (expired) return false;
  return isSelf || canViewProfile;
}

function canViewPost(opts: {
  isAuthor: boolean;
  blocked: boolean;
  visibility: 'public' | 'followers' | 'private';
  profilePrivate: boolean;
  isFollowing: boolean;
}): boolean {
  if (opts.isAuthor) return true;
  if (opts.blocked) return false;
  if (opts.visibility === 'private') return false;
  if (opts.profilePrivate && !opts.isFollowing) return false;
  if (opts.visibility === 'followers' && !opts.isFollowing) return false;
  return true;
}

describe('private account follow rules', () => {
  it('allows direct follow of public account', () => {
    expect(canDirectFollow(false, false, false, false)).toBe(true);
  });
  it('blocks direct follow of private account without accepted request', () => {
    expect(canDirectFollow(true, false, false, false)).toBe(false);
  });
  it('allows follow of private account after accepted request', () => {
    expect(canDirectFollow(true, true, false, false)).toBe(true);
  });
  it('prevents self-follow', () => {
    expect(canDirectFollow(false, false, false, true)).toBe(false);
  });
  it('prevents follow when blocked', () => {
    expect(canDirectFollow(false, false, true, false)).toBe(false);
  });
});

describe('post visibility', () => {
  it('author always sees own post', () => {
    expect(canViewPost({ isAuthor: true, blocked: false, visibility: 'private', profilePrivate: true, isFollowing: false })).toBe(true);
  });
  it('blocked user cannot see post', () => {
    expect(canViewPost({ isAuthor: false, blocked: true, visibility: 'public', profilePrivate: false, isFollowing: false })).toBe(false);
  });
  it('followers-only requires follow', () => {
    expect(canViewPost({ isAuthor: false, blocked: false, visibility: 'followers', profilePrivate: false, isFollowing: false })).toBe(false);
    expect(canViewPost({ isAuthor: false, blocked: false, visibility: 'followers', profilePrivate: false, isFollowing: true })).toBe(true);
  });
  it('private visibility never public', () => {
    expect(canViewPost({ isAuthor: false, blocked: false, visibility: 'private', profilePrivate: false, isFollowing: true })).toBe(false);
  });
});

describe('comment depth', () => {
  it('allows top-level and up to depth 2', () => {
    expect(commentDepthAllowed(null)).toBe(true);
    expect(commentDepthAllowed(0)).toBe(true);
    expect(commentDepthAllowed(1)).toBe(true);
    expect(commentDepthAllowed(2)).toBe(false);
  });
});

describe('story visibility', () => {
  it('rejects expired stories', () => {
    expect(storyViewAllowed(true, true, false)).toBe(false);
  });
  it('allows owner even if profile private', () => {
    expect(storyViewAllowed(false, false, true)).toBe(true);
  });
});

describe('mentions', () => {
  it('extracts unique usernames', () => {
    expect(extractMentions('hi @Ada and @bob @Ada')).toEqual(['ada', 'bob']);
  });
  it('splits caption for rendering', () => {
    const parts = splitCaptionWithMentions('Hello @fino_user!');
    expect(parts.some((p) => p.type === 'mention' && p.value === 'fino_user')).toBe(true);
  });
});

describe('hashtag extraction', () => {
  function extractHashtags(text: string): string[] {
    const matches = text.match(/#[\w]{2,50}/g) ?? [];
    return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
  }
  it('dedupes and lowercases', () => {
    expect(extractHashtags('#AI #ai #Social')).toEqual(['ai', 'social']);
  });
});
