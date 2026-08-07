---
name: data-platform
description: Own the Neon Postgres and Drizzle layer — schema and migrations, the anonymous owner key that gates every row, data access from route handlers, environment variables, and Vercel deployment config. Use when introducing or changing persistence, identity, table definitions, database access code, or the degraded paths that run without a database.
---

# Data Platform

Own where 같이볼래's data lives and who is allowed to read it. Neon serverless Postgres through Drizzle, hosted on Vercel. Persistence already exists — `watch_records` and `reviews` ship in `drizzle/0000_light_joystick.sql` — so the job now is keeping the access rules intact as tables grow.

## Access path

Route handler → `app/_lib/records.ts` → `getDb()` in `db/index.ts` → `drizzle-orm/neon-http` → Neon.

`db/index.ts` caches one connection at module scope and builds it lazily on first call, so the recommendation flow and the render tests still work with no `DATABASE_URL` set. The `neon-http` driver speaks HTTP, so runtime connection limits are not a concern — do not add pooling machinery for a problem this driver does not have.

Route handlers never query tables directly. They resolve the owner key, validate input, and call a function in `app/_lib/records.ts`. Keeping every query in one module is what makes the owner-key rule below auditable.

## Access control

There is no RLS. **The `ownerKey` predicate in the `WHERE` clause is the entire access control mechanism.**

`app/_lib/owner.ts` issues `gb_owner`, a `crypto.randomUUID()` in an `HttpOnly`, `SameSite=Lax`, one-year cookie, marked `Secure` in production only. This is device scoping, not authentication: losing the cookie loses the records, and holding the cookie value grants full access to them.

1. **Every read, update, and delete filters on `ownerKey`.** The pattern is `and(eq(watchRecords.id, id), eq(watchRecords.ownerKey, ownerKey))`. A query that reaches a row by id alone is a data leak, not a shortcut — there is no second layer to catch it.
2. **`watch_records` is the only table that carries the owner.** Child tables have no `ownerKey` column and must never grow one — `reviews` is reached by joining `watchRecords` and filtering the parent, as `listRecords` and `upsertReview` do. A child query that stands on its own has no owner predicate to check, which is exactly the shape that leaks.
3. **Another owner's row is 404, never 403.** `findRecord` returning null and the row not existing are indistinguishable to the caller by design. Do not add an error message that confirms an id exists.
4. **Owner-dependent responses are `no-store`.** Use `jsonNoStore` from `app/_lib/api.ts`. The URL carries no owner, so a cached response can be served to the wrong cookie.
5. **Cookies are issued on write, not on read.** `GET /api/records` without a cookie returns an empty result; only `resolveOwnerKey` + `jsonWithOwner` on a write mints one. Minting on read hands an identity to every crawler.
6. **Input is validated at the boundary.** `app/_lib/validation.ts` throws `ValidationError`, which `errorResponse` maps to 400. Nothing in `records.ts` should re-check shapes, and nothing should reach Drizzle unvalidated.

## Schema rules

1. **Schema changes are generated migrations in the repo.** `npm run db:generate` writes to `drizzle/`, `npm run db:migrate` applies it. No edits through the Neon console — the console leaves no reviewable diff and no way to reproduce an environment.
2. **Records snapshot content, they do not reference it.** `watch_records` stores title, format, provider, runtime, and palette at write time so a change to the demo array — or the eventual swap to TMDB — cannot break history. `contentKey` is a namespaced string (`demo:5`, later `tmdb:movie:12345`), not a foreign key.
3. **`reviews` stays a separate table.** One rater today (`raterKey` defaults to `"me"`), but two-person blind rating is the planned shape, and splitting later is a migration this split already paid for.
4. **Personal data needs a stated owner and retention.** Watch history identifies what a person watches. Decide who can read a row and how long it is kept in the migration that creates the table, not afterwards.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | runtime (`db/index.ts`) | Pooled connection string. Set in Vercel project settings; the Neon integration injects it. |
| `DATABASE_URL_UNPOOLED` | migrations (`drizzle.config.ts`) | Direct connection — DDL must not go through PgBouncer. Falls back to `DATABASE_URL` when unset. |

Never prefix either with `NEXT_PUBLIC_`; that compiles the credential into the browser bundle. Local, preview, and production point at different Neon databases — a preview deployment must never hold production credentials.

## Degraded operation

The recommendation flow is the product; storage is an add-on to it. Missing infrastructure must stay diagnosable rather than collapsing into a 500.

- No `DATABASE_URL` → 503 with `code: "storage_unavailable"`.
- Tables not migrated (Postgres `42P01`) → 503 with `code: "migration_required"`.

Both live in `errorResponse` in `app/_lib/api.ts`. Adding a table means checking that its failure path still lands on one of these, and that `/` renders with no database at all.

## Workflow

1. Confirm what the change needs to persist and whether it needs an identity beyond the device cookie.
2. Write the schema change, generate the migration, and commit the generated SQL together.
3. Add the query to `app/_lib/records.ts` with its `ownerKey` predicate, and its validation to `app/_lib/validation.ts`.
4. Check the no-database and no-migration paths still return their 503s.
5. Set new variables in local, preview, and production before merging, or the preview deploy breaks silently.
6. Hand cookie and ownership handling to `$security-reviewer`, and data-access failure paths to `$test-reviewer`.

## Known prerequisites

- **There is no login.** `app/_lib/owner.ts` says so in its own header comment: the cookie is the credential, and real users need authentication before this holds. Every schema decision that assumes a stable person is blocked on it, and adding one migrates every existing `owner_key`.
- **Together mode has two people but one session.** Partner taste is entered on the same device, and `watch_records.owner_key` is per device. If a partner ever gets their own session, both tables change shape — do not design as if that decision were made.
- **Reactions are not persisted.** `pick` and `skip` live in component state and vanish on reload; only the `watched` → rating flow writes a row. Persisting the rest is a schema decision, not a UI one.
- **OTT availability expires.** Provider is a static string on demo content and a snapshot column on records. Real availability varies by region and changes without notice, so the live value belongs in its own table with a fetch timestamp — never as a column on the title.
- **TMDB terms apply.** The footer already carries the attribution. Caching policy and what may be stored are constraints on the schema, not an afterthought.

## Out of scope

What to recommend and how to rank it belongs to `$recommendation-domain` — this role provides the tables and the access path, not the selection rules. Component structure and styling belong to the UI skills.
