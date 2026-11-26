# Social → Shared Notifications Contract

Social does **not** implement a notification centre UI.

## Outbox table

`public.social_notification_events`

| Column | Meaning |
|---|---|
| event_type | `new_follower` \| `follow_request` \| `follow_accepted` \| `post_like` \| `comment` \| `comment_reply` \| `mention` \| `story_view` |
| actor_id | User who caused the event |
| recipient_id | User who should be notified |
| entity_type / entity_id | Related post, comment, user, etc. |
| payload | JSON context |
| consumed_at | Set by the shared notification worker when delivered |

Events are written by security-definer triggers in the Social migration. The shared notification service should:

1. Poll or subscribe to unconsumed rows for a user.
2. Create in-app / push notifications.
3. Mark `consumed_at`.

RLS: recipients can SELECT and UPDATE (consume) their own rows only.
