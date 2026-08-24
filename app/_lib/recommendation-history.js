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

/**
 * 새 콘텐츠를 먼저 추천하고, 자리가 부족할 때만 오래전에 본 콘텐츠부터 채운다.
 * `watchedContentKeys`는 최근 시청순으로 전달된다고 가정한다.
 *
 * @template T
 * @param {T[]} candidates
 * @param {string[]} watchedContentKeys
 * @param {(content: T) => string} contentKeyOf
 * @param {number} offset
 * @param {number} limit
 * @returns {{ item: T, previouslyWatched: boolean }[]}
 */
export function selectRecommendationCandidates(
  candidates,
  watchedContentKeys,
  contentKeyOf,
  offset,
  limit
) {
  const watchedOrder = new Map(watchedContentKeys.map((key, index) => [key, index]));
  const unseen = candidates.filter((item) => !watchedOrder.has(contentKeyOf(item)));
  const watched = candidates
    .filter((item) => watchedOrder.has(contentKeyOf(item)))
    .sort(
      (a, b) =>
        (watchedOrder.get(contentKeyOf(b)) ?? -1) -
        (watchedOrder.get(contentKeyOf(a)) ?? -1)
    );

  const rotate = (items) => {
    if (items.length === 0) return items;
    const start = offset % items.length;
    return [...items.slice(start), ...items.slice(0, start)];
  };

  const selectedUnseen = rotate(unseen).slice(0, limit);
  const selectedWatched = rotate(watched).slice(0, limit - selectedUnseen.length);

  return [
    ...selectedUnseen.map((item) => ({ item, previouslyWatched: false })),
    ...selectedWatched.map((item) => ({ item, previouslyWatched: true })),
  ];
}
