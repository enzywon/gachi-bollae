import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startServer } from "./helpers/server.mjs";

/**
 * 실행 중인 서버에 요청을 보내 서버 검증 규칙을 확인한다. PRD 10.2.
 *
 * DATABASE_URL 없이 실행되므로 저장소에 닿기 전에 끝나는 경로만 다룬다.
 * 검증은 모두 DB 호출 이전에 수행되기 때문에 이 범위로도 규칙을 확인할 수 있다.
 */

let server;

before(async () => {
  // 저장소에 닿기 전 경로만 검증하는 스위트다. 개발 환경이나 CI에 DATABASE_URL이 있으면
  // 유효한 POST가 실제 DB에 행을 쓰므로 자식 프로세스에서 명시적으로 비운다.
  server = await startServer({ env: { DATABASE_URL: "" } });
});

after(async () => {
  await server?.stop();
});

function call(path, init = {}) {
  return fetch(`${server.baseUrl}${path}`, init);
}

function post(body, { cookie } = {}) {
  return call("/api/records", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** UTC 기준으로 이틀 뒤면 KST에서도 확실히 미래다. */
function futureDate() {
  const value = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
}

const VALID = {
  contentKey: "demo:5",
  contentTitle: "마지막 목격자",
  contentFormat: "영화",
  watchStatus: "completed",
  finishedOn: "2026-01-02",
  rating: 4,
};

const SERIES = {
  ...VALID,
  contentKey: "demo:2",
  contentTitle: "사라진 초대장",
  contentFormat: "시리즈",
};

test("기록이 없는 방문자는 빈 목록을 받는다", async () => {
  const response = await call("/api/records");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { groups: [], unrated: [], totalRecords: 0 });
});

test("쿠키 없이 개별 기록에 접근하면 404다", async () => {
  const response = await call("/api/records/1");
  assert.equal(response.status, 404);
});

/** 소유자 쿠키가 바뀐 뒤 같은 URL로 이전 응답이 재사용되면 안 된다. */
test("기록 조회 응답은 캐시되지 않는다", async () => {
  for (const path of ["/api/records", "/api/records/1"]) {
    const response = await call(path);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/, path);
  }
});

test("본문이 올바른 JSON이 아니면 500이 아니라 400이다", async () => {
  const response = await call("/api/records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not json",
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /JSON/);
});

test("정수가 아닌 시즌 번호는 조용히 버리지 않고 거부한다", async () => {
  const response = await post({ ...SERIES, seasonNumber: "1.5" });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /시즌 번호/);
});

test("음수 시즌 번호는 거부한다", async () => {
  const response = await post({ ...SERIES, seasonNumber: "-1" });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /시즌 번호/);
});

test("기록 식별자가 정수가 아니면 404다", async () => {
  const response = await call("/api/records/abc", {
    method: "DELETE",
    headers: { cookie: "gb_owner=test-owner" },
  });
  assert.equal(response.status, 404);
});

test("별점 범위를 벗어나면 거부한다", async () => {
  for (const rating of [0, 6, 3.5]) {
    const response = await post({ ...VALID, rating });
    assert.equal(response.status, 400, `rating=${rating}`);
    assert.match((await response.json()).error, /별점/);
  }
});

test("한 줄 감상이 200자를 넘으면 거부한다", async () => {
  const response = await post({ ...VALID, shortComment: "가".repeat(201) });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /200자/);
});

test("영화 기록에 시즌 번호가 오면 거부한다", async () => {
  const response = await post({ ...VALID, seasonNumber: 1 });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /시즌 번호/);
});

test("시리즈는 시즌 번호를 받아들인다", async () => {
  // 검증을 통과하면 저장 단계로 넘어가므로 400이 아니어야 한다.
  const response = await post({ ...SERIES, seasonNumber: 1 });

  assert.notEqual(response.status, 400);
});

test("미래 날짜는 거부한다", async () => {
  const response = await post({ ...VALID, finishedOn: futureDate() });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /미래 날짜/);
});

test("종료일이 시작일보다 빠르면 거부한다", async () => {
  const response = await post({ ...VALID, startedOn: "2026-01-05", finishedOn: "2026-01-02" });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /종료일/);
});

test("다 봤어요 상태에 종료일이 없으면 거부한다", async () => {
  const response = await post({ ...VALID, finishedOn: null });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /종료일/);
});

test("보는 중 상태에 시작일이 없으면 거부한다", async () => {
  const response = await post({ ...VALID, watchStatus: "watching", finishedOn: null });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /시작일/);
});

test("정의되지 않은 시청 상태는 거부한다", async () => {
  const response = await post({ ...VALID, watchStatus: "paused" });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /시청 상태/);
});

test("별점 없이 한 줄 감상만 남길 수 없다", async () => {
  const response = await post({ ...VALID, rating: null, shortComment: "좋았어요" });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /별점/);
});

test("평가 저장에는 별점이 필수다", async () => {
  const response = await call("/api/records/1/review", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: "gb_owner=test-owner" },
    body: JSON.stringify({ shortComment: "감상만" }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /별점/);
});

/** 저장소가 없으면 500으로 뭉뚱그리지 않고 안내 가능한 503으로 답한다. PRD 11.1. */
test("DATABASE_URL이 없으면 503으로 안내한다", async () => {
  const response = await post(VALID, { cookie: "gb_owner=test-owner" });

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "storage_unavailable");
});

test("함께 본 목록 화면이 렌더링된다", async () => {
  const response = await call("/records", { headers: { accept: "text/html" } });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), /함께 본 목록/);
});
