import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export const MISSING_DATABASE_URL = "DATABASE_URL is not set";

type Db = ReturnType<typeof createDb>;

function createDb(url: string) {
  return drizzle(neon(url), { schema });
}

let cached: Db | null = null;

/**
 * 요청마다 새로 붙지 않도록 연결을 모듈 수준에서 재사용한다.
 *
 * 연결은 최초 호출 시점에 만든다. import 시점에 만들면 `DATABASE_URL` 없이도
 * 동작해야 하는 추천 흐름과 렌더링 테스트까지 함께 죽는다.
 */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(MISSING_DATABASE_URL);
  }

  if (!cached) {
    cached = createDb(url);
  }

  return cached;
}
