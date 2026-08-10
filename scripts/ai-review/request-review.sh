#!/usr/bin/env bash
# 리뷰 앱에게 PR 리뷰를 요청하는 코멘트를 단다.
#
# 앱들은 각자 자기네 서버에서 돌기 때문에 여기서는 요청만 하고, 결과는 harvest.mjs 가
# GitHub API 로 걷어온다. 그래야 각자의 구독으로 커버되어 별도 API 요금이 안 붙는다.
#
# 리뷰어마다 호출 시점이 달라(CodeRabbit 은 처음부터, Codex 는 CodeRabbit 이 실패했을
# 때만) 워크플로에서 두 번 부른다. 같은 로직을 스텝마다 베끼지 않으려고 빼 두었다.
#
# 사용법:
#   request-review.sh <이름> <명령> <actions-토큰-재시도 yes|no>
#   request-review.sh coderabbit '@coderabbitai review' no
#
# 성공하면 GITHUB_OUTPUT 에 `<이름>-comment-id=<id>` 를 남긴다. 실패해도 종료 코드는
# 0 이다. 리뷰를 못 받는 것이 워크플로를 세울 이유는 아니고, 요청 id 가 비었다는 것으로
# 뒤 스텝들이 알아서 판단한다.

set -uo pipefail

name="${1:?리뷰어 이름이 필요합니다}"
command="${2:?요청 명령이 필요합니다}"
bot_ok="${3:?Actions 토큰 재시도 여부가 필요합니다}"

: "${REPOSITORY:?}" "${PR_NUMBER:?}" "${REQUEST_MARKER:?}" "${ACTIONS_TOKEN:?}"

# gh api 는 실패해도 응답 본문을 stdout 으로 뱉는다. 코멘트 id 는 숫자이므로
# 숫자가 아니면 실패로 본다. 이 검증이 없으면 에러 JSON 을 id 로 착각한다.
post() {
  local out
  out=$(GH_TOKEN="$1" gh api --method POST \
    "repos/${REPOSITORY}/issues/${PR_NUMBER}/comments" \
    --raw-field body="$2" --jq '.id' 2>/dev/null) || return 1
  [[ "$out" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$out"
}

# 취소된 실행이 남긴 요청을 나중에 찾아 지우려면 표식이 필요하다.
# 명령은 첫 줄에 그대로 두고 표식은 아래에 붙인다. HTML 주석이라 보이지 않는다.
body=$(printf '%s\n\n%s' "$command" "$REQUEST_MARKER")

# 앱은 draft PR을 자동 리뷰하지 않으므로 명시적으로 요청한다.
# 사용자 토큰을 먼저 쓴다. 구독 귀속이 명확하다.
id=""
if [ -n "${USER_TOKEN:-}" ]; then
  id=$(post "$USER_TOKEN" "$body") || true
fi

# CodeRabbit 은 봇이 쓴 코멘트를 무시한다("Skipped: comment is from another GitHub
# bot"). 재시도하면 리뷰는 시작되지 않으면서 요청 ID만 생겨, 수확이 오지 않을 리뷰를
# 기다린다. 그래서 재시도 여부를 리뷰어별로 받는다.
if [ -z "$id" ] && [ "$bot_ok" = "yes" ]; then
  echo "$name: 사용자 토큰으로 요청하지 못해 Actions 토큰으로 재시도합니다."
  id=$(post "$ACTIONS_TOKEN" "$body") || true
fi

if [ -z "$id" ]; then
  echo "$name 리뷰를 요청하지 못했습니다."
  exit 0
fi

echo "${name}-comment-id=$id" >> "$GITHUB_OUTPUT"
echo "$name 리뷰를 요청했습니다. (코멘트 $id)"
