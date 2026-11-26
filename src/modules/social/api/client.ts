import { extractMentions } from '../utils/mentions';
import { supabase } from '../../../lib/supabase';
import type {
  Comment,
  FeedMode,
  FollowRequest,
  PaginatedResult,
  PaginationParams,
  Post,
  PostMedia,
  Profile,
  ReportInput,
  SocialUserPreferences,
  Story,
  Visibility,
} from '../types';

const PAGE_SIZE = 20;

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

export async function getCurrentUserId(): Promise<string | null> {
  const client = requireClient();
  const { data } = await client.auth.getSession();
  return data.session?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
export async function getProfile(userId: string): Promise<Profile | null> {
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'username' | 'display_name' | 'bio' | 'avatar_url' | 'cover_url' | 'location' | 'website' | 'is_private'>>,
): Promise<Profile> {
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function searchProfiles(query: string, limit = 20): Promise<Profile[]> {
  const client = requireClient();
  const q = query.trim().replace(/%/g, '');
  if (!q) return [];
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

// ---------------------------------------------------------------------------
// Feed / Posts
// ---------------------------------------------------------------------------
export async function fetchFeed(
  mode: FeedMode,
  params: PaginationParams = {},
): Promise<PaginatedResult<Post>> {
  const client = requireClient();
  const limit = params.limit ?? PAGE_SIZE;
  const uid = await getCurrentUserId();

  let query = client
    .from('social_posts')
    .select(`
      *,
      author:profiles!social_posts_author_id_fkey (*),
      media:social_post_media (*)
    `)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  if (mode === 'following' && uid) {
    const { data: follows } = await client
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', uid);
    const ids = (follows ?? []).map((f) => f.following_id);
    if (ids.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }
    query = query.in('author_id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Post[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length ? items[items.length - 1].created_at : null;

  if (uid && items.length) {
    const postIds = items.map((p) => p.id);
    const [{ data: likes }, { data: bookmarks }] = await Promise.all([
      client.from('social_likes').select('post_id').eq('user_id', uid).in('post_id', postIds),
      client.from('social_bookmarks').select('post_id').eq('user_id', uid).in('post_id', postIds),
    ]);
    const liked = new Set((likes ?? []).map((l) => l.post_id));
    const bookmarked = new Set((bookmarks ?? []).map((b) => b.post_id));
    items.forEach((p) => {
      p.liked_by_me = liked.has(p.id);
      p.bookmarked_by_me = bookmarked.has(p.id);
      if (p.media) p.media.sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  return { items, nextCursor, hasMore };
}

export async function getPost(postId: string): Promise<Post | null> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  const { data, error } = await client
    .from('social_posts')
    .select(`
      *,
      author:profiles!social_posts_author_id_fkey (*),
      media:social_post_media (*)
    `)
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const post = data as Post;
  if (post.media) post.media.sort((a, b) => a.sort_order - b.sort_order);
  if (uid) {
    const [{ data: like }, { data: bookmark }] = await Promise.all([
      client.from('social_likes').select('post_id').eq('user_id', uid).eq('post_id', postId).maybeSingle(),
      client.from('social_bookmarks').select('post_id').eq('user_id', uid).eq('post_id', postId).maybeSingle(),
    ]);
    post.liked_by_me = Boolean(like);
    post.bookmarked_by_me = Boolean(bookmark);
  }
  return post;
}


async function persistMentions(opts: {
  authorId: string;
  postId?: string;
  commentId?: string;
  text: string;
}): Promise<void> {
  const client = requireClient();
  const names = extractMentions(opts.text);
  if (!names.length) return;
  const { data: profiles } = await client
    .from('profiles')
    .select('id, username')
    .in('username', names);
  for (const profile of profiles ?? []) {
    try {
      await client.from('social_mentions').insert({
        author_id: opts.authorId,
        mentioned_user_id: profile.id,
        post_id: opts.postId ?? null,
        comment_id: opts.commentId ?? null,
      });
    } catch {
      // duplicate or blocked — ignore
    }
  }
}

export async function createPost(input: {
  caption: string;
  visibility?: Visibility;
  media?: Omit<PostMedia, 'id' | 'post_id' | 'created_at'>[];
}): Promise<Post> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');

  const { data: post, error } = await client
    .from('social_posts')
    .insert({
      author_id: uid,
      caption: input.caption.trim(),
      visibility: input.visibility ?? 'public',
      media_count: input.media?.length ?? 0,
    })
    .select()
    .single();
  if (error) throw error;

  if (input.media?.length) {
    const rows = input.media.map((m, i) => ({
      ...m,
      post_id: post.id,
      owner_id: uid,
      sort_order: i,
    }));
    const { error: mediaError } = await client.from('social_post_media').insert(rows);
    if (mediaError) throw mediaError;
  }

  // Extract hashtags
  const tags = extractHashtags(input.caption);
  if (tags.length) {
    await ensureHashtags(tags, post.id);
  }
  await persistMentions({ authorId: uid, postId: post.id, text: input.caption });

  return getPost(post.id) as Promise<Post>;
}

export async function updatePost(
  postId: string,
  patch: { caption?: string; visibility?: Visibility },
): Promise<Post> {
  const client = requireClient();
  const { data, error } = await client
    .from('social_posts')
    .update({ ...patch, is_edited: true })
    .eq('id', postId)
    .select()
    .single();
  if (error) throw error;
  if (patch.caption !== undefined) {
    await reconcilePostHashtags(postId, patch.caption);
  }
  return data as Post;
}

export async function deletePost(postId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('social_posts').delete().eq('id', postId);
  if (error) throw error;
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w]{2,50}/g) ?? [];
  return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

async function ensureHashtags(tags: string[], postId: string): Promise<void> {
  const client = requireClient();
  // Counts maintained by DB trigger; creation via security definer RPC when available
  for (const tag of tags) {
    let hashtagId: string | null = null;
    const { data: rpcId, error: rpcErr } = await client.rpc('social_ensure_hashtag', { p_tag: tag });
    if (!rpcErr && rpcId) {
      hashtagId = rpcId as string;
    } else {
      const { data: existing } = await client
        .from('social_hashtags')
        .select('id')
        .eq('tag', tag)
        .maybeSingle();
      hashtagId = existing?.id ?? null;
    }
    if (!hashtagId) continue;
    await client.from('social_post_hashtags').upsert({ post_id: postId, hashtag_id: hashtagId });
  }
}

/** Reconcile hashtags after caption edit: remove old links, add new. */
export async function reconcilePostHashtags(postId: string, caption: string): Promise<void> {
  const client = requireClient();
  const tags = extractHashtags(caption);
  await client.from('social_post_hashtags').delete().eq('post_id', postId);
  if (tags.length) await ensureHashtags(tags, postId);
}

// ---------------------------------------------------------------------------
// Likes / Bookmarks
// ---------------------------------------------------------------------------
export async function likePost(postId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client.from('social_likes').insert({ post_id: postId, user_id: uid });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function unlikePost(postId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client
    .from('social_likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', uid);
  if (error) throw error;
}

export async function bookmarkPost(postId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client.from('social_bookmarks').insert({ post_id: postId, user_id: uid });
  if (error && error.code !== '23505') throw error;
}

export async function unbookmarkPost(postId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client
    .from('social_bookmarks')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', uid);
  if (error) throw error;
}

export async function getBookmarkedPosts(params: PaginationParams = {}): Promise<PaginatedResult<Post>> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) return { items: [], nextCursor: null, hasMore: false };
  const limit = params.limit ?? PAGE_SIZE;
  let q = client
    .from('social_bookmarks')
    .select('post_id, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (params.cursor) q = q.lt('created_at', params.cursor);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const posts: Post[] = [];
  for (const row of slice) {
    const p = await getPost(row.post_id);
    if (p) posts.push(p);
  }
  return {
    items: posts,
    nextCursor: hasMore && slice.length ? slice[slice.length - 1].created_at : null,
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
export async function fetchComments(
  postId: string,
  params: PaginationParams = {},
): Promise<PaginatedResult<Comment>> {
  const client = requireClient();
  const limit = params.limit ?? 30;
  let q = client
    .from('social_comments')
    .select(`*, author:profiles!social_comments_author_id_fkey (*)`)
    .eq('post_id', postId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })
    .limit(limit + 1);
  if (params.cursor) q = q.gt('created_at', params.cursor);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Comment[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const uid = await getCurrentUserId();
  if (uid && items.length) {
    const ids = items.map((c) => c.id);
    const { data: likes } = await client
      .from('social_comment_likes')
      .select('comment_id')
      .eq('user_id', uid)
      .in('comment_id', ids);
    const liked = new Set((likes ?? []).map((l) => l.comment_id));
    items.forEach((c) => {
      c.liked_by_me = liked.has(c.id);
    });
  }
  // Load one level of replies
  for (const c of items) {
    const { data: replies } = await client
      .from('social_comments')
      .select(`*, author:profiles!social_comments_author_id_fkey (*)`)
      .eq('parent_id', c.id)
      .order('created_at', { ascending: true })
      .limit(20);
    c.replies = (replies ?? []) as Comment[];
  }
  return {
    items,
    nextCursor: hasMore && items.length ? items[items.length - 1].created_at : null,
    hasMore,
  };
}

export async function createComment(
  postId: string,
  body: string,
  parentId?: string | null,
): Promise<Comment> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { data, error } = await client
    .from('social_comments')
    .insert({
      post_id: postId,
      author_id: uid,
      parent_id: parentId ?? null,
      body: body.trim(),
    })
    .select(`*, author:profiles!social_comments_author_id_fkey (*)`)
    .single();
  if (error) throw error;
  await persistMentions({ authorId: uid, commentId: data.id, postId: postId, text: body });
  return data as Comment;
}

export async function updateComment(commentId: string, body: string): Promise<Comment> {
  const client = requireClient();
  const { data, error } = await client
    .from('social_comments')
    .update({ body: body.trim(), is_edited: true })
    .eq('id', commentId)
    .select()
    .single();
  if (error) throw error;
  return data as Comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('social_comments').delete().eq('id', commentId);
  if (error) throw error;
}

export async function likeComment(commentId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client
    .from('social_comment_likes')
    .insert({ comment_id: commentId, user_id: uid });
  if (error && error.code !== '23505') throw error;
}

export async function unlikeComment(commentId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client
    .from('social_comment_likes')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', uid);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------
export async function followUser(targetId: string): Promise<'followed' | 'requested'> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  if (uid === targetId) throw new Error('Cannot follow yourself');

  const profile = await getProfile(targetId);
  if (!profile) throw new Error('User not found');

  if (profile.is_private) {
    const { error } = await client.from('social_follow_requests').upsert({
      requester_id: uid,
      target_id: targetId,
      status: 'pending',
    });
    if (error) throw error;
    return 'requested';
  }

  const { error } = await client.from('social_follows').insert({
    follower_id: uid,
    following_id: targetId,
  });
  if (error && error.code !== '23505') throw error;
  return 'followed';
}

export async function unfollowUser(targetId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  await client
    .from('social_follows')
    .delete()
    .eq('follower_id', uid)
    .eq('following_id', targetId);
  await client
    .from('social_follow_requests')
    .delete()
    .eq('requester_id', uid)
    .eq('target_id', targetId);
}

export async function isFollowing(targetId: string): Promise<boolean> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) return false;
  const { data } = await client
    .from('social_follows')
    .select('follower_id')
    .eq('follower_id', uid)
    .eq('following_id', targetId)
    .maybeSingle();
  return Boolean(data);
}

export async function getFollowers(userId: string, params: PaginationParams = {}): Promise<Profile[]> {
  const client = requireClient();
  const limit = params.limit ?? 30;
  const { data, error } = await client
    .from('social_follows')
    .select('follower:profiles!social_follows_follower_id_fkey (*)')
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: { follower: Profile }) => r.follower).filter(Boolean);
}

export async function getFollowing(userId: string, params: PaginationParams = {}): Promise<Profile[]> {
  const client = requireClient();
  const limit = params.limit ?? 30;
  const { data, error } = await client
    .from('social_follows')
    .select('following:profiles!social_follows_following_id_fkey (*)')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: { following: Profile }) => r.following).filter(Boolean);
}

export async function getPendingFollowRequests(): Promise<FollowRequest[]> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await client
    .from('social_follow_requests')
    .select(`*, requester:profiles!social_follow_requests_requester_id_fkey (*)`)
    .eq('target_id', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FollowRequest[];
}

export async function respondToFollowRequest(
  requestId: string,
  accept: boolean,
): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { data: req, error: fetchErr } = await client
    .from('social_follow_requests')
    .select('*')
    .eq('id', requestId)
    .eq('target_id', uid)
    .single();
  if (fetchErr) throw fetchErr;
  if (accept) {
    await client.from('social_follows').insert({
      follower_id: req.requester_id,
      following_id: uid,
    });
    await client
      .from('social_follow_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId);
  } else {
    await client
      .from('social_follow_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', requestId);
  }
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------
export async function fetchActiveStories(): Promise<Story[]> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  const { data, error } = await client
    .from('social_stories')
    .select(`*, author:profiles!social_stories_author_id_fkey (*)`)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const stories = (data ?? []) as Story[];
  if (uid && stories.length) {
    const ids = stories.map((s) => s.id);
    const { data: views } = await client
      .from('social_story_views')
      .select('story_id')
      .eq('viewer_id', uid)
      .in('story_id', ids);
    const viewed = new Set((views ?? []).map((v) => v.story_id));
    stories.forEach((s) => {
      s.viewed_by_me = viewed.has(s.id);
    });
  }
  return stories;
}

export async function createStory(input: {
  caption?: string;
  cloudinary_public_id: string;
  resource_type: 'image' | 'video';
  mime_type?: string;
  duration_seconds?: number;
}): Promise<Story> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { data, error } = await client
    .from('social_stories')
    .insert({
      author_id: uid,
      caption: input.caption ?? '',
      cloudinary_public_id: input.cloudinary_public_id,
      resource_type: input.resource_type,
      mime_type: input.mime_type ?? null,
      duration_seconds: input.duration_seconds ?? null,
    })
    .select(`*, author:profiles!social_stories_author_id_fkey (*)`)
    .single();
  if (error) throw error;
  return data as Story;
}

export async function deleteStory(storyId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('social_stories').delete().eq('id', storyId);
  if (error) throw error;
}

export async function markStoryViewed(storyId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) return;
  await client.from('social_story_views').upsert({ story_id: storyId, viewer_id: uid });
}

// ---------------------------------------------------------------------------
// Blocks / Reports / Hide
// ---------------------------------------------------------------------------
export async function blockUser(blockedId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  if (uid === blockedId) throw new Error('Cannot block yourself');
  await client.from('social_blocks').insert({ blocker_id: uid, blocked_id: blockedId });
  // Remove follow relationships both ways
  await client.from('social_follows').delete().or(`and(follower_id.eq.${uid},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${uid})`);
}

export async function unblockUser(blockedId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  await client
    .from('social_blocks')
    .delete()
    .eq('blocker_id', uid)
    .eq('blocked_id', blockedId);
}

export async function getBlockedUsers(): Promise<Profile[]> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await client
    .from('social_blocks')
    .select('blocked:profiles!social_blocks_blocked_id_fkey (*)')
    .eq('blocker_id', uid);
  if (error) throw error;
  return (data ?? []).map((r: { blocked: Profile }) => r.blocked).filter(Boolean);
}

export async function reportContent(input: ReportInput): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { error } = await client.from('social_reports').insert({
    reporter_id: uid,
    target_type: input.target_type,
    target_id: input.target_id,
    reason: input.reason,
    details: input.details ?? null,
  });
  if (error) throw error;
}

export async function hidePost(postId: string): Promise<void> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  await client.from('social_hidden_posts').upsert({ user_id: uid, post_id: postId });
}

// ---------------------------------------------------------------------------
// Preferences / Search history
// ---------------------------------------------------------------------------
export async function getSocialPreferences(): Promise<SocialUserPreferences | null> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data } = await client
    .from('social_user_preferences')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  return data as SocialUserPreferences | null;
}

export async function upsertSocialPreferences(
  patch: Partial<Omit<SocialUserPreferences, 'user_id' | 'created_at' | 'updated_at'>>,
): Promise<SocialUserPreferences> {
  const client = requireClient();
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  const { data, error } = await client
    .from('social_user_preferences')
    .upsert({
      user_id: uid,
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as SocialUserPreferences;
}

export async function searchPosts(query: string, limit = 20): Promise<Post[]> {
  const client = requireClient();
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await client
    .from('social_posts')
    .select(`
      *,
      author:profiles!social_posts_author_id_fkey (*),
      media:social_post_media (*)
    `)
    .ilike('caption', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Post[];
}

export async function getTrendingHashtags(limit = 10): Promise<{ tag: string; post_count: number }[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('social_hashtags')
    .select('tag, post_count')
    .order('post_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getUserPosts(
  userId: string,
  params: PaginationParams = {},
): Promise<PaginatedResult<Post>> {
  const client = requireClient();
  const limit = params.limit ?? PAGE_SIZE;
  let q = client
    .from('social_posts')
    .select(`
      *,
      author:profiles!social_posts_author_id_fkey (*),
      media:social_post_media (*)
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (params.cursor) q = q.lt('created_at', params.cursor);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Post[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore && items.length ? items[items.length - 1].created_at : null,
    hasMore,
  };
}
