/**
 * 서버 입력 검증. PRD 10.2 참고.
 * 클라이언트 검증은 보조 수단이므로 모든 규칙을 여기서 다시 확인한다.
 */

import { isAfter, isValidDateString, kstToday } from "./date";
import {
  CONTENT_FORMATS,
  MAX_COMMENT_LENGTH,
  MAX_MEMO_LENGTH,
  WATCH_MODES,
  WATCH_STATUSES,
  allowsSeason,
  requiresFinishedOn,
  type CreateRecordInput,
  type WatchStatus,
} from "./types";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function fail(message: string): never {
  throw new ValidationError(message);
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") fail(`${field} 값의 형식이 올바르지 않습니다.`);
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) fail(`${field}은 최대 ${maxLength}자까지 입력할 수 있습니다.`);
  return trimmed;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isValidDateString(value)) fail(`${field} 형식이 올바르지 않습니다. YYYY-MM-DD로 입력해 주세요.`);
  if (isAfter(value, kstToday())) fail(`${field}은 미래 날짜로 입력할 수 없습니다.`);
  return value;
}

function optionalInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed)) {
    fail(`${field}은 정수로 입력해 주세요.`);
  }
  return parsed;
}

/** 별점은 1~5 정수다. null이면 미평가 기록으로 남긴다. PRD 7.2. */
export function validateRating(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    fail("별점은 1점부터 5점까지의 정수만 입력할 수 있습니다.");
  }
  return parsed;
}

export function validateShortComment(value: unknown): string | null {
  return optionalText(value, "한 줄 감상", MAX_COMMENT_LENGTH);
}

function validateWatchStatus(value: unknown): WatchStatus {
  if (typeof value !== "string" || !WATCH_STATUSES.includes(value as WatchStatus)) {
    fail("시청 상태 값이 올바르지 않습니다.");
  }
  return value as WatchStatus;
}

/** 상태별로 필요한 날짜와 전후 관계를 확인한다. PRD 7.1, 11.2. */
function validateDates(status: WatchStatus, startedOn: string | null, finishedOn: string | null) {
  if (status === "watching" && !startedOn) {
    fail("`보는 중` 기록에는 시작일이 필요합니다.");
  }
  if (requiresFinishedOn(status) && !finishedOn) {
    fail("`다 봤어요`와 `중단했어요` 기록에는 종료일이 필요합니다.");
  }
  if (startedOn && finishedOn && isAfter(startedOn, finishedOn)) {
    fail("종료일은 시작일보다 빠를 수 없습니다.");
  }
}

/** 영화는 작품 단위로 기록하므로 시즌 번호를 받지 않는다. PRD 7.1. */
function validateSeason(format: string, value: unknown): number | null {
  const seasonNumber = optionalInteger(value, "시즌 번호");
  if (seasonNumber === null) return null;

  if (!allowsSeason(format)) {
    fail("영화는 작품 단위로 기록하므로 시즌 번호를 입력할 수 없습니다.");
  }
  if (seasonNumber < 0) {
    fail("시즌 번호는 0 이상이어야 합니다.");
  }
  return seasonNumber;
}

export type ValidatedRecord = Required<
  Pick<CreateRecordInput, "contentKey" | "contentTitle" | "contentFormat" | "watchStatus">
> & {
  contentProvider: string | null;
  contentRuntime: number | null;
  posterPalette: string | null;
  watchMode: string | null;
  pickedContext: string | null;
  pickedMood: string | null;
  startedOn: string | null;
  finishedOn: string | null;
  seasonNumber: number | null;
  memo: string | null;
  rating: number | null;
  shortComment: string | null;
};

export function validateCreateRecord(payload: unknown): ValidatedRecord {
  if (typeof payload !== "object" || payload === null) {
    fail("요청 본문이 비어 있습니다.");
  }
  const input = payload as Record<string, unknown>;

  const contentKey = optionalText(input.contentKey, "콘텐츠 식별자", 200);
  if (!contentKey) fail("콘텐츠 식별자가 필요합니다.");

  const contentTitle = optionalText(input.contentTitle, "콘텐츠 제목", 200);
  if (!contentTitle) fail("콘텐츠 제목이 필요합니다.");

  const contentFormat = typeof input.contentFormat === "string" ? input.contentFormat : "";
  if (!CONTENT_FORMATS.includes(contentFormat as (typeof CONTENT_FORMATS)[number])) {
    fail("콘텐츠 형식 값이 올바르지 않습니다.");
  }

  const watchMode = optionalText(input.watchMode, "시청 모드", 20);
  if (watchMode && !WATCH_MODES.includes(watchMode as (typeof WATCH_MODES)[number])) {
    fail("시청 모드 값이 올바르지 않습니다.");
  }

  const watchStatus = validateWatchStatus(input.watchStatus);
  const startedOn = optionalDate(input.startedOn, "시작일");
  const finishedOn = optionalDate(input.finishedOn, "종료일");
  validateDates(watchStatus, startedOn, finishedOn);

  const rating = validateRating(input.rating);
  const shortComment = validateShortComment(input.shortComment);
  if (rating === null && shortComment !== null) {
    fail("한 줄 감상만 남길 수는 없습니다. 별점을 함께 입력해 주세요.");
  }

  return {
    contentKey,
    contentTitle,
    contentFormat,
    contentProvider: optionalText(input.contentProvider, "제공처", 100),
    contentRuntime: optionalInteger(input.contentRuntime, "재생 시간"),
    posterPalette: optionalText(input.posterPalette, "포스터 색상", 50),
    watchMode,
    pickedContext: optionalText(input.pickedContext, "시청 상황", 50),
    pickedMood: optionalText(input.pickedMood, "무드", 50),
    watchStatus,
    startedOn,
    finishedOn,
    seasonNumber: validateSeason(contentFormat, input.seasonNumber),
    memo: optionalText(input.memo, "메모", MAX_MEMO_LENGTH),
    rating,
    shortComment,
  };
}

export type ValidatedRecordPatch = {
  watchStatus: WatchStatus;
  startedOn: string | null;
  finishedOn: string | null;
  seasonNumber: number | null;
  memo: string | null;
};

/**
 * 기록 수정. 상태 전이는 3종 모두 허용하되 새 상태에 필요한 날짜를 다시 검증한다.
 * PRD 7.7.
 */
export function validateRecordPatch(payload: unknown, contentFormat: string): ValidatedRecordPatch {
  if (typeof payload !== "object" || payload === null) {
    fail("요청 본문이 비어 있습니다.");
  }
  const input = payload as Record<string, unknown>;

  const watchStatus = validateWatchStatus(input.watchStatus);
  const startedOn = optionalDate(input.startedOn, "시작일");
  const finishedOn = optionalDate(input.finishedOn, "종료일");
  validateDates(watchStatus, startedOn, finishedOn);

  return {
    watchStatus,
    startedOn,
    finishedOn,
    seasonNumber: validateSeason(contentFormat, input.seasonNumber),
    memo: optionalText(input.memo, "메모", MAX_MEMO_LENGTH),
  };
}

export type ValidatedReview = {
  rating: number;
  shortComment: string | null;
};

export function validateReview(payload: unknown): ValidatedReview {
  if (typeof payload !== "object" || payload === null) {
    fail("요청 본문이 비어 있습니다.");
  }
  const input = payload as Record<string, unknown>;

  const rating = validateRating(input.rating);
  if (rating === null) fail("별점은 필수입니다.");

  return { rating, shortComment: validateShortComment(input.shortComment) };
}
