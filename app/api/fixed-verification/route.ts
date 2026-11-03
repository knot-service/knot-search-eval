import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "../../../lib/auth";
import { mutateState, readState } from "../../../lib/db";
import { runFixedVerification } from "../../../lib/fixed-verification-experiment";

export const maxDuration = 300;
const RequestSchema = z.object({caseId: z.enum(["S14-01", "S19-01", "S29-01", "S69-01", "S71-01"]), variant: z.enum(["A", "B"])}).strict();

export async function POST(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || !["localhost", "127.0.0.1"].includes(url.hostname) || req.headers.get("origin") !== `http://${host}` || process.env.LOCAL_EVAL_ENABLED !== "1" || process.env.VERCEL)
    return NextResponse.json({error:"로컬 실험실에서만 실행할 수 있습니다."}, {status:403});
  const jar = await cookies();
  if (!verifySession(jar.get("knot_eval_session")?.value, process.env.SESSION_SECRET))
    return NextResponse.json({error:"인증이 필요합니다."}, {status:401});
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 1024) return NextResponse.json({error:"실험 입력이 너무 큽니다."}, {status:413});
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 1024) return NextResponse.json({error:"실험 입력이 너무 큽니다."}, {status:413});
    const body = RequestSchema.parse(JSON.parse(raw));
    const state = await readState();
    if (!state.datasets.some((dataset) => dataset.id === "knot-workspace-458" && dataset.version === "1.30" && dataset.locked && dataset.corpusHash === "77dabdd0889a9254d494c145f60339f5f02d45997cf236b24bff9c4ff0c9d41c"))
      return NextResponse.json({error:"잠긴 v1.30 평가셋이 필요합니다."}, {status:400});
    const run = await runFixedVerification(body.caseId, body.variant);
    return NextResponse.json(await mutateState({type:"import_run",data:run}));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({error:"실험 입력을 확인해 주세요."}, {status:400});
    console.error("Fixed verification experiment failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({error:"실험을 시작하거나 저장하지 못했습니다. 로컬 설정을 확인해 주세요."}, {status:503});
  }
}
