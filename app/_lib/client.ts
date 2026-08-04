"use client";

/** 브라우저에서 기록 API를 호출하는 얇은 래퍼. 서버 모듈을 import하지 않는다. */

import type { RatingSheetValues } from "../_components/RatingSheet";
import type { RecordDto, RecordListResponse, SortKey } from "./types";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // 응답이 JSON이 아니면 아래 기본 문구를 쓴다.
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function seasonToNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

export type ContentSnapshot = {
  contentKey: string;
  contentTitle: string;
  contentFormat: string;
  contentProvider?: string | null;
  contentRuntime?: number | null;
  posterPalette?: string | null;
};

export type PickContext = {
  watchMode?: string | null;
  pickedContext?: string | null;
  pickedMood?: string | null;
};

/** 시청 중이면 종료일을 비운다. 되돌리기 시 남은 종료일이 함께 저장되지 않도록. */
function datesOf(values: RatingSheetValues) {
  return {
    startedOn: blankToNull(values.startedOn),
    finishedOn: values.watchStatus === "watching" ? null : blankToNull(values.finishedOn),
  };
}

export async function createRecord(
  content: ContentSnapshot,
  pick: PickContext,
  values: RatingSheetValues
): Promise<RecordDto> {
  const response = await fetch("/api/records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...content,
      ...pick,
      watchStatus: values.watchStatus,
      ...datesOf(values),
      seasonNumber: seasonToNumber(values.seasonNumber),
      memo: blankToNull(values.memo),
      rating: values.rating,
      shortComment: values.rating === null ? null : blankToNull(values.shortComment),
    }),
  });

  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { record: RecordDto };
  return body.record;
}

export async function updateRecord(id: number, values: RatingSheetValues): Promise<RecordDto> {
  const response = await fetch(`/api/records/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      watchStatus: values.watchStatus,
      ...datesOf(values),
      seasonNumber: seasonToNumber(values.seasonNumber),
      memo: blankToNull(values.memo),
    }),
  });

  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { record: RecordDto };
  return body.record;
}

export async function saveReview(id: number, values: RatingSheetValues): Promise<RecordDto> {
  const response = await fetch(`/api/records/${id}/review`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rating: values.rating,
      shortComment: blankToNull(values.shortComment),
    }),
  });

  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { record: RecordDto };
  return body.record;
}

export async function removeRecord(id: number): Promise<void> {
  const response = await fetch(`/api/records/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

export async function fetchRecords(params: {
  sort: SortKey;
  format: string;
  status: string;
}): Promise<RecordListResponse> {
  const query = new URLSearchParams({
    sort: params.sort,
    format: params.format,
    status: params.status,
  });

  const response = await fetch(`/api/records?${query.toString()}`);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as RecordListResponse;
}
