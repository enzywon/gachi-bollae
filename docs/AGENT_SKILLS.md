# Agent skills

이 저장소는 두 개발자와 Codex가 같은 기준으로 작업하도록 project-local skills를 `.agents/skills/`에 보관합니다. 저장소를 새로 받은 뒤 Codex를 다시 시작하면 skills가 검색됩니다.

## 설치된 공식 skills

| 공급자 | Skill | 고정 커밋 | 용도 |
| --- | --- | --- | --- |
| Vercel Labs | `react-best-practices` | `7c180d9044c9ae2b442b567aad4e42a28dd5ed62` | React 성능 |
| Vercel Labs | `composition-patterns` | `7c180d9044c9ae2b442b567aad4e42a28dd5ed62` | 컴포넌트 설계 |
| Vercel Labs | `web-design-guidelines` | `7c180d9044c9ae2b442b567aad4e42a28dd5ed62` | 접근성과 UI 품질 |
| OpenAI | `playwright` | `49f948faa9258a0c61caceaf225e179651397431` | 브라우저 테스트 |
| OpenAI | `security-best-practices` | `49f948faa9258a0c61caceaf225e179651397431` | 프레임워크별 보안 기준 |

출처:

- <https://github.com/vercel-labs/agent-skills> — MIT
- <https://github.com/openai/skills> — 각 skill 폴더의 `LICENSE.txt`와 `NOTICE.txt` 적용

Playwright skill의 wrapper는 실제 브라우저 작업을 요청했을 때 `npx`를 통해 `@playwright/cli`를 실행합니다. 외부 패키지 실행 승인은 일반 코드 변경과 분리해서 검토합니다.

## 프로젝트 전용 도메인 skills

- `recommendation-domain`: 상황·무드·취향 조건에서 어떤 콘텐츠를 왜 추천할지 결정하는 규칙과 랭킹
- `data-platform`: Neon·Drizzle 스키마와 마이그레이션, 소유자 키 기반 접근 규칙, 환경 변수와 Vercel 구성

도메인 skill은 각자의 판단만 담당합니다. `recommendation-domain`은 무엇을 왜 추천할지, `data-platform`은 그 데이터가 어디에 있고 누가 읽을 수 있는지를 정하고, 화면 구조와 스타일은 UI skill에 맡깁니다.

## 프로젝트 전용 리뷰 skills

- `pr-reviewer`: correctness와 회귀 중심 PR 리뷰
- `security-reviewer`: 인증, 데이터, 비밀값, 서버 렌더링 보안 리뷰
- `test-reviewer`: 실패 경로와 회귀 테스트 설계

리뷰 skill은 기본적으로 코멘트만 작성합니다. 코드 수정, push, 승인, 병합은 별도 요청이 있을 때만 수행합니다.

## 업데이트 원칙

외부 skill을 업데이트할 때는 최신 버전을 자동 추적하지 않습니다. 새 커밋 SHA를 선택한 뒤 변경된 `SKILL.md`, references, scripts를 검토하고 이 문서의 고정 커밋도 함께 갱신합니다.
