/** Route Handler 공통 응답 처리. PRD 11.1 참고. */

import { MISSING_DATABASE_URL } from "../../db";
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
 * 소유자 쿠키에 따라 내용이 달라지는 조회 응답.
 * URL에는 소유자가 드러나지 않으므로, 캐시를 막지 않으면 쿠키가 바뀐 뒤에도
 * 같은 URL로 이전 소유자의 응답이 재사용될 수 있다.
 */
export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * 저장소가 준비되지 않은 상황을 사용자가 이해할 수 있는 문구로 바꾼다.
 * 추천 흐름 자체는 저장소 없이도 동작해야 하므로 500으로 뭉뚱그리지 않는다.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  // request.json()이 던지는 SyntaxError. 잘못된 요청이므로 500으로 넘기지 않는다.
  if (error instanceof SyntaxError) {
    return Response.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes(MISSING_DATABASE_URL)) {
    return Response.json(
      {
        error:
          "저장소가 연결되지 않아 기록을 남길 수 없습니다. DATABASE_URL 환경 변수를 확인해 주세요.",
        code: "storage_unavailable",
      },
      { status: 503 }
    );
  }

  // Postgres 42P01 undefined_table. 마이그레이션을 아직 적용하지 않은 상태다.
  if (combined.includes("does not exist") || combined.includes("42P01")) {
    return Response.json(
      {
        error:
          "기록 테이블이 아직 만들어지지 않았습니다. `npm run db:migrate`로 마이그레이션을 적용해 주세요.",
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
