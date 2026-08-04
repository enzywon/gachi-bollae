import { errorResponse, jsonNoStore, jsonWithOwner } from "../../_lib/api";
import { readOwnerKey, resolveOwnerKey } from "../../_lib/owner";
import { createRecord, listRecords } from "../../_lib/records";
import { CONTENT_FORMATS, WATCH_STATUSES, type SortKey } from "../../_lib/types";
import { validateCreateRecord } from "../../_lib/validation";

function parseSort(value: string | null): SortKey {
  return value === "rating" ? "rating" : "recent";
}

function parseEnum(value: string | null, allowed: readonly string[]): string | null {
  if (!value || value === "all") return null;
  return allowed.includes(value) ? value : null;
}

export async function GET(request: Request) {
  try {
    const ownerKey = readOwnerKey(request);

    // 아직 아무것도 기록하지 않은 방문자다. 쿠키를 미리 발급할 이유가 없다.
    if (!ownerKey) {
      return jsonNoStore({ groups: [], unrated: [], totalRecords: 0 });
    }

    const url = new URL(request.url);
    const result = await listRecords(ownerKey, {
      sort: parseSort(url.searchParams.get("sort")),
      format: parseEnum(url.searchParams.get("format"), CONTENT_FORMATS),
      status: parseEnum(url.searchParams.get("status"), WATCH_STATUSES),
    });

    return jsonNoStore(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { ownerKey, isNew } = resolveOwnerKey(request);
    const input = validateCreateRecord(await request.json());
    const record = await createRecord(ownerKey, input);

    return jsonWithOwner({ record }, 201, isNew ? ownerKey : undefined);
  } catch (error) {
    return errorResponse(error);
  }
}
