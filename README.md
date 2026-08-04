# 같이볼래

혼자 또는 함께 볼 콘텐츠를 상황과 취향에 맞춰 추천해 주는 웹 애플리케이션입니다.

식사 중인지, 자기 전인지, 얼마나 집중해서 볼 수 있는지와 같은 시청 상황을 먼저 고르고 원하는 분위기·장르·재생 시간·OTT를 선택하면 조건에 맞는 영화, 시리즈, 예능을 추천합니다.

## 주요 기능

- 혼자 보기와 같이 보기 모드
- 시청 상황과 현재 기분을 반영한 추천
- 두 사람의 취향을 함께 고려하는 장르 선택
- 재생 시간, 콘텐츠 형식, OTT별 필터
- 피하고 싶은 분위기와 소재 제외
- 추천 결과에 대한 선택, 넘기기, 시청 완료 기록
- 시청 기록과 별점·한 줄 감상 저장
- 평가 수정과 수정 이력 표시
- 함께 본 목록의 작품 단위 묶음, 재시청 배지, 정렬과 필터

현재 추천 데이터는 화면 흐름을 확인하기 위한 데모 데이터입니다.
시청 기록과 평가는 Cloudflare D1에 저장합니다. 상세 요구사항은 [평가 기능 PRD](./docs/gachi-bollae-rating-prd-v0.1.md)를 참고하세요.

## 기술 구성

- React 19
- Next.js 16
- TypeScript
- Vite와 Vinext
- Cloudflare Workers
- Drizzle ORM과 선택적 D1 연동

## 시작하기

### 요구 사항

- Node.js 22.13 이상 또는 24 이상
- npm

Node.js 23은 일부 개발 의존성이 지원하지 않으므로 권장하지 않습니다.

### 설치 및 실행

```bash
npm ci
npm run dev
```

개발 서버가 시작되면 터미널에 표시되는 로컬 주소로 접속합니다.

### 주요 명령어

```bash
npm run dev                # 개발 서버 실행
npm run lint               # 코드 검사
npm test                   # 빌드 및 렌더링 테스트
npm run build              # 배포용 빌드
npm run validate:artifact  # 생성된 배포 결과 검증
npm run db:generate        # Drizzle 마이그레이션 생성
npm run git:setup          # 커밋 템플릿과 검증 훅 설정
npm run pr:start -- <type> <slug> # 작업 브랜치 생성
npm run pr:open            # 현재 브랜치로 draft PR 생성
npm run pr:checks          # PR의 CI 결과 확인
npm run pr:ready           # draft PR을 리뷰 가능한 상태로 전환
```

### 로컬 D1 준비

기록과 평가 기능은 D1 테이블이 있어야 동작합니다. 로컬 개발 환경에서는 마이그레이션을 직접 한 번 적용합니다.
아래 설정 파일을 임시로 만든 뒤 `drizzle/` 아래의 SQL을 실행하세요. 배포 환경에서는 플랫폼이 마이그레이션을 적용합니다.

```bash
cat > wrangler.local.json <<'JSON'
{
  "name": "gachi-bollae-local",
  "main": "worker/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "site-creator-d1",
      "database_id": "00000000-0000-4000-8000-000000000000"
    }
  ]
}
JSON

npx wrangler d1 execute DB --local \
  --config wrangler.local.json \
  --persist-to .wrangler/state \
  --file drizzle/0000_absent_flatman.sql
```

테이블이 없으면 API가 `기록 테이블이 아직 만들어지지 않았습니다` 안내와 함께 503으로 응답합니다.

빌드와 CI 보조 스크립트는 Linux 환경을 기준으로 하며 `flock`, `curl`, GNU `timeout`을 사용합니다. macOS에서는 개발 서버와 lint를 우선 사용하고, 전체 빌드는 Linux CI 환경에서 확인하는 것을 권장합니다.

## 프로젝트 구조

```text
app/        화면, 스타일, 인증 도우미
db/         Drizzle 스키마와 D1 연결
worker/     Cloudflare Worker 진입점
examples/   선택 기능 예시
scripts/    설치, 빌드, 검증 스크립트
tests/      렌더링 결과 테스트
public/     정적 파일
```

## 커밋 규칙

이 저장소는 [Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 형식을 사용합니다.

```text
feat: 추천 결과 저장 기능 추가
fix(filter): OTT 필터 중복 선택 수정
docs: 실행 방법 보완
```

저장소를 처음 받은 뒤 아래 명령을 한 번 실행하면 커밋 템플릿과 메시지 검증 훅이 설정됩니다.

```bash
npm run git:setup
```

세부 규칙은 [CONTRIBUTING.md](./CONTRIBUTING.md)에서 확인할 수 있습니다.

모든 변경은 작업 브랜치와 PR을 통해 `main`에 병합합니다. PR에서는 제목 형식, lint, 테스트를 GitHub Actions로 자동 검사하며 리뷰 방식은 [코드 리뷰 가이드](./docs/CODE_REVIEW.md)를 따릅니다.

팀에서 사용하는 React, Cloudflare, Playwright, 보안 및 프로젝트 전용 리뷰 skills는 `.agents/skills/`에 함께 버전 관리합니다. 설치 출처와 고정 버전은 [Agent skills 문서](./docs/AGENT_SKILLS.md)에서 확인할 수 있습니다. 저장소를 처음 받거나 skill이 변경된 뒤에는 Codex를 다시 시작해 주세요.

## 현재 상태

추천 흐름과 UI를 검증할 수 있는 프로토타입 단계입니다. 실제 OTT 카탈로그, 사용자 계정, 추천 기록 저장 기능은 이후 연동이 필요합니다.
