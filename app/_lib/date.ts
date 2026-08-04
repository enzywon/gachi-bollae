/**
 * KST 날짜 유틸. PRD 10.4 참고.
 *
 * Cloudflare Workers 런타임은 UTC로 동작하므로 "오늘"을 그대로 쓰면 한국 시간과 어긋난다.
 * 날짜 계산은 이 파일에만 두고 단위 테스트로 보호한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 이 시각 이전은 전날로 취급한다. PRD 7.1 날짜 정책. */
const DAY_START_HOUR = 4;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function shiftToKst(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

function formatUtcParts(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** KST 기준 실제 달력 날짜. 미래 날짜 검증의 기준값이다. */
export function kstToday(now: Date = new Date()): string {
  return formatUtcParts(shiftToKst(now));
}

/**
 * 기록 입력의 기본 날짜.
 * 새벽에 콘텐츠를 다 본 경우를 위해 KST 오전 4시 이전이면 전날을 사용한다.
 */
export function kstDefaultRecordDate(now: Date = new Date()): string {
  const shifted = shiftToKst(now);
  if (shifted.getUTCHours() < DAY_START_HOUR) {
    shifted.setUTCDate(shifted.getUTCDate() - 1);
  }
  return formatUtcParts(shifted);
}

/** `YYYY-MM-DD` 형식이면서 실제로 존재하는 날짜인지 확인한다. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** 사전순 비교가 곧 시간순 비교다. `YYYY-MM-DD` 형식이기 때문이다. */
export function isAfter(a: string, b: string): boolean {
  return a > b;
}

/** 기록의 기준일. 종료일이 있으면 종료일, 없으면 시작일. PRD 7.5 정렬 정책. */
export function baseDateOf(record: { finishedOn?: string | null; startedOn?: string | null }): string {
  return record.finishedOn ?? record.startedOn ?? "";
}

/** `2026-08-04` → `2026년 8월 4일` */
export function formatKoreanDate(value: string | null | undefined): string {
  if (!value || !isValidDateString(value)) return "날짜 없음";
  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
