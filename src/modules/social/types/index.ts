export type Visibility = 'public' | 'followers' | 'private';

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string;
  location: string | null;
  website: string | null;
  is_private: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: string;
  updated_at: string;
}

export interface PostMedia {
  id: string;
  post_id: string;
  owner_id: string;
  cloudinary_public_id: string;
  resource_type: 'image' | 'video';
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  sort_order: number;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  caption: string;
  visibility: Visibility;
  media_count: number;
  like_count: number;
  comment_count: number;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  author?: Profile;
  media?: PostMedia[];
  liked_by_me?: boolean;
  bookmarked_by_me?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  author?: Profile;
  liked_by_me?: boolean;
  replies?: Comment[];
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface FollowRequest {
  id: string;
  requester_id: string;
  target_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  requester?: Profile;
}

export interface Story {
  id: string;
  author_id: string;
  caption: string;
  cloudinary_public_id: string;
  resource_type: 'image' | 'video';
  mime_type: string | null;
  duration_seconds: number | null;
  view_count: number;
  expires_at: string;
  created_at: string;
  author?: Profile;
  viewed_by_me?: boolean;
}

export interface Bookmark {
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface Hashtag {
  id: string;
  tag: string;
  post_count: number;
  created_at: string;
}

export interface ReportInput {
  target_type: 'post' | 'comment' | 'story' | 'user';
  target_id: string;
  reason: 'spam' | 'harassment' | 'hate' | 'violence' | 'nudity' | 'misinformation' | 'impersonation' | 'other';
  details?: string;
}

export interface SocialUserPreferences {
  user_id: string;
  feed_sort: 'chronological' | 'following';
  show_replies_default: boolean;
  allow_mentions: 'everyone' | 'following' | 'none';
  allow_comments: 'everyone' | 'following' | 'none';
  search_history: string[];
  created_at: string;
  updated_at: string;
}

export type FeedMode = 'following' | 'discover' | 'chronological';

export interface PaginationParams {
  limit?: number;
  cursor?: string; // created_at ISO or id
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
