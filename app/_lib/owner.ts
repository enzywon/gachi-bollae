/**
 * 익명 소유자 키. PRD 10.3 참고.
 *
 * 이 방식은 인증이 아니라 기기 단위 구분이다.
 * 쿠키를 잃으면 기록에 접근할 수 없고, 쿠키 값을 아는 주체는 누구든 접근할 수 있다.
 * 실사용자를 받기 전에 로그인 도입이 선행되어야 한다.
 */

export const OWNER_COOKIE = "gb_owner";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** next/headers에 의존하지 않도록 Request에서 직접 파싱한다. */
export function readOwnerKey(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === OWNER_COOKIE) {
      const value = rest.join("=").trim();
      return value === "" ? null : decodeURIComponent(value);
    }
  }
  return null;
}

export function createOwnerKey(): string {
  return crypto.randomUUID();
}

export function ownerCookieHeader(ownerKey: string): string {
  return [
    `${OWNER_COOKIE}=${encodeURIComponent(ownerKey)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ONE_YEAR_SECONDS}`,
  ].join("; ");
}

/** 쓰기 요청용. 쿠키가 없으면 새로 발급하고 응답에 실어야 한다. */
export function resolveOwnerKey(request: Request): { ownerKey: string; isNew: boolean } {
  const existing = readOwnerKey(request);
  if (existing) return { ownerKey: existing, isNew: false };
  return { ownerKey: createOwnerKey(), isNew: true };
}
