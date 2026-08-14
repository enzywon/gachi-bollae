/** 별점 3점은 중립, 4~5점은 선호, 1~2점은 비선호 신호로 바꾼다. */
export function ratingSignal(rating) {
  return (rating ?? 3) - 3;
}

/**
 * 기록 스냅샷을 데모 카탈로그의 태그 취향으로 집계한다.
 * 같은 작품을 다시 본 평가는 각각 독립된 신호로 취급한다.
 *
 * @template {{ tags: string[] }} T
 * @param {import("./types").RecordListResponse} data
 * @param {T[]} contents
 * @param {(content: T) => string} contentKeyOf
 * @returns {{ watchedContentKeys: string[], tagWeights: Record<string, number> }}
 */
export function historyFromRecords(data, contents, contentKeyOf) {
  /** @type {Record<string, number>} */
  const tagWeights = {};

  for (const group of data.groups) {
    const content = contents.find((item) => contentKeyOf(item) === group.contentKey);
    if (!content) continue;

    for (const record of group.records) {
      const signal = ratingSignal(record.review?.rating);
      for (const tag of content.tags) tagWeights[tag] = (tagWeights[tag] ?? 0) + signal;
    }
  }

  return { watchedContentKeys: data.groups.map((group) => group.contentKey), tagWeights };
}

/**
 * @param {{ tags: string[] }} content
 * @param {Record<string, number>} tagWeights
 * @param {number} pointsPerWeight
 */
export function historyPointsFor(content, tagWeights, pointsPerWeight) {
  return content.tags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0) * pointsPerWeight, 0);
}

/**
 * @param {{ tags: string[] }} content
 * @param {Record<string, number>} tagWeights
 * @returns {string | null}
 */
export function strongestPositiveTag(content, tagWeights) {
  return content.tags
    .filter((tag) => (tagWeights[tag] ?? 0) > 0)
    .sort((a, b) => (tagWeights[b] ?? 0) - (tagWeights[a] ?? 0))[0] ?? null;
}
