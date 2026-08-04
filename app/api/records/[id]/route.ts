import { errorResponse, jsonNoStore, parseRecordId } from "../../../_lib/api";
import { readOwnerKey } from "../../../_lib/owner";
import { deleteRecord, findRecord, updateRecord } from "../../../_lib/records";
import { validateRecordPatch } from "../../../_lib/validation";

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "기록을 찾을 수 없습니다." };

export async function GET(request: Request, context: Context) {
  try {
    const ownerKey = readOwnerKey(request);
    const id = parseRecordId((await context.params).id);
    if (!ownerKey || id === null) return jsonNoStore(NOT_FOUND, 404);

    const record = await findRecord(ownerKey, id);
    if (!record) return jsonNoStore(NOT_FOUND, 404);

    return jsonNoStore({ record });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const ownerKey = readOwnerKey(request);
    const id = parseRecordId((await context.params).id);
    if (!ownerKey || id === null) return Response.json(NOT_FOUND, { status: 404 });

    // 시즌 검증은 콘텐츠 형식에 따라 달라지므로 기존 기록을 먼저 읽는다.
    const existing = await findRecord(ownerKey, id);
    if (!existing) return Response.json(NOT_FOUND, { status: 404 });

    const patch = validateRecordPatch(await request.json(), existing.contentFormat);
    const record = await updateRecord(ownerKey, id, patch);
    if (!record) return Response.json(NOT_FOUND, { status: 404 });

    return Response.json({ record });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const ownerKey = readOwnerKey(request);
    const id = parseRecordId((await context.params).id);
    if (!ownerKey || id === null) return Response.json(NOT_FOUND, { status: 404 });

    const deleted = await deleteRecord(ownerKey, id);
    if (!deleted) return Response.json(NOT_FOUND, { status: 404 });

    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
