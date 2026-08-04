# 기여 가이드

## 커밋 메시지

모든 커밋은 Conventional Commits 형식을 사용합니다.

```text
<type>(<scope>): <summary>
```

`scope`는 선택 사항이며 변경 영역을 짧게 적습니다.

### 타입

| 타입 | 용도 |
| --- | --- |
| `feat` | 사용자에게 보이는 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서만 변경 |
| `style` | 동작에 영향 없는 서식 변경 |
| `refactor` | 기능 변화 없는 코드 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가 또는 수정 |
| `build` | 빌드 시스템이나 의존성 변경 |
| `ci` | CI 설정 변경 |
| `chore` | 그 밖의 유지보수 작업 |
| `revert` | 이전 커밋 되돌리기 |

### 작성 원칙

- 타입은 영문 소문자로 작성합니다.
- 요약은 무엇이 바뀌었는지 명확하게 적습니다.
- 요약 끝에는 마침표를 붙이지 않습니다.
- 한 커밋에는 하나의 논리적인 변경만 담습니다.
- 호환성이 깨지는 변경은 타입 또는 scope 뒤에 `!`를 붙이고 본문에 이유를 적습니다.

```text
feat!: 추천 응답 형식 변경
feat(recommendation): 함께 보기 취향 점수 추가
fix(filter): 재생 시간 변경 시 결과가 갱신되지 않는 문제 수정
docs: 로컬 실행 방법 정리
```

## 로컬 설정

저장소를 받은 뒤 다음 명령을 한 번 실행합니다.

```bash
npm run git:setup
```

이 명령은 `.gitmessage`를 커밋 템플릿으로 지정하고 `.githooks/commit-msg`를 활성화합니다.

## PR 작업 흐름

`main`에는 직접 커밋하지 않습니다. 작업마다 브랜치를 만들고 draft PR에서 CI와 리뷰를 마친 뒤 병합합니다.

사람과 Codex 모두 동일한 `<type>/<slug>` 브랜치 규칙을 사용하며 `agent/` 같은 별도 자동화 접두사는 사용하지 않습니다.

### 1. 작업 브랜치 만들기

```bash
npm run pr:start -- feat recommendation-history
```

브랜치는 `<type>/<slug>` 형식으로 만들어집니다. 위 예시는 `feat/recommendation-history`가 됩니다.

### 2. 변경하고 커밋하기

```bash
git add <변경한 파일>
git commit -m "feat(recommendation): 추천 기록 저장 기능 추가"
```

### 3. Draft PR 열기

```bash
npm run pr:open
```

현재 브랜치를 원격에 푸시하고 `main`을 대상으로 draft PR을 만듭니다.

### 4. CI와 리뷰 확인하기

```bash
npm run pr:checks
```

CI가 통과하고 리뷰 코멘트를 모두 반영한 뒤 PR 본문의 `Review focus`를 확인합니다. 병합할 준비가 끝나면 다음 명령으로 draft를 해제합니다.

```bash
npm run pr:ready
```

코드 리뷰 기준과 코멘트 수준은 [docs/CODE_REVIEW.md](./docs/CODE_REVIEW.md)를 따릅니다.
