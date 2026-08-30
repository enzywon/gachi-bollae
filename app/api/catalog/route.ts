import { CONTENTS } from "../../_data/contents";
import { discoverPathFor, genreIdsFor, pageForSeed, tmdbDetailsToContent } from "../../_lib/tmdb-catalog";

const TMDB_API = "https://api.themoviedb.org/3";
type MediaType = "movie" | "tv";
type PopularItem = { id: number };

async function tmdbFetch(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${TMDB_API}${path}`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    next: { revalidate: 21_600 },
  });
  if (!response.ok) throw new Error(`TMDB 요청 실패: ${response.status}`);
  return response.json();
}

async function discoverDetails(mediaType: MediaType, token: string, genreIds: number[], page: number) {
  const discovered = await tmdbFetch(discoverPathFor(mediaType, { genreIds, page }), token) as { results?: PopularItem[] };
  const results = await Promise.allSettled((discovered.results ?? []).slice(0, 20).map((item) =>
    tmdbFetch(`/${mediaType}/${item.id}?language=ko-KR&append_to_response=watch%2Fproviders`, token)
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
    const genreIds = genreIdsFor(genres);
    const firstPage = pageForSeed(seed);
    const mediaTypes: MediaType[] = maxRuntime <= 60 ? ["tv"] : ["tv", "movie"];
    const firstResults = await Promise.all(mediaTypes.map(async (mediaType) => ({
      mediaType,
      items: await discoverDetails(mediaType, token, genreIds, firstPage),
    })));
    const details = firstResults.flatMap(({ mediaType, items }) => items.map((item) => ({ item, mediaType })));
    let contents = details
      .map(({ item, mediaType }) => tmdbDetailsToContent(item, mediaType))
      .filter((item): item is NonNullable<typeof item> => item !== null && item.runtime <= maxRuntime);

    if (contents.length < 12) {
      const nextPage = pageForSeed(seed, 1);
      const moreTv = await discoverDetails("tv", token, genreIds, nextPage);
      contents = [...contents, ...moreTv.map((item) => tmdbDetailsToContent(item, "tv"))
        .filter((item): item is NonNullable<typeof item> => item !== null && item.runtime <= maxRuntime)];
    }

    const unique = [...new Map(contents.map((item) => [`${item.mediaType}:${item.id}`, item])).values()].slice(0, 16);
    if (unique.length < 3) throw new Error("추천에 필요한 TMDB 콘텐츠가 부족합니다.");
    return Response.json({ source: "tmdb", contents: unique, poolSize: unique.length });
  } catch {
    return Response.json({ source: "demo", contents: CONTENTS });
  }
}
