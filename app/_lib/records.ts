/**
 * 기록과 평가의 데이터 접근 계층. 서버에서만 import한다.
 * (`db/index.ts`가 `cloudflare:workers`를 참조하므로 클라이언트 번들에 들어가면 안 된다.)
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { reviews, watchRecords, type ReviewRow, type WatchRecordRow } from "../../db/schema";
import { baseDateOf } from "./date";
import type { RecordDto, RecordGroupDto, RecordListResponse, SortKey, WatchStatus } from "./types";
import type { ValidatedRecord, ValidatedRecordPatch, ValidatedReview } from "./validation";

/** 2인 평가를 도입하기 전까지 평가자는 하나다. PRD 9.2. */
const RATER_KEY = "me";

function nowIso(): string {
  return new Date().toISOString();
}

function toReviewDto(row: ReviewRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    rating: row.rating,
    shortComment: row.shortComment,
    editCount: row.editCount,
    editedAt: row.editedAt,
    submittedAt: row.submittedAt,
  };
}

function toRecordDto(record: WatchRecordRow, review: ReviewRow | null): RecordDto {
  return {
    id: record.id,
    contentKey: record.contentKey,
    contentTitle: record.contentTitle,
    contentFormat: record.contentFormat,
    contentProvider: record.contentProvider,
    contentRuntime: record.contentRuntime,
    posterPalette: record.posterPalette,
    watchMode: record.watchMode,
    pickedContext: record.pickedContext,
    pickedMood: record.pickedMood,
    watchStatus: record.watchStatus as WatchStatus,
    startedOn: record.startedOn,
    finishedOn: record.finishedOn,
    seasonNumber: record.seasonNumber,
    memo: record.memo,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    review: toReviewDto(review),
  };
}

/** 최근 시청순. 기준일이 같으면 나중에 만든 기록이 앞이다. PRD 7.5. */
function compareRecent(a: RecordDto, b: RecordDto): number {
  const byDate = baseDateOf(b).localeCompare(baseDateOf(a));
  if (byDate !== 0) return byDate;
  return b.id - a.id;
}

function buildGroups(records: RecordDto[]): RecordGroupDto[] {
  const buckets = new Map<string, RecordDto[]>();

  for (const record of records) {
    const bucket = buckets.get(record.contentKey);
    if (bucket) bucket.push(record);
    else buckets.set(record.contentKey, [record]);
  }

  return [...buckets.values()].map((bucket) => {
    const sorted = [...bucket].sort(compareRecent);
    const representative = sorted[0];

    return {
      contentKey: representative.contentKey,
      contentTitle: representative.contentTitle,
      contentFormat: representative.contentFormat,
      contentProvider: representative.contentProvider,
      contentRuntime: representative.contentRuntime,
      posterPalette: representative.posterPalette,
      rewatchCount: sorted.length,
      representative,
      records: sorted,
    };
  });
}

/**
 * 별점 높은 순. 별점이 없는 카드는 하단에 최근 시청순으로 배치한다. PRD 7.5 정렬 정책.
 */
function compareByRating(a: RecordGroupDto, b: RecordGroupDto): number {
  const ratingA = a.representative.review?.rating ?? null;
  const ratingB = b.representative.review?.rating ?? null;

  if (ratingA === null && ratingB === null) return compareRecent(a.representative, b.representative);
  if (ratingA === null) return 1;
  if (ratingB === null) return -1;
  if (ratingA !== ratingB) return ratingB - ratingA;

  return compareRecent(a.representative, b.representative);
}

export type ListOptions = {
  sort: SortKey;
  format: string | null;
  status: string | null;
};

export async function listRecords(ownerKey: string, options: ListOptions): Promise<RecordListResponse> {
  const db = await getDb();

  const rows = await db
    .select({ record: watchRecords, review: reviews })
    .from(watchRecords)
    .leftJoin(reviews, and(eq(reviews.watchRecordId, watchRecords.id), eq(reviews.raterKey, RATER_KEY)))
    .where(eq(watchRecords.ownerKey, ownerKey));

  const records = rows.map((row) => toRecordDto(row.record, row.review));

  let groups = buildGroups(records);

  // 필터는 대표 기록을 기준으로 판정한다. PRD 7.5.
  if (options.format) {
    groups = groups.filter((group) => group.contentFormat === options.format);
  }
  if (options.status) {
    groups = groups.filter((group) => group.representative.watchStatus === options.status);
  }

  groups.sort(
    options.sort === "rating"
      ? compareByRating
      : (a, b) => compareRecent(a.representative, b.representative)
  );

  // 미평가 안내는 필터와 무관하게 전체를 대상으로 한다. PRD 7.4.
  const unrated = records
    .filter((record) => !record.review && record.watchStatus !== "watching")
    .sort(compareRecent);

  return { groups, unrated, totalRecords: records.length };
}

export async function findRecord(ownerKey: string, id: number): Promise<RecordDto | null> {
  const db = await getDb();

  const rows = await db
    .select({ record: watchRecords, review: reviews })
    .from(watchRecords)
    .leftJoin(reviews, and(eq(reviews.watchRecordId, watchRecords.id), eq(reviews.raterKey, RATER_KEY)))
    .where(and(eq(watchRecords.id, id), eq(watchRecords.ownerKey, ownerKey)))
    .limit(1);

  const row = rows[0];
  return row ? toRecordDto(row.record, row.review) : null;
}

export async function createRecord(ownerKey: string, input: ValidatedRecord): Promise<RecordDto> {
  const db = await getDb();
  const timestamp = nowIso();

  const [record] = await db
    .insert(watchRecords)
    .values({
      ownerKey,
      contentKey: input.contentKey,
      contentTitle: input.contentTitle,
      contentFormat: input.contentFormat,
      contentProvider: input.contentProvider,
      contentRuntime: input.contentRuntime,
      posterPalette: input.posterPalette,
      watchMode: input.watchMode,
      pickedContext: input.pickedContext,
      pickedMood: input.pickedMood,
      watchStatus: input.watchStatus,
      startedOn: input.startedOn,
      finishedOn: input.finishedOn,
      seasonNumber: input.seasonNumber,
      memo: input.memo,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  let review: ReviewRow | null = null;

  // 별점이 없으면 미평가 기록으로 남긴다. PRD 7.2.
  if (input.rating !== null) {
    const [created] = await db
      .insert(reviews)
      .values({
        watchRecordId: record.id,
        raterKey: RATER_KEY,
        rating: input.rating,
        shortComment: input.shortComment,
        submittedAt: timestamp,
        editCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();
    review = created;
  }

  return toRecordDto(record, review);
}

export async function updateRecord(
  ownerKey: string,
  id: number,
  patch: ValidatedRecordPatch
): Promise<RecordDto | null> {
  const db = await getDb();

  const updated = await db
    .update(watchRecords)
    .set({
      watchStatus: patch.watchStatus,
      startedOn: patch.startedOn,
      finishedOn: patch.finishedOn,
      seasonNumber: patch.seasonNumber,
      memo: patch.memo,
      updatedAt: nowIso(),
    })
    .where(and(eq(watchRecords.id, id), eq(watchRecords.ownerKey, ownerKey)))
    .returning();

  if (updated.length === 0) return null;
  return findRecord(ownerKey, id);
}

export async function deleteRecord(ownerKey: string, id: number): Promise<boolean> {
  const db = await getDb();

  // ON DELETE CASCADE에만 의존하지 않는다. D1의 외래 키 강제 여부와 무관하게
  // 평가가 남지 않도록 명시적으로 먼저 지운다. PRD 11.4.
  const owned = await db
    .select({ id: watchRecords.id })
    .from(watchRecords)
    .where(and(eq(watchRecords.id, id), eq(watchRecords.ownerKey, ownerKey)))
    .limit(1);

  if (owned.length === 0) return false;

  await db.delete(reviews).where(eq(reviews.watchRecordId, id));
  await db.delete(watchRecords).where(and(eq(watchRecords.id, id), eq(watchRecords.ownerKey, ownerKey)));

  return true;
}

/**
 * 평가 생성 또는 수정.
 * 값이 실제로 바뀐 저장에만 수정 횟수를 올린다. PRD 7.3.
 */
export async function upsertReview(
  ownerKey: string,
  recordId: number,
  input: ValidatedReview
): Promise<RecordDto | null> {
  const db = await getDb();

  const owned = await db
    .select({ id: watchRecords.id })
    .from(watchRecords)
    .where(and(eq(watchRecords.id, recordId), eq(watchRecords.ownerKey, ownerKey)))
    .limit(1);

  if (owned.length === 0) return null;

  const existing = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.watchRecordId, recordId), eq(reviews.raterKey, RATER_KEY)))
    .limit(1);

  const timestamp = nowIso();
  const current = existing[0];

  if (!current) {
    await db.insert(reviews).values({
      watchRecordId: recordId,
      raterKey: RATER_KEY,
      rating: input.rating,
      shortComment: input.shortComment,
      submittedAt: timestamp,
      editCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return findRecord(ownerKey, recordId);
  }

  const unchanged =
    current.rating === input.rating && (current.shortComment ?? null) === input.shortComment;

  if (unchanged) {
    return findRecord(ownerKey, recordId);
  }

  await db
    .update(reviews)
    .set({
      rating: input.rating,
      shortComment: input.shortComment,
      editCount: current.editCount + 1,
      editedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(reviews.id, current.id));

  return findRecord(ownerKey, recordId);
}
