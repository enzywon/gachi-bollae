#!/bin/sh

set -eu

type="${1:-}"
slug="${2:-}"

if [ -z "$type" ] || [ -z "$slug" ]; then
  printf '%s\n' '사용법: npm run pr:start -- <type> <slug>' >&2
  printf '%s\n' '예시: npm run pr:start -- feat recommendation-history' >&2
  exit 64
fi

case "$type" in
  feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert) ;;
  *)
    printf '%s\n' "지원하지 않는 타입입니다: $type" >&2
    exit 64
    ;;
esac

if ! printf '%s\n' "$slug" | grep -Eq '^[a-z0-9]+([._-][a-z0-9]+)*$'; then
  printf '%s\n' 'slug는 영문 소문자, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.' >&2
  exit 64
fi

if [ -n "$(git status --porcelain)" ]; then
  printf '%s\n' '작업 트리가 깨끗하지 않습니다. 변경을 커밋하거나 보관한 뒤 다시 실행해 주세요.' >&2
  exit 1
fi

branch="$type/$slug"

git fetch origin main
git switch main
git pull --ff-only origin main
git switch -c "$branch"

printf '%s\n' "작업 브랜치를 만들었습니다: $branch"
