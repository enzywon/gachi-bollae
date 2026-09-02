import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendationPool,
  contentSimilarity,
  recommendationScore,
} from "../app/_lib/recommendation-pool.js";

const candidate = (id, tags, moods = ["몰입"]) => ({
  id,
  tags,
  moods,
  format: "시리즈",
  runtime: 40 + id,
});

const candidates = [
  candidate(1, ["드라마"]),
  candidate(2, ["드라마"]),
  candidate(3, ["드라마"]),
  candidate(4, ["드라마"]),
  candidate(5, ["추리"]),
  candidate(6, ["SF"]),
  candidate(7, ["코미디"]),
];

test("같은 세션 seed에는 후보 순서가 고정된다", () => {
  const options = { candidates, selectedMoods: ["몰입"], selectedGenres: [], recentIds: [], seed: 42, limit: 6 };
  assert.deepEqual(buildRecommendationPool(options), buildRecommendationPool(options));
});

test("최근 노출되지 않은 후보를 먼저 보여준다", () => {
  const pool = buildRecommendationPool({
    candidates,
    selectedMoods: ["몰입"],
    selectedGenres: [],
    recentIds: [1, 2, 3, 4],
    seed: 7,
    limit: 4,
  });

  assert.deepEqual(new Set(pool.slice(0, 3).map((item) => item.id)), new Set([5, 6, 7]));
});

test("후보가 충분하면 한 주 장르가 두 개를 넘지 않는다", () => {
  const pool = buildRecommendationPool({
    candidates,
    selectedMoods: ["몰입"],
    selectedGenres: ["드라마"],
    recentIds: [],
    seed: 11,
    limit: 5,
  });

  assert.equal(pool.filter((item) => item.tags[0] === "드라마").length, 2);
  assert.equal(pool.length, 5);
});

test("선택한 분위기의 TMDB 키워드와 신뢰도 있는 평점을 점수에 반영한다", () => {
  const plain = candidate(10, ["드라마"], ["몰입"]);
  const enriched = {
    ...candidate(11, ["드라마"], ["몰입"]),
    keywordNames: ["investigation", "conspiracy"],
    voteAverage: 8.2,
    voteCount: 1200,
  };

  assert.ok(
    recommendationScore(enriched, ["몰입"], ["드라마"]) >
      recommendationScore(plain, ["몰입"], ["드라마"]),
  );
});

test("공통 키워드가 많은 작품은 서로 유사한 후보로 판단한다", () => {
  const first = { ...candidate(20, ["추리"]), keywordIds: [1, 2, 3] };
  const similar = { ...candidate(21, ["추리"]), keywordIds: [1, 2, 3, 4] };
  const different = { ...candidate(22, ["코미디"]), keywordIds: [8, 9] };

  assert.ok(contentSimilarity(first, similar) > 0.55);
  assert.equal(contentSimilarity(first, different), 0);
});
