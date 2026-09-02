import assert from "node:assert/strict";
import test from "node:test";
import { tmdbDetailsToContent } from "../app/_lib/tmdb-catalog.js";

test("TMDB 영화 상세를 추천 콘텐츠로 변환한다", () => {
  const content = tmdbDetailsToContent({ id: 11, title: "별들의 전쟁", runtime: 121,
    overview: "은하계의 모험", poster_path: "/poster.jpg", genres: [{ id: 878 }, { id: 18 }],
    keywords: { keywords: [{ id: 123, name: "space" }, { id: 456, name: "friendship" }] },
    release_dates: { results: [{ iso_3166_1: "KR", release_dates: [{ certification: "12" }] }] },
    vote_average: 8.1, vote_count: 900,
    "watch/providers": { results: { KR: { flatrate: [{ provider_name: "Disney Plus" }] } } },
  }, "movie");
  assert.equal(content.id, 11);
  assert.equal(content.format, "영화");
  assert.equal(content.provider, "Disney+");
  assert.deepEqual(content.tags, ["SF", "드라마"]);
  assert.equal(content.posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.deepEqual(content.keywordIds, [123, 456]);
  assert.deepEqual(content.keywordNames, ["space", "friendship"]);
  assert.equal(content.certification, "12");
  assert.equal(content.voteAverage, 8.1);
  assert.equal(content.voteCount, 900);
  assert.deepEqual(content.moods, ["따뜻함", "감동", "몰입"]);
  assert.equal(content.safetyKnown, false);
});

test("TMDB TV 예능은 영화와 겹치지 않는 음수 id를 사용한다", () => {
  const content = tmdbDetailsToContent({ id: 11, name: "같이 웃는 밤", episode_run_time: [48],
    overview: "함께 웃는 예능", genres: [{ id: 10764 }, { id: 35 }],
    keywords: { results: [{ id: 789, name: "satire" }] },
    content_ratings: { results: [{ iso_3166_1: "KR", rating: "15" }] },
  }, "tv");
  assert.equal(content.id, -11);
  assert.equal(content.format, "예능");
  assert.deepEqual(content.tags, ["예능", "코미디"]);
  assert.deepEqual(content.keywordIds, [789]);
  assert.equal(content.certification, "15");
});

test("러닝타임을 알 수 없는 콘텐츠는 추천 후보에서 제외한다", () => {
  assert.equal(tmdbDetailsToContent({ id: 1, title: "시간 없음", genres: [] }, "movie"), null);
});

test("등급이 없어도 TMDB 키워드에서 함께 보기 주의 소재를 찾는다", () => {
  const content = tmdbDetailsToContent({
    id: 22,
    title: "주의가 필요한 작품",
    runtime: 55,
    genres: [{ id: 18 }],
    keywords: { keywords: [{ id: 1, name: "sexuality" }, { id: 2, name: "gore" }] },
  }, "movie");

  assert.deepEqual(content.avoid, ["잔인함·고어", "선정적인 장면"]);
});
