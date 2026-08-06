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

git fetch --quiet origin main
base="$(git merge-base FETCH_HEAD HEAD)"

if [ "$(git rev-list --count "$base..HEAD")" -eq 0 ]; then
  printf '%s\n' 'main과 비교해 커밋이 없습니다. 먼저 커밋해 주세요.' >&2
  exit 1
fi

title="$(git log --reverse --format=%s "$base..HEAD" | head -1)"

if [ -z "$title" ]; then
  printf '%s\n' '브랜치 첫 커밋에 제목이 없습니다. 커밋 제목을 채운 뒤 다시 실행해 주세요.' >&2
  exit 1
fi

# 저장소 루트 밖에서 실행해도 템플릿을 찾도록 절대 경로로 고정한다.
template="$(git rev-parse --show-toplevel)/.github/pull_request_template.md"

if [ ! -f "$template" ]; then
  printf '%s\n' "PR 템플릿을 찾을 수 없습니다: $template" >&2
  exit 1
fi

git push -u origin "$branch"

# --fill은 커밋에서 제목과 본문을 확정하므로 --template이 적용되지 않는다.
# 제목은 브랜치 첫 커밋에서 가져오고 본문은 템플릿으로 채운다.
gh pr create \
  --draft \
  --base main \
  --title "$title" \
  --body-file "$template"

printf '%s\n' 'PR 본문이 템플릿 상태입니다. 각 항목을 채운 뒤 리뷰를 요청해 주세요.'
