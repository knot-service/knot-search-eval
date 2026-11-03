import { cookies } from "next/headers";
import { isDeepStrictEqual } from "node:util";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "../../../lib/auth";
import { mutateState, readState } from "../../../lib/db";
import { executeSharedCase } from "../../../lib/local-spring";
import { executeClockCase } from "../../../lib/local-clock";
import { executeTimingCase } from "../../../lib/local-timing";
import { executeBudgetCase } from "../../../lib/local-budget";
import { sharedCaseReadiness } from "../../../lib/local-cases";
import { latestWorkspaceDataset } from "../../../lib/latest-workspace-dataset";
import { latestCaseReviews } from "../../../lib/review-summary";
import full from "../../../data/synthetic-full-dataset.json";
import { DatasetSchema } from "../../../lib/schema";

export const maxDuration = 180;
const execFileAsync = promisify(execFile);
async function backendRevision(target: 'baseline' | 'lab'): Promise<string> {
  try {
    const result = await execFileAsync("docker", ["inspect", "--format", "{{.Image}}", target === 'lab' ? 'knot-search-lab-backend-1' : 'knot-eval-isolated-backend-1'], {timeout:3000});
    const id=result.stdout.trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(id)) return "이미지 확인 불가";
    return `docker ${id}`;
  } catch { return "이미지 확인 불가"; }
}
const RequestBody = z.object({caseId:z.string().regex(/^[A-Z][0-9]{2}-0[123]$/), dataset:z.enum(["initial", "meetings"]).default("initial"), target:z.enum(['baseline','lab']).default('baseline')});
export async function POST(req: Request) {
  const url=new URL(req.url); const host=req.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || process.env.LOCAL_EVAL_ENABLED !== "1" || !["localhost","127.0.0.1"].includes(url.hostname) || req.headers.get("origin") !== `http://${host}` || Boolean(process.env.VERCEL)) return NextResponse.json({error:"로컬에서만 사용할 수 있습니다."},{status:403});
  const c=await cookies();
  if (!verifySession(c.get("knot_eval_session")?.value,process.env.SESSION_SECRET)) return NextResponse.json({error:"인증이 필요합니다."},{status:401});
  try {
    const body=RequestBody.safeParse(await req.json());
    if (!body.success) return NextResponse.json({error:"실행할 사례를 선택해 주세요."},{status:400});
    let state=await readState();
    const source = body.data.dataset === "meetings"
      ? latestWorkspaceDataset(state.datasets)
      : DatasetSchema.parse({id:"knot-scenarios",name:"기존 기준 사례",version:"1.0",source:"synthetic",cases:full.cases});
    if (!source) return NextResponse.json({error:"회의록 형식 평가셋을 먼저 가져와 주세요."},{status:400});
    const originalCase=source.cases.find((item)=>item.id===body.data.caseId);
    if (!originalCase) return NextResponse.json({error:"사례를 찾을 수 없습니다."},{status:400});
    const review=body.data.dataset === "meetings" ? latestCaseReviews(source, state.reviews).get(originalCase.id)?.outcome : undefined;
    const readiness=sharedCaseReadiness(originalCase,new Date(),review);
    if (!readiness.ready) return NextResponse.json({error:readiness.reason},{status:400});
    if (body.data.target === 'lab' && (originalCase.evaluationTime || originalCase.executionFixture)) return NextResponse.json({error:'이 사례는 시각 고정 또는 별도 실행 조건이 필요해 탐색 실험실에서 아직 실행할 수 없습니다.'},{status:400});
    const snapshotId=body.data.dataset === "meetings" ? source.id : "knot-local-cases";
    const snapshotVersion=body.data.dataset === "meetings" ? source.version : "1.0";
    const parsed=DatasetSchema.parse({id:snapshotId,name:source.name,version:snapshotVersion,source:"synthetic",corpusHash:source.corpusHash,cases:source.cases});
    let dataset=state.datasets.find((d)=>d.id===parsed.id && d.version===parsed.version);
    if (!dataset) {
      state=await mutateState({type:"import_dataset",data:parsed});
      dataset=state.datasets.find((d)=>d.id===parsed.id && d.version===parsed.version);
    }
    if (dataset && !dataset.locked) {
      state=await mutateState({type:"lock_dataset",id:dataset.id,version:dataset.version});
      dataset=state.datasets.find((d)=>d.id===parsed.id && d.version===parsed.version);
    }
    const sample=dataset?.cases.find((item)=>item.id===body.data.caseId);
    if (!sample || !isDeepStrictEqual(sample,originalCase)) return NextResponse.json({error:"잠긴 실험 사례가 현재 기준과 다릅니다."},{status:409});
    const snapshot={id:snapshotId,version:snapshotVersion,corpusHash:dataset?.corpusHash};
    const run=sample.executionFixture === 'limited_context' ? await executeBudgetCase(sample,snapshot) : sample.executionFixture === 'document_after_intake' ? await executeTimingCase(sample,snapshot) : sample.evaluationTime || sample.executionFixture ? await executeClockCase(sample,snapshot) : await executeSharedCase(sample,await backendRevision(body.data.target),snapshot,undefined,body.data.target);
    return NextResponse.json(await mutateState({type:"import_run",data:run}));
  } catch (e) {
    console.error("Local experiment failed",e instanceof Error ? e.name : "unknown");
    return NextResponse.json({error:"실험을 완료하지 못했습니다. 로컬 Spring, 합성 DB와 사례 조건을 확인해 주세요."},{status:503});
  }
}
