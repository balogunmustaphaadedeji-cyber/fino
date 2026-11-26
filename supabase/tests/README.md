# Social database security tests

File: `social_security_tests.sql`

## Requirement

A local Supabase or Postgres instance with migrations `0001`, `0002`, `0003` applied and seeded users:

| Actor | Role |
|---|---|
| User A | Public account |
| User B | Private account |
| User C | Blocked relative to A |
| Anon | Unauthenticated |

## Run

```bash
supabase start
supabase db reset   # applies migrations
# seed profiles/posts then:
psql "$(supabase status -o env | grep DB_URL)" -v ON_ERROR_STOP=1 -f supabase/tests/social_security_tests.sql
```

## Status in this delivery

**NOT EXECUTED** — no live database credentials in the build environment.

The SQL file documents the assertion patterns for private follow bypass, hashtag count protection, notification field locks, comment field locks, expired stories, and media ownership.


## Chat database and browser checks

See `chat_security_tests.md` for the two-account RLS, membership, message, attachment, receipt, presence, private typing topic and call-signalling verification checklist.

**NOT EXECUTED** — this delivery environment has no Supabase/Postgres instance or project credentials.
