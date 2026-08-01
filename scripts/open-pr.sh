#!/bin/sh

set -eu

command -v gh >/dev/null 2>&1 || {
  printf '%s\n' 'GitHub CLI(gh)가 필요합니다.' >&2
  exit 69
}

branch="$(git branch --show-current)"

if [ -z "$branch" ] || [ "$branch" = "main" ]; then
  printf '%s\n' 'main이 아닌 작업 브랜치에서 실행해 주세요.' >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  printf '%s\n' '커밋되지 않은 변경이 있습니다. 먼저 커밋해 주세요.' >&2
  exit 1
fi

gh auth status >/dev/null
git push -u origin "$branch"
gh pr create \
  --draft \
  --base main \
  --fill \
  --template .github/pull_request_template.md
