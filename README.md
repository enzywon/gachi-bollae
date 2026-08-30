<div align="center">

# 같이볼래

**상황과 취향을 함께 고려해, 오늘 볼 콘텐츠를 3분 안에 고르는 서비스**

[서비스 체험하기](https://gachi-bollae.vercel.app) · [기능 요구사항](./docs/gachi-bollae-rating-prd-v0.1.md)

[![CI](https://github.com/enzywon/gachi-bollae/actions/workflows/ci.yml/badge.svg)](https://github.com/enzywon/gachi-bollae/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-Neon-00E599?logo=postgresql&logoColor=white)

</div>

## 프로젝트 소개

콘텐츠를 고를 때는 작품이 부족해서보다 **지금 상황에 맞는 한 편을 함께 결정하기 어려워서** 시간이 오래 걸립니다. 같이볼래는 장르 검색부터 시작하는 대신, 식사 중인지 자기 전인지와 같은 시청 맥락을 먼저 묻습니다. 혼자 볼 때는 내 취향을, 같이 볼 때는 두 사람의 취향이 겹치는 지점을 반영해 세 작품으로 선택지를 좁혀 줍니다.

추천으로 끝내지 않고 선택한 콘텐츠와 감상을 기록합니다. 남긴 별점은 다음 추천의 태그 가중치에 반영되고, 이미 본 작품은 새 후보에서 자동으로 제외됩니다.

> 현재는 제품 흐름과 기술 구조를 검증하는 프로토타입입니다. 콘텐츠는 프로젝트를 위해 만든 데모 데이터 6건을 사용하며, 실제 OTT 카탈로그와 사용자 계정은 아직 연동하지 않았습니다.

## 핵심 경험

### 1. 상황에서 시작하는 추천

`식사 중`, `자기 전`, `집중해서 보기`, `편하게 보기` 중 현재 상황을 고른 뒤 원하는 분위기와 취향을 입력합니다. 재생 시간, 콘텐츠 형식, OTT는 필수 조건으로 적용하고 피하고 싶은 소재는 결과에서 제외합니다.

### 2. 두 사람의 취향을 함께 반영

같이 보기에서는 각자의 취향과 공통 취향을 구분해 점수를 계산합니다. 한 사람의 선택만 강하게 반영되지 않도록 공통으로 좋아하는 태그에 별도 가중치를 주고, 결과 카드에서 조건 적합도를 확인할 수 있습니다.

### 3. 세 작품으로 좁힌 결과

조건을 만족하는 전체 목록을 그대로 보여주는 대신 점수가 높은 세 작품만 제안합니다. 마음에 드는 결과가 없으면 같은 조건 안에서 다른 후보를 다시 받을 수 있고, 결과가 없을 때는 조건을 완화할 수 있도록 안내합니다.

### 4. 시청 기록과 평가

추천 결과에서 시청 상태, 날짜, 시즌, 메모, 별점과 한 줄 감상을 저장할 수 있습니다. 함께 본 목록에서는 작품별 기록과 재시청 여부를 확인하고, 미평가 기록을 나중에 이어서 평가하거나 기존 평가를 수정할 수 있습니다.

별점 3점을 중립으로 삼아 4~5점 작품의 태그는 다음 추천에서 가산하고 1~2점 작품의 태그는 감산합니다. 추천 카드에는 과거 평가에서 반영된 취향을 이유로 표시합니다.

## 구현에서 고민한 지점

- **설명 가능한 추천:** 상황, 분위기, 내 취향, 공통 취향을 분리해 점수화하고 선택한 조건에서 가능한 최고 점수를 기준으로 적합도를 계산했습니다.
- **필터와 랭킹의 역할 분리:** 재생 시간·형식·OTT·회피 소재는 통과 여부를 결정하고, 상황과 취향은 통과한 후보의 순서를 결정하도록 구분했습니다.
- **과거 기록 보존:** 외부 콘텐츠 API로 전환하더라도 기록이 깨지지 않도록 제목, 형식, 제공처 등 콘텐츠 정보를 기록 시점의 스냅샷으로 저장합니다.
- **확장 가능한 평가 구조:** 현재는 한 명이 평가하지만, 이후 2인 블라인드 평가를 추가할 때 테이블을 다시 분리하지 않도록 시청 기록과 평가를 별도 테이블로 설계했습니다.
- **데이터베이스 장애 격리:** DB가 없어도 추천 기능과 화면은 정상 동작하고, 저장 기능만 명확한 503 응답으로 저하되도록 구성했습니다.
- **기기 단위 데이터 분리:** 로그인 전 프로토타입에서는 `HttpOnly`, `SameSite=Lax`, 운영 환경의 `Secure` 속성을 가진 익명 소유자 쿠키로 기록을 구분합니다. 실제 사용자 도입 전에는 인증 체계로 교체할 예정입니다.

## 기술 구성

| 영역 | 기술 | 사용 목적 |
| --- | --- | --- |
| Web | Next.js 16 App Router, React 19, TypeScript | 추천 흐름, 기록 화면, Route Handler API |
| Styling | Tailwind CSS 4 | 모바일 우선 반응형 UI |
| Data | Neon Postgres, Drizzle ORM | 시청 기록·평가 저장과 스키마 관리 |
| Quality | ESLint, Node.js Test Runner | 정적 검사, 빌드·렌더링·API 회귀 테스트 |
| Delivery | GitHub Actions, Vercel | PR 품질 검사와 프리뷰·프로덕션 배포 |

## 데이터 흐름

```text
시청 모드 선택
  → 상황·분위기·각자의 취향 입력
  → 필수 조건으로 후보 필터링
  → 맥락과 취향 점수로 정렬
  → 추천 3개와 적합도 제공
  → 선택·시청 기록·평가 저장
  → 함께 본 목록에서 조회·수정
```

## 로컬 실행

### 요구 사항

- Node.js 22.13 이상인 22.x 또는 Node.js 24 이상
- npm

```bash
git clone https://github.com/enzywon/gachi-bollae.git
cd gachi-bollae
npm ci
npm run dev
```

추천 흐름은 데이터베이스 없이 실행할 수 있습니다. 기록과 평가 기능까지 사용하려면 Neon에서 Postgres 프로젝트를 만든 뒤 `.env.local`에 연결 문자열을 설정합니다.

```dotenv
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

```bash
npm run db:migrate
```

`DATABASE_URL_UNPOOLED`은 마이그레이션용 직결 주소이며, 없으면 `DATABASE_URL`을 사용합니다. `.env*` 파일은 Git에서 제외됩니다.

### 검증 명령어

```bash
npm run lint
npm test
npm run build
```

`npm test`는 프로덕션 빌드 후 렌더링 결과와 기록 API의 정상·실패 경로를 검사합니다.

## 프로젝트 구조

```text
app/        추천·기록 UI, Route Handler, 도메인 보조 코드
db/         Drizzle 스키마와 지연 연결 방식의 DB 클라이언트
drizzle/    버전 관리되는 SQL 마이그레이션
docs/       기능 요구사항과 개발·리뷰 가이드
scripts/    Git 훅, PR 흐름, AI 리뷰 자동화
tests/      렌더링과 기록 API 회귀 테스트
```

## 현재 범위와 다음 단계

현재 구현은 추천 경험, 기록·평가 데이터 모델, 모바일 중심 UI를 검증하는 단계입니다.

- 실제 콘텐츠 카탈로그와 OTT 제공처 API 연동
- 로그인과 사용자·그룹 단위 권한 모델 도입
- 두 사람의 블라인드 평가와 결과 공개 흐름
- 상황·무드별 평가와 행동 데이터를 활용한 개인화 추천 고도화
- 추천 품질을 측정할 수 있는 행동 데이터와 지표 설계

상세한 기록·평가 정책과 단계별 확장 방향은 [평가 기능 PRD](./docs/gachi-bollae-rating-prd-v0.1.md)에 정리되어 있습니다.

## 협업과 품질 관리

모든 변경은 작업 브랜치와 draft PR을 통해 진행합니다. GitHub Actions에서 PR 제목, lint, 프로덕션 빌드와 테스트를 검사하며, 코드 리뷰 기준은 [코드 리뷰 가이드](./docs/CODE_REVIEW.md)를 따릅니다. 저장소에 포함된 프로젝트 전용 agent skills는 추천 규칙, 데이터 접근, 보안과 테스트 관점을 일관되게 유지하는 데 사용합니다.
