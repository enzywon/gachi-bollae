/** Route Handler 공통 응답 처리. PRD 11.1 참고. */

import { ownerCookieHeader } from "./owner";
import { ValidationError } from "./validation";

export function jsonWithOwner(body: unknown, status: number, newOwnerKey?: string): Response {
  const response = Response.json(body, { status });
  if (newOwnerKey) {
    response.headers.append("set-cookie", ownerCookieHeader(newOwnerKey));
  }
  return response;
}

/**
 * 저장소가 준비되지 않은 상황을 사용자가 이해할 수 있는 문구로 바꾼다.
 * 추천 흐름 자체는 저장소 없이도 동작해야 하므로 500으로 뭉뚱그리지 않는다.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("D1 binding")) {
    return Response.json(
      {
        error:
          "저장소가 연결되지 않아 기록을 남길 수 없습니다. .openai/hosting.json의 d1 값을 확인해 주세요.",
        code: "storage_unavailable",
      },
      { status: 503 }
    );
  }

  if (combined.includes("no such table")) {
    return Response.json(
      {
        error:
          "기록 테이블이 아직 만들어지지 않았습니다. `npm run db:generate`로 마이그레이션을 만든 뒤 배포해 주세요.",
        code: "migration_required",
      },
      { status: 503 }
    );
  }

  return Response.json({ error: message }, { status: 500 });
}

export function parseRecordId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
