function seededRank(id, seed) {
  let value = (Math.abs(id) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
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
    .map((item) => ({
      item,
      score:
        item.moods.reduce((sum, mood) => sum + selectedMoods.filter((selected) => selected === mood).length * 3, 0) +
        item.tags.reduce((sum, tag) => sum + selectedGenres.filter((selected) => selected === tag).length * 2, 0),
      recent: recent.has(item.id),
      rank: seededRank(item.id, seed),
    }))
    .sort((a, b) => Number(a.recent) - Number(b.recent) || b.score - a.score || a.rank - b.rank || a.item.runtime - b.item.runtime);

  const selected = [];
  const selectedIds = new Set();
  const genreCounts = new Map();

  for (const candidate of scored) {
    const primaryGenre = candidate.item.tags[0] ?? candidate.item.format;
    if ((genreCounts.get(primaryGenre) ?? 0) >= 3) continue;
    selected.push(candidate.item);
    selectedIds.add(candidate.item.id);
    genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) ?? 0) + 1);
    if (selected.length === limit) return selected;
  }

  for (const candidate of scored) {
    if (selectedIds.has(candidate.item.id)) continue;
    selected.push(candidate.item);
    if (selected.length === limit) break;
  }

  return selected;
}
