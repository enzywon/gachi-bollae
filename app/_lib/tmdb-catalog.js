const TAG_BY_GENRE = new Map([
  [9648, "추리"], [35, "코미디"], [18, "드라마"], [878, "SF"],
  [10765, "SF"], [10749, "로맨스"], [10764, "예능"], [10767, "예능"],
  [28, "액션"], [12, "모험"], [14, "판타지"], [80, "범죄"], [53, "스릴러"],
  [10751, "가족"], [16, "애니메이션"], [99, "다큐멘터리"], [27, "공포"],
  [36, "역사"], [10752, "전쟁"], [10402, "음악"],
]);

const MOOD_KEYWORDS = {
  "웃고 싶어요": /comedy|funny|humor|satire|parody|feel.good/,
  "긴장감": /murder|crime|conspiracy|revenge|survival|serial killer|investigation|chase|hostage/,
  "따뜻함": /family|friendship|healing|community|romance|coming.of.age|feel.good/,
  "감동": /family|friendship|illness|biography|based on novel|coming.of.age|grief|redemption/,
  "몰입": /mystery|investigation|conspiracy|survival|space|time travel|superhero|historical fiction/,
};

const GENRES_BY_TASTE = {
  movie: new Map([
    ["추리", [9648]], ["코미디", [35]], ["드라마", [18]], ["예능", [35]],
    ["SF", [878]], ["로맨스", [10749, 18]],
  ]),
  tv: new Map([
    ["추리", [9648]], ["코미디", [35]], ["드라마", [18]], ["예능", [10764, 10767]],
    ["SF", [10765]], ["로맨스", [18, 10766]],
  ]),
};

/** @param {string[]} tastes @param {"movie" | "tv"} mediaType */
export function genreIdsFor(tastes = [], mediaType = "movie") {
  return [...new Set(tastes.flatMap((taste) => GENRES_BY_TASTE[mediaType].get(taste) ?? []))];
}

/** @param {string} seed @param {number} offset */
export function pageForSeed(seed = "", offset = 0) {
  const hash = [...seed].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return ((hash + offset) % 5) + 1;
}

/**
 * @param {"movie" | "tv"} mediaType
 * @param {{ genreIds?: number[], page?: number }} options
 */
export function discoverPathFor(mediaType, { genreIds = [], page = 1 } = {}) {
  const query = new URLSearchParams({
    language: "ko-KR",
    region: "KR",
    sort_by: "popularity.desc",
    include_adult: "false",
    page: String(page),
  });
  if (genreIds.length > 0) query.set("with_genres", genreIds.join("|"));
  return `/discover/${mediaType}?${query.toString()}`;
}

const PROVIDER_NAMES = new Map([
  ["Netflix", "Netflix"], ["Disney Plus", "Disney+"], ["TVING", "TVING"],
  ["Coupang Play", "Coupang Play"],
]);

function providerOf(details) {
  const providers = details["watch/providers"]?.results?.KR?.flatrate ?? [];
  const known = providers.find((provider) => PROVIDER_NAMES.has(provider.provider_name));
  return known ? PROVIDER_NAMES.get(known.provider_name) : "제공처 확인 필요";
}

function keywordList(details) {
  return details.keywords?.keywords ?? details.keywords?.results ?? [];
}

function certificationOf(details, mediaType) {
  if (mediaType === "tv") {
    return details.content_ratings?.results?.find((item) => item.iso_3166_1 === "KR")?.rating || null;
  }
  const koreanRelease = details.release_dates?.results?.find((item) => item.iso_3166_1 === "KR");
  return koreanRelease?.release_dates?.find((item) => item.certification)?.certification || null;
}

function avoidsOf(keywordNames) {
  const text = keywordNames.join(" ").toLowerCase();
  const avoids = [];
  if (/gore|torture|graphic violence|splatter|brutal violence/.test(text)) avoids.push("잔인함·고어");
  if (/jump scare|supernatural horror|haunted house|demonic possession/.test(text)) avoids.push("공포·깜짝");
  if (/sexuality|nudity|erotic|explicit sex|sexploitation/.test(text)) avoids.push("선정적인 장면");
  if (/sexual violence|rape|child abuse|domestic violence/.test(text)) avoids.push("불쾌한 소재");
  return avoids;
}

function moodsOf(tags, keywordNames) {
  const moods = [];
  if (tags.includes("코미디") || tags.includes("예능")) moods.push("웃고 싶어요");
  if (tags.some((tag) => ["추리", "범죄", "스릴러", "공포"].includes(tag))) moods.push("긴장감", "몰입");
  if (tags.some((tag) => ["드라마", "로맨스", "가족"].includes(tag))) moods.push("따뜻함", "감동");
  if (tags.some((tag) => ["SF", "판타지", "모험", "액션"].includes(tag))) moods.push("몰입");
  const keywordText = keywordNames.join(" ").toLowerCase();
  for (const [mood, pattern] of Object.entries(MOOD_KEYWORDS)) {
    if (pattern.test(keywordText)) moods.push(mood);
  }
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
  const keywords = keywordList(details);
  const keywordIds = keywords.map((keyword) => keyword.id).filter(Number.isInteger);
  const keywordNames = keywords.map((keyword) => keyword.name?.trim()).filter(Boolean);
  const certification = certificationOf(details, mediaType);
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
    avoid: avoidsOf(keywordNames),
    contexts: contextsOf(runtime),
    moods: moodsOf(tags, keywordNames),
    palette: mediaType === "movie" ? "poster-gold" : "poster-blue",
    posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
    safetyKnown: false,
    keywordIds,
    keywordNames,
    certification,
    voteAverage: Number.isFinite(details.vote_average) ? details.vote_average : 0,
    voteCount: Number.isInteger(details.vote_count) ? details.vote_count : 0,
  };
}
