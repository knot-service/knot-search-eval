import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { z } from "zod";
import { mutateState, readState } from "../lib/db";
import { DatasetSchema, RunSchema } from "../lib/schema";
import { contentHash } from "../lib/state";

const dir = resolve(process.cwd(), "../knot/backend/resume/search-improvement/followup-search-20261104");
const inputs = z.object({question:z.string(),history:z.array(z.object({role:z.string(),content:z.string()})),receivedAt:z.string(),modelOutput:z.unknown(),sourceRunId:z.string()});
const outputs = z.object({planned:z.array(z.object({requestId:z.string(),query:z.string(),conditions:z.unknown(),candidates:z.array(z.string()),durationMs:z.number().nonnegative()})),period:z.unknown().nullable()});
const cases = ["QG-01", "S09-01", "S12-01", "QG-03", "QG-04"] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("로컬 평가 DB가 아닙니다.");
  let state = await readState();
  const corpus = state.datasets.find(d => d.id === "knot-workspace-458" && d.version === "1.30" && d.locked);
  const guards = state.datasets.find(d => d.id === "question-guard-fixtures" && d.version === "1.0" && d.locked);
  if (!corpus?.corpusHash || !guards) throw new Error("원본 평가셋을 찾을 수 없습니다.");
  const db = new pg.Client({host:"127.0.0.1",port:55441,database:"knot_lab",user:"knot_lab",password:"knot-lab-local-only"});
  await db.connect();
  try {
    const rows = await db.query("SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id", [458]);
    const hash = createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex");
    if (rows.rowCount !== 90 || hash !== corpus.corpusHash) throw new Error("v1.30 합성 문서 버전이 일치하지 않습니다.");
  } finally { await db.end(); }
  const fixtureCases = cases.map(id => {
    const item = (id.startsWith("QG-") ? guards : corpus).cases.find(entry => entry.id === id);
    if (!item) throw new Error(`사례 없음: ${id}`);
    return item;
  });
  const fixture = DatasetSchema.parse({id:"followup-search-fixtures",name:"후속 질문 검색 연결 · v1.30 문서",version:"1.0",source:"synthetic",corpusHash:corpus.corpusHash,cases:fixtureCases});
  const existing = state.datasets.find(d => d.id === fixture.id && d.version === fixture.version);
  if (!existing) {
    await mutateState({type:"import_dataset",data:fixture});
    state = await mutateState({type:"lock_dataset",id:fixture.id,version:fixture.version});
  } else if (!existing.locked || existing.contentHash !== contentHash(fixture)) throw new Error("잠긴 실험 사례가 일치하지 않습니다.");
  for (const caseId of cases) for (const variant of ["v7", "v2", "meetingfix"] as const) {
    if (caseId === "S09-01" && variant === "v7") continue;
    if (variant === "meetingfix" && !["QG-04", "S09-01", "S12-01"].includes(caseId)) continue;
    const filename = `${caseId}-${variant === "meetingfix" ? "v2" : variant}`;
    const input = inputs.parse(JSON.parse(await readFile(resolve(dir,`${filename}-input.json`),"utf8")));
    const file = resolve(dir,`${filename}${variant === "meetingfix" ? "-meetingfix" : ""}-output.json`);
    const output = outputs.parse(JSON.parse(await readFile(file,"utf8")));
    const source = state.runs.find(run => run.id === input.sourceRunId);
    if (!source?.experiment || output.planned.length !== 1) throw new Error(`원본 또는 검색 결과 불일치: ${filename}`);
    const result = output.planned[0];
    if (!result) throw new Error(`검색 결과 없음: ${filename}`);
    const startedAt = (await stat(file)).mtime.toISOString();
    const ab = variant === "v7" ? "A" : "B";
    const revision = variant === "meetingfix" ? "followup-search-meetingfix-v1" : "followup-search-link-v1";
    if (state.runs.some(run => run.revision === revision && run.startedAt === startedAt && run.results[0]?.caseId === caseId && run.experiment?.variant === ab)) continue;
    const run = RunSchema.parse({id:`retrieval-${randomUUID()}`,datasetId:fixture.id,datasetVersion:fixture.version,corpusHash:fixture.corpusHash,
      name:`${caseId} · 후속 맥락 ${variant} 검색 · ${startedAt}`,strategy:`${variant} 저장된 모델 출력 재사용 · 검색만 실행`,environment:"isolated_spring",model:source.model,revision,startedAt,status:"completed",
      experiment:{kind:"search_retrieval",variant:ab,inputHash:source.experiment.inputHash,promptVersion:source.experiment.promptVersion,stages:[
        {id:"question_understanding",label:"저장된 질문 이해 결과",status:"not_run",durationMs:null,result:JSON.stringify({sourceRunId:input.sourceRunId,modelOutput:input.modelOutput},null,2),inputTokens:null,outputTokens:null},
        {id:"document_retrieval",label:"실제 SQL 검색 후보",status:"completed",durationMs:result.durationMs,result:JSON.stringify({...result,period:output.period,note:"문자열 조건은 검색어나 필터로 적용되지 않음. 후보는 읽은 문서나 검증된 근거가 아님."},null,2),inputTokens:null,outputTokens:null}]},
      results:[{caseId,status:"completed",candidates:result.candidates,answer:"검색 후보만 수집 · 문서 읽기와 답변 미실행",evidenceIds:[],latencyMs:result.durationMs,error:null}]});
    await mutateState({type:"import_run",data:run});
    console.log(JSON.stringify({caseId,variant,id:run.id,candidates:result.candidates.length,period:output.period}));
  }
}
main().then(()=>process.exit(0)).catch((error:unknown)=>{console.error(error instanceof Error ? error.message : "가져오기 실패");process.exit(1);});
