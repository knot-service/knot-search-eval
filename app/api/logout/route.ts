import { NextResponse } from "next/server";
export async function POST() {
  const r = NextResponse.json({ ok: true });
  r.cookies.delete("knot_eval_session");
  return r;
}
