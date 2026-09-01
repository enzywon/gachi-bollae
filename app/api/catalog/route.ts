import { CONTENTS } from "../../_data/contents";
import { tmdbDetailsToContent } from "../../_lib/tmdb-catalog";

const TMDB_API = "https://api.themoviedb.org/3";
type MediaType = "movie" | "tv";
type PopularItem = { id: number };
const POPULAR_PAGES = [1, 2, 3];
const ITEMS_PER_PAGE = 6;

async function tmdbFetch(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${TMDB_API}${path}`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    next: { revalidate: 21_600 },
  });
  if (!response.ok) throw new Error(`TMDB 요청 실패: ${response.status}`);
  return response.json();
}

async function popularDetails(mediaType: MediaType, token: string) {
  const popularPages = await Promise.all(POPULAR_PAGES.map((page) =>
    tmdbFetch(`/${mediaType}/popular?language=ko-KR&region=KR&page=${page}`, token) as Promise<{ results?: PopularItem[] }>
  ));
  const popular = popularPages.flatMap((page) => page.results?.slice(0, ITEMS_PER_PAGE) ?? []).filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const results = await Promise.allSettled(popular.map((item) =>
    tmdbFetch(`/${mediaType}/${item.id}?language=ko-KR&append_to_response=watch%2Fproviders`, token)
  ));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

export async function GET() {
  const token = process.env.TMDB_API_TOKEN?.trim();
  if (!token) return Response.json({ source: "demo", contents: CONTENTS });

  try {
    const [movies, tv] = await Promise.all([popularDetails("movie", token), popularDetails("tv", token)]);
    const contents = [
      ...movies.map((item) => tmdbDetailsToContent(item, "movie")),
      ...tv.map((item) => tmdbDetailsToContent(item, "tv")),
    ].filter((item) => item !== null);
    if (contents.length < 3) throw new Error("추천에 필요한 TMDB 콘텐츠가 부족합니다.");
    return Response.json({ source: "tmdb", contents });
  } catch {
    return Response.json({ source: "demo", contents: CONTENTS });
  }
}
