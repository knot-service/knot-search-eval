import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "../../../lib/auth";
import { mutateState } from "../../../lib/db";
import { ZodError } from "zod";
export async function POST(req: Request) {
  const c = await cookies();
  if (
    !verifySession(
      c.get("knot_eval_session")?.value,
      process.env.SESSION_SECRET,
    )
  )
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host)
    return NextResponse.json(
      { error: "요청 출처를 확인해 주세요." },
      { status: 403 },
    );
  if (Number(req.headers.get("content-length") || 0) > 1000000)
    return NextResponse.json(
      { error: "파일 크기 제한은 1MB입니다." },
      { status: 413 },
    );
  let raw: string;
  try {
    raw = await req.text();
    if (Buffer.byteLength(raw) > 1000000)
      return NextResponse.json(
        { error: "파일 크기 제한은 1MB입니다." },
        { status: 413 },
      );
    const data = JSON.parse(raw);
    return NextResponse.json(await mutateState(data));
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        { error: "형식이 올바르지 않습니다. " + e.issues[0]?.message },
        { status: 400 },
      );
    if (e instanceof SyntaxError)
      return NextResponse.json(
        { error: "JSON을 확인해 주세요." },
        { status: 400 },
      );
    const msg = e instanceof Error ? e.message : "";
    if (/이미|찾을 수|필요합니다|지원하지|확인해|중복/.test(msg))
      return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json(
      { error: "저장하지 못했습니다. 저장소 연결을 확인해 주세요." },
      { status: 503 },
    );
  }
}
