/**
 * 클라이언트와 서버가 함께 쓰는 타입. DB나 Workers API를 import하지 않는다.
 */

export const CONTENT_FORMATS = ["영화", "시리즈", "예능"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const WATCH_STATUSES = ["watching", "completed", "dropped"] as const;
export type WatchStatus = (typeof WATCH_STATUSES)[number];

export const WATCH_MODES = ["solo", "together"] as const;
export type WatchMode = (typeof WATCH_MODES)[number];

export const WATCH_STATUS_LABEL: Record<WatchStatus, string> = {
  watching: "보는 중",
  completed: "다 봤어요",
  dropped: "중단했어요",
};

/** 시즌 번호를 입력할 수 있는 형식. 영화는 작품 단위로 기록한다. PRD 7.1. */
export function allowsSeason(format: string): boolean {
  return format === "시리즈" || format === "예능";
}

/** 종료일이 필요한 상태. PRD 7.1 날짜 정책. */
export function requiresFinishedOn(status: WatchStatus): boolean {
  return status === "completed" || status === "dropped";
}

export const MAX_COMMENT_LENGTH = 200;
export const MAX_MEMO_LENGTH = 500;

export type ReviewDto = {
  id: number;
  rating: number;
  shortComment: string | null;
  editCount: number;
  editedAt: string | null;
  submittedAt: string;
};

export type RecordDto = {
  id: number;
  contentKey: string;
  contentTitle: string;
  contentFormat: string;
  contentProvider: string | null;
  contentRuntime: number | null;
  posterPalette: string | null;
  watchMode: string | null;
  pickedContext: string | null;
  pickedMood: string | null;
  watchStatus: WatchStatus;
  startedOn: string | null;
  finishedOn: string | null;
  seasonNumber: number | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  review: ReviewDto | null;
};

/** 같은 콘텐츠의 기록 묶음. PRD 7.5 기록 묶음 정책. */
export type RecordGroupDto = {
  contentKey: string;
  contentTitle: string;
  contentFormat: string;
  contentProvider: string | null;
  contentRuntime: number | null;
  posterPalette: string | null;
  rewatchCount: number;
  representative: RecordDto;
  records: RecordDto[];
};

export type RecordListResponse = {
  groups: RecordGroupDto[];
  unrated: RecordDto[];
  totalRecords: number;
};

export type SortKey = "recent" | "rating";

export type CreateRecordInput = {
  contentKey: string;
  contentTitle: string;
  contentFormat: string;
  contentProvider?: string | null;
  contentRuntime?: number | null;
  posterPalette?: string | null;
  watchMode?: string | null;
  pickedContext?: string | null;
  pickedMood?: string | null;
  watchStatus: WatchStatus;
  startedOn?: string | null;
  finishedOn?: string | null;
  seasonNumber?: number | null;
  memo?: string | null;
  rating?: number | null;
  shortComment?: string | null;
};
