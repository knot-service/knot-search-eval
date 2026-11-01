import { NextResponse } from "next/server";
import { validPassword, signSession } from "../../../lib/auth";
import { checkLoginLimit } from "../../../lib/db";
export async function POST(req: Request) {
  if (
    !process.env.ADMIN_PASSWORD ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
  )
    return NextResponse.json(
      { error: "인증 설정이 필요합니다." },
      { status: 503 },
    );
  try {
    const address = process.env.VERCEL
      ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : "local";
    if (!address)
      return NextResponse.json(
        { error: "요청 출처를 확인할 수 없습니다." },
        { status: 403 },
      );
    if (!(await checkLoginLimit(address)))
      return NextResponse.json(
        { error: "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
  } catch {
    return NextResponse.json(
      { error: "인증 서비스를 사용할 수 없습니다." },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  if (!validPassword(body?.password, process.env.ADMIN_PASSWORD))
    return NextResponse.json(
      { error: "접속 정보를 확인해 주세요." },
      { status: 401 },
    );
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    "knot_eval_session",
    signSession(process.env.SESSION_SECRET),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60,
    },
  );
  return res;
}
