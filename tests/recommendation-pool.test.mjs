import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendationPool } from "../app/_lib/recommendation-pool.js";

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

  assert.deepEqual(new Set(pool.slice(0, 2).map((item) => item.id)), new Set([5, 6]));
});

test("후보가 충분하면 한 주 장르가 세 개를 넘지 않는다", () => {
  const pool = buildRecommendationPool({
    candidates,
    selectedMoods: ["몰입"],
    selectedGenres: ["드라마"],
    recentIds: [],
    seed: 11,
    limit: 5,
  });

  assert.equal(pool.filter((item) => item.tags[0] === "드라마").length, 3);
  assert.equal(pool.length, 5);
});
