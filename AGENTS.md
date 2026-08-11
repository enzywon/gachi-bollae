# Repository agent instructions

## Git workflow

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
- Before opening a PR, fully complete every applicable section of
  `.github/pull_request_template.md` with details specific to the change.
  Remove all instructional HTML comments, placeholder text, and example bullets.
- Mark a PR template checkbox complete only when that check was actually performed.
  For UI changes, include a screenshot or recording; if one cannot be attached,
  state the reason explicitly in the `화면` section. Use `해당 없음` only when the
  change has no visible UI impact.
- Review the final PR title and rendered body after creation. Do not leave a PR with
  an empty section, an unedited template placeholder, or an inaccurate checkbox.
- Do not mark a PR ready, approve it, or merge it unless the user explicitly asks.

Use `npm run pr:start -- <type> <slug>` when starting a new task. After committing,
prepare a completed PR body from the repository template, run `npm run pr:open`, and
immediately replace its template-only body with the prepared content before reporting
the PR as opened.

## Code review

- Write all pull request review comments in Korean, including the title and body of
  each finding. Keep code identifiers, file paths, and error messages as they are.
- Review only the lines the pull request changes.
- Do not report anything the linter or formatter already catches.
