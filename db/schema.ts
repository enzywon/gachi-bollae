import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * 시청 기록. PRD 9.1 참고.
 *
 * 콘텐츠 정보는 참조만 저장하지 않고 기록 시점의 값을 함께 남긴다.
 * 데모 콘텐츠 배열이 바뀌거나 외부 API로 교체되어도 과거 기록이 깨지지 않게 하기 위해서다.
 */
export const watchRecords = sqliteTable(
  "watch_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // 쿠키로 발급한 익명 소유자 키. 2인 평가 도입 시 그룹 식별자로 승격한다.
    ownerKey: text("owner_key").notNull(),

    // "demo:5" 형태. 외부 API 도입 시 "tmdb:movie:12345"로 확장한다.
    contentKey: text("content_key").notNull(),

    // 기록 시점의 콘텐츠 스냅샷
    contentTitle: text("content_title").notNull(),
    contentFormat: text("content_format").notNull(), // 영화 | 시리즈 | 예능
    contentProvider: text("content_provider"),
    contentRuntime: integer("content_runtime"),
    posterPalette: text("poster_palette"),

    // 추천 맥락 스냅샷
    watchMode: text("watch_mode"), // solo | together
    pickedContext: text("picked_context"),
    pickedMood: text("picked_mood"),

    watchStatus: text("watch_status").notNull(), // watching | completed | dropped
    startedOn: text("started_on"), // KST YYYY-MM-DD
    finishedOn: text("finished_on"), // KST YYYY-MM-DD
    seasonNumber: integer("season_number"), // 영화는 null
    memo: text("memo"),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // 재시청을 허용하므로 콘텐츠 단위 유니크 제약은 두지 않는다.
    index("watch_records_owner_idx").on(table.ownerKey),
    index("watch_records_owner_content_idx").on(table.ownerKey, table.contentKey),
  ]
);

/**
 * 평가. PRD 9.2 참고.
 *
 * 평가자가 1인이라 watch_records와 합칠 수 있지만,
 * 합치면 2인 블라인드 도입 시 테이블을 쪼개는 마이그레이션이 필요해진다.
 */
export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    watchRecordId: integer("watch_record_id")
      .notNull()
      .references(() => watchRecords.id, { onDelete: "cascade" }),

    // 현재는 "me" 고정. 2인 도입 시 "a" / "b"로 확장한다.
    raterKey: text("rater_key").notNull().default("me"),

    rating: integer("rating").notNull(), // 1~5 정수
    shortComment: text("short_comment"), // 최대 200자

    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    editCount: integer("edit_count").notNull().default(0),
    editedAt: text("edited_at"),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("reviews_record_rater_uniq").on(table.watchRecordId, table.raterKey)]
);

export type WatchRecordRow = typeof watchRecords.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
