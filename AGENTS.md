# Repository agent instructions

## Git workflow

- Before any repository file mutation, load and follow `$branch-first-workflow`.
- Never commit directly to `main`.
- Never use an `agent/` branch prefix.
- Start every change from an up-to-date `main` branch.
- Name branches `<type>/<kebab-case-description>` using one of:
  - `feat/` for user-facing features
  - `fix/` for bug fixes
  - `docs/` for documentation
  - `refactor/` for behavior-preserving restructuring
  - `test/` for test-only changes
  - `ci/` for CI changes
  - `chore/` for maintenance
- Use Conventional Commits for commit messages and PR titles.
- Push the work branch and open a draft PR targeting `main`.
- Do not mark a PR ready, approve it, or merge it unless the user explicitly asks.

Use `npm run pr:start -- <type> <slug>` when starting a new task and `npm run pr:open` after committing it.
