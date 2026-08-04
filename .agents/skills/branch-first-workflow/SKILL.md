---
name: branch-first-workflow
description: Prepare and verify a task branch before any repository file mutation. Use whenever Codex is asked to implement, fix, refactor, test, document, configure, generate, install, or otherwise change files in this repository. Do not use for read-only questions, diagnosis, reviews, or status checks.
---

# Branch-First Workflow

Create the task branch before changing files or running commands that may change files.

## Workflow

1. Read the nearest `AGENTS.md` and run `git status -sb`.
2. Confirm the worktree is clean and identify the current branch.
3. If already on a branch created for this exact task, continue there.
4. Otherwise choose the Conventional Commit type and a short kebab-case slug.
5. Run `npm run pr:start -- <type> <slug>` before any mutation.
6. Verify the resulting branch is `<type>/<slug>` and is based on the latest `main`.
7. Only then edit, generate, format, install dependencies, or run commands that write files.

Use these branch types:

- `feat`: user-visible features
- `fix`: bug fixes
- `docs`: documentation only
- `refactor`: behavior-preserving restructuring
- `test`: tests only
- `ci`: CI and review automation
- `chore`: maintenance and agent configuration

## Guardrails

- Never modify files directly on `main`.
- Never use an `agent/` prefix.
- Do not create a branch for read-only work.
- Do not silently move unrelated or user-owned changes between branches.
- If unexpected changes already exist, inspect their ownership and scope before branching. Ask the user only when mixing or moving them would be risky.
- Treat `apply_patch`, generators, formatters, dependency installation, and build commands that update artifacts as mutations.
- Keep unrelated tasks in separate branches and PRs.

## Publish

Use Conventional Commits, push only the intended files, and run `npm run pr:open` after validation. Leave the PR as Draft unless the user explicitly requests Ready for review.
