import assert from "node:assert/strict";
import test from "node:test";
import {
  historyFromRecords,
  historyPointsFor,
  ratingSignal,
  strongestPositiveTag,
} from "../app/_lib/recommendation-history.js";

const contents = [
  { id: 1, tags: ["코미디", "예능"] },
  { id: 2, tags: ["코미디", "드라마"] },
];
const contentKeyOf = (content) => `demo:${content.id}`;

test("별점을 중립 기준의 선호 신호로 바꾼다", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(ratingSignal), [-2, -1, 0, 1, 2]);
  assert.equal(ratingSignal(null), 0);
});

test("재시청 평가를 태그별로 누적하고 본 작품을 표시한다", () => {
  const profile = historyFromRecords(
    {
      groups: [
        {
          contentKey: "demo:1",
          records: [
            { review: { rating: 5 } },
            { review: { rating: 4 } },
          ],
        },
        {
          contentKey: "demo:2",
          records: [{ review: { rating: 1 } }],
        },
      ],
    },
    contents,
    contentKeyOf
  );

  assert.deepEqual(profile.watchedContentKeys, ["demo:1", "demo:2"]);
  assert.deepEqual(profile.tagWeights, { 코미디: 1, 예능: 3, 드라마: -2 });
});

test("선호 태그는 추천 점수와 설명 근거가 된다", () => {
  const candidate = { tags: ["코미디", "드라마"] };
  const weights = { 코미디: 2, 드라마: -1 };

  assert.equal(historyPointsFor(candidate, weights, 5), 5);
  assert.equal(strongestPositiveTag(candidate, weights), "코미디");
  assert.equal(strongestPositiveTag(candidate, { 코미디: 0, 드라마: -1 }), null);
});
