import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // 마이그레이션은 DDL이라 풀러(PgBouncer)를 거치지 않는 직결로 붙는다.
    // 직결 주소를 주지 않는 환경에서는 일반 접속 문자열로 떨어진다.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
});
