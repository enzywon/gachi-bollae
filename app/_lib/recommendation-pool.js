function seededRank(id, seed) {
  let value = (Math.abs(id) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

const MOOD_KEYWORDS = new Map([
  ["웃고 싶어요", /comedy|funny|humor|satire|parody|feel.good/],
  ["긴장감", /murder|crime|conspiracy|revenge|survival|serial killer|investigation|chase|hostage/],
  ["따뜻함", /family|friendship|healing|community|romance|coming.of.age|feel.good/],
  ["감동", /family|friendship|illness|biography|based on novel|coming.of.age|grief|redemption/],
  ["몰입", /mystery|investigation|conspiracy|survival|space|time travel|superhero|historical fiction/],
]);

export function recommendationScore(item, selectedMoods, selectedGenres) {
  const moodPoints = item.moods.reduce(
    (sum, mood) => sum + selectedMoods.filter((selected) => selected === mood).length * 3,
    0,
  );
  const genrePoints = item.tags.reduce(
    (sum, tag) => sum + selectedGenres.filter((selected) => selected === tag).length * 2,
    0,
  );
  const keywordText = (item.keywordNames ?? []).join(" ").toLowerCase();
  const keywordPoints = selectedMoods.reduce(
    (sum, mood) => sum + (MOOD_KEYWORDS.get(mood)?.test(keywordText) ? 2 : 0),
    0,
  );
  const voteAverage = item.voteAverage ?? 0;
  const voteCount = item.voteCount ?? 0;
  const qualityPoints = voteCount >= 500 && voteAverage >= 7.5
    ? 2
    : voteCount >= 50 && voteAverage >= 6.5
      ? 1
      : voteCount >= 100 && voteAverage < 5
        ? -1
        : 0;
  return moodPoints + genrePoints + keywordPoints + qualityPoints;
}

function similarityTokens(item) {
  return new Set([
    ...item.tags.map((tag) => `tag:${tag}`),
    ...(item.keywordIds ?? []).map((id) => `keyword:${id}`),
  ]);
}

export function contentSimilarity(first, second) {
  const a = similarityTokens(first);
  const b = similarityTokens(second);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

/**
 * 취향 적합도를 우선하되 최근 노출과 장르 쏠림을 줄여 한 세션의 후보를 구성한다.
 * 같은 seed에는 항상 같은 순서를 반환해 두 사람이 동일한 후보를 보게 한다.
 */
export function buildRecommendationPool({
  candidates,
  selectedMoods,
  selectedGenres,
  recentIds,
  seed,
  limit,
}) {
  const recent = new Set(recentIds);
  const scored = candidates
    .map((item) => {
      const score = recommendationScore(item, selectedMoods, selectedGenres);
      return {
        item,
        score,
        scoreBand: Math.floor(score / 5),
        recent: recent.has(item.id),
        rank: seededRank(item.id, seed),
      };
    })
    .sort((a, b) => Number(a.recent) - Number(b.recent) || b.scoreBand - a.scoreBand || a.rank - b.rank || b.score - a.score || a.item.runtime - b.item.runtime);

  const selected = [];
  const selectedIds = new Set();
  const genreCounts = new Map();

  const selectCandidates = (genreLimit, similarityLimit) => {
    for (const candidate of scored) {
      if (selectedIds.has(candidate.item.id)) continue;
      const primaryGenre = candidate.item.tags[0] ?? candidate.item.format;
      if ((genreCounts.get(primaryGenre) ?? 0) >= genreLimit) continue;
      if (selected.some((item) => contentSimilarity(item, candidate.item) > similarityLimit)) continue;
      selected.push(candidate.item);
      selectedIds.add(candidate.item.id);
      genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) ?? 0) + 1);
      if (selected.length === limit) return true;
    }
    return false;
  };

  if (selectCandidates(2, 0.55)) return selected;
  if (selectCandidates(2, 1)) return selected;

  for (const candidate of scored) {
    if (selectedIds.has(candidate.item.id)) continue;
    selected.push(candidate.item);
    if (selected.length === limit) break;
  }

  return selected;
}
