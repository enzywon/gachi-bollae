import { CONTENTS } from "../../_data/contents";
import { discoverPathFor, genreIdsFor, pageForSeed, tmdbDetailsToContent } from "../../_lib/tmdb-catalog";

const TMDB_API = "https://api.themoviedb.org/3";
type MediaType = "movie" | "tv";
type PopularItem = { id: number };
const DISCOVER_PAGE_OFFSETS = [0, 1, 2];
const ITEMS_PER_PAGE = 6;

async function tmdbFetch(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${TMDB_API}${path}`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    next: { revalidate: 21_600 },
  });
  if (!response.ok) throw new Error(`TMDB 요청 실패: ${response.status}`);
  return response.json();
}

async function discoverDetails(mediaType: MediaType, token: string, genreIds: number[], seed: string) {
  const discoveredPages = await Promise.all(DISCOVER_PAGE_OFFSETS.map((offset) =>
    tmdbFetch(discoverPathFor(mediaType, { genreIds, page: pageForSeed(seed, offset) }), token) as Promise<{ results?: PopularItem[] }>
  ));
  const discovered = discoveredPages.flatMap((page) => page.results?.slice(0, ITEMS_PER_PAGE) ?? []).filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const append = mediaType === "movie"
    ? "watch/providers,keywords,release_dates"
    : "watch/providers,keywords,content_ratings";
  const results = await Promise.allSettled(discovered.map((item) =>
    tmdbFetch(`/${mediaType}/${item.id}?language=ko-KR&append_to_response=${encodeURIComponent(append)}`, token)
  ));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

function queryValues(request: Request) {
  const params = new URL(request.url).searchParams;
  const genres = (params.get("genres") ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 4);
  const maxRuntimeValue = Number(params.get("maxRuntime") ?? 60);
  const maxRuntime = Number.isInteger(maxRuntimeValue) && maxRuntimeValue >= 20 && maxRuntimeValue <= 240 ? maxRuntimeValue : 60;
  return { genres, maxRuntime, seed: (params.get("seed") ?? "today").slice(0, 40) };
}

export async function GET(request: Request) {
  const token = process.env.TMDB_API_TOKEN?.trim();
  if (!token) return Response.json({ source: "demo", contents: CONTENTS });

  try {
    const { genres, maxRuntime, seed } = queryValues(request);
    const mediaTypes: MediaType[] = ["tv", "movie"];
    const firstResults = await Promise.all(mediaTypes.map(async (mediaType) => ({
      mediaType,
      items: await discoverDetails(mediaType, token, genreIdsFor(genres, mediaType), seed),
    })));
    const details = firstResults.flatMap(({ mediaType, items }) => items.map((item) => ({ item, mediaType })));
    const contents = details
      .map(({ item, mediaType }) => tmdbDetailsToContent(item, mediaType))
      .filter((item): item is NonNullable<typeof item> => item !== null && item.runtime <= maxRuntime);

    const unique = [...new Map(contents.map((item) => [`${item.mediaType}:${item.id}`, item])).values()].slice(0, 16);
    if (unique.length < 3) throw new Error("추천에 필요한 TMDB 콘텐츠가 부족합니다.");
    return Response.json({ source: "tmdb", contents: unique, poolSize: unique.length });
  } catch {
    return Response.json({ source: "demo", contents: CONTENTS });
  }
}
