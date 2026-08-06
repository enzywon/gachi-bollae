import { errorResponse, parseRecordId } from "../../../../_lib/api";
import { readOwnerKey } from "../../../../_lib/owner";
import { upsertReview } from "../../../../_lib/records";
import { validateReview } from "../../../../_lib/validation";

type Context = { params: Promise<{ id: string }> };

/** 평가 생성과 수정을 같은 엔드포인트로 처리한다. PRD 10.1. */
export async function PUT(request: Request, context: Context) {
  try {
    const ownerKey = readOwnerKey(request);
    const id = parseRecordId((await context.params).id);
    if (!ownerKey || id === null) {
      return Response.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const input = validateReview(await request.json());
    const record = await upsertReview(ownerKey, id, input);
    if (!record) return Response.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });

    return Response.json({ record });
  } catch (error) {
    return errorResponse(error);
  }
}
