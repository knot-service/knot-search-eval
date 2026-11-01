import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "../../../lib/auth";
import { readState } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const c = await cookies();
  if (
    !verifySession(
      c.get("knot_eval_session")?.value,
      process.env.SESSION_SECRET,
    )
  )
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    return NextResponse.json(await readState(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "평가 데이터 저장소를 확인해 주세요." },
      { status: 503 },
    );
  }
}
