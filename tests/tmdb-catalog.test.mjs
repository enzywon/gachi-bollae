import assert from "node:assert/strict";
import test from "node:test";
import { discoverPathFor, genreIdsFor, pageForSeed, tmdbDetailsToContent } from "../app/_lib/tmdb-catalog.js";

test("오늘 고른 장르를 TMDB discover 장르 ID로 변환한다", () => {
  assert.deepEqual(genreIdsFor(["코미디", "추리", "코미디", "알 수 없음"]), [35, 9648]);
  const path = discoverPathFor("tv", { genreIds: [35, 9648], page: 3 });
  assert.match(path, /^\/discover\/tv\?/);
  assert.equal(new URL(`https://example.com${path}`).searchParams.get("with_genres"), "35|9648");
  assert.equal(new URL(`https://example.com${path}`).searchParams.get("page"), "3");
});

test("세션 시드는 같은 검색 페이지를 재현하면서 후속 페이지를 순환한다", () => {
  const first = pageForSeed("session-a");
  assert.equal(pageForSeed("session-a"), first);
  assert.equal(pageForSeed("session-a", 1), (first % 5) + 1);
});

test("TMDB 영화 상세를 추천 콘텐츠로 변환한다", () => {
  const content = tmdbDetailsToContent({ id: 11, title: "별들의 전쟁", runtime: 121,
    overview: "은하계의 모험", poster_path: "/poster.jpg", genres: [{ id: 878 }, { id: 18 }],
    "watch/providers": { results: { KR: { flatrate: [{ provider_name: "Disney Plus" }] } } },
  }, "movie");
  assert.equal(content.id, 11);
  assert.equal(content.format, "영화");
  assert.equal(content.provider, "Disney+");
  assert.deepEqual(content.tags, ["SF", "드라마"]);
  assert.equal(content.posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.equal(content.safetyKnown, false);
});

test("TMDB TV 예능은 영화와 겹치지 않는 음수 id를 사용한다", () => {
  const content = tmdbDetailsToContent({ id: 11, name: "같이 웃는 밤", episode_run_time: [48],
    overview: "함께 웃는 예능", genres: [{ id: 10764 }, { id: 35 }],
  }, "tv");
  assert.equal(content.id, -11);
  assert.equal(content.format, "예능");
  assert.deepEqual(content.tags, ["예능", "코미디"]);
});

test("러닝타임을 알 수 없는 콘텐츠는 추천 후보에서 제외한다", () => {
  assert.equal(tmdbDetailsToContent({ id: 1, title: "시간 없음", genres: [] }, "movie"), null);
});
