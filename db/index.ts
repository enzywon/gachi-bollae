import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * `cloudflare:workers`를 지연 로딩한다.
 * 최상위에서 import하면 빌드 산출물을 일반 Node로 불러오는 검증 단계
 * (`scripts/validate-artifact.sh`)에서 모듈을 해석하지 못한다.
 */
async function workerEnv(): Promise<{ DB?: D1Database }> {
  const workers = await import("cloudflare:workers");
  return workers.env as { DB?: D1Database };
}

export async function getDb() {
  const env = await workerEnv();

  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
