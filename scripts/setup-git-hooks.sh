#!/bin/sh

set -eu

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  printf '%s\n' 'Git 저장소 안에서 실행해 주세요.' >&2
  exit 1
}

cd "$repository_root"
git config --local core.hooksPath .githooks
git config --local commit.template .gitmessage

printf '%s\n' '커밋 템플릿과 Conventional Commits 검증 훅을 설정했습니다.'
