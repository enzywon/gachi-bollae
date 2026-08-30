const TAG_BY_GENRE = new Map([
  [9648, "추리"], [35, "코미디"], [18, "드라마"], [878, "SF"],
  [10765, "SF"], [10749, "로맨스"], [10764, "예능"], [10767, "예능"],
]);

const PROVIDER_NAMES = new Map([
  ["Netflix", "Netflix"], ["Disney Plus", "Disney+"], ["TVING", "TVING"],
  ["Coupang Play", "Coupang Play"],
]);

function providerOf(details) {
  const providers = details["watch/providers"]?.results?.KR?.flatrate ?? [];
  const known = providers.find((provider) => PROVIDER_NAMES.has(provider.provider_name));
  return known ? PROVIDER_NAMES.get(known.provider_name) : "제공처 확인 필요";
}

function moodsOf(tags) {
  const moods = [];
  if (tags.includes("코미디") || tags.includes("예능")) moods.push("웃고 싶어요");
  if (tags.includes("추리")) moods.push("긴장감", "몰입");
  if (tags.includes("드라마") || tags.includes("로맨스")) moods.push("따뜻함", "감동");
  if (tags.includes("SF")) moods.push("몰입");
  return [...new Set(moods.length > 0 ? moods : ["몰입"])];
}

function contextsOf(runtime) {
  const contexts = ["집중해서 보기"];
  if (runtime <= 60) contexts.push("자기 전", "편하게 보기");
  if (runtime <= 40) contexts.push("식사 중");
  return contexts;
}

/** TMDB 상세 응답을 추천 엔진이 사용하는 공통 콘텐츠 형식으로 변환한다. */
export function tmdbDetailsToContent(details, mediaType) {
  const genreIds = (details.genres ?? []).map((genre) => genre.id);
  const tags = [...new Set(genreIds.map((id) => TAG_BY_GENRE.get(id)).filter(Boolean))];
  const isVariety = mediaType === "tv" && (genreIds.includes(10764) || genreIds.includes(10767));
  const runtime = mediaType === "movie"
    ? details.runtime
    : details.episode_run_time?.[0] ?? details.last_episode_to_air?.runtime;

  if (!details.id || (!details.title && !details.name) || !Number.isInteger(runtime) || runtime <= 0) return null;

  return {
    id: mediaType === "movie" ? details.id : -details.id,
    source: "tmdb",
    mediaType,
    title: details.title ?? details.name,
    eyebrow: tags.length > 0 ? tags.join(" · ") : mediaType === "movie" ? "오늘의 인기 영화" : "오늘의 인기 시리즈",
    runtime,
    format: mediaType === "movie" ? "영화" : isVariety ? "예능" : "시리즈",
    provider: providerOf(details),
    synopsis: details.overview?.trim() || "TMDB에서 작품 소개를 준비하고 있어요.",
    tags,
    avoid: [],
    contexts: contextsOf(runtime),
    moods: moodsOf(tags),
    palette: mediaType === "movie" ? "poster-gold" : "poster-blue",
    posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
    safetyKnown: false,
  };
}
