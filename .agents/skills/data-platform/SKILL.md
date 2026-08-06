---
name: data-platform
description: Own the Supabase and Vercel layer — schema and migrations, row level security, API key handling, data access from server components and route handlers, environment variables, and runtime selection. Use when introducing or changing persistence, auth, table definitions, RLS policies, database access code, or deployment configuration.
---

# Data Platform

Own where 같이볼래's data lives and who is allowed to read it. Supabase for Postgres and auth, Vercel for hosting. Nothing is wired up yet, so early choices here set the defaults everything later inherits.

## Access path

Reach Postgres through `@supabase/supabase-js` from server components and route handlers. It speaks HTTP, so serverless connection limits never become a problem, and RLS applies to every call by construction.

Take on a direct-Postgres ORM only when a query genuinely cannot be expressed through the client. That trade buys SQL expressiveness and costs connection management — see `Direct connections` below before agreeing to it.

## API keys

The `anon` and `service_role` keys are legacy and slated for removal at the end of 2026. Use the current pair.

| Key | Exposure | RLS |
| --- | --- | --- |
| `sb_publishable_…` | Safe in the browser, may use `NEXT_PUBLIC_` | Enforced |
| `sb_secret_…` | Server only, never `NEXT_PUBLIC_`, never in a client component | **Bypassed** |

A secret key ignores every policy you write. Treat each use as a deliberate exception that names why RLS had to be skipped.

## Invariants

1. **RLS is on for every table, in the migration that creates it.** Not a follow-up task. A table shipped without policies is readable by anyone holding the publishable key, which is public by design.
2. **Secret keys never cross into client code.** Any `NEXT_PUBLIC_` variable is compiled into the browser bundle. Check the prefix before adding a variable, not after.
3. **Schema changes are migrations in the repo.** No edits through the dashboard — the dashboard leaves no reviewable diff and no way to reproduce an environment.
4. **Personal data needs a stated owner and retention.** Reaction history and taste selections identify what a person watches. Decide who can read a row and how long it is kept when the table is created.
5. **Environments stay separate.** Local, preview, and production point at different projects. A preview deployment must never hold production credentials.

## Direct connections

Only relevant once an ORM is in play.

- Runtime queries use the pooler on port `6543` in transaction mode.
- Migrations use the direct connection on port `5432` — transaction mode cannot run the multi-statement transactions migrations need.
- Transaction mode drops prepared statements and session state. Disable prepared statements in the client, and never rely on session-scoped settings.

## Workflow

1. Confirm what the change actually needs to persist, and whether it needs a user identity to do so.
2. Write the migration, its RLS policies, and its rollback together.
3. Decide the read path and the exact key it runs under. If it needs a secret key, justify that in the change itself.
4. Set the variable in all three environments before merging, or the preview deploy breaks silently.
5. Hand key handling and policy design to `$security-reviewer`, and data-access failure paths to `$test-reviewer`.

## Known prerequisites

The app has no persistence and no identity today. These block real tables, so settle them before designing a schema.

- **Nobody is signed in.** Reactions (`pick`, `skip`, `watched`) and taste selections currently live in component state. Persisting them requires deciding between Supabase Auth accounts and an anonymous device-scoped identity, and that choice determines every RLS policy.
- **Together mode has two people but one session.** Partner taste is entered on the same device. If a partner ever gets their own session, the data model changes shape — do not design the schema as if that decision were already made.
- **OTT availability expires.** Provider is a static string on demo content. Real availability varies by region and changes without notice, so it belongs in its own table with a fetch timestamp, never as a column on the title.
- **TMDB terms apply.** The footer already carries the attribution. Caching policy and what may be stored are constraints on the schema, not an afterthought.

## Out of scope

What to recommend and how to rank it belongs to `$recommendation-domain` — this role provides the tables and the access path, not the selection rules. Component structure and styling belong to the UI skills.
