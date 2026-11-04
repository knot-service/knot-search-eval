import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { z } from "zod";
import { mutateState, readState } from "../lib/db";
import { RunSchema } from "../lib/schema";

const dir = resolve(process.cwd(), "../knot/backend/resume/search-improvement");
const measuredSchema = z.object({ planned:z.array(z.object({query:z.string(),conditions:z.unknown(),candidates:z.array(z.string()),durationMs:z.number().nonnegative()})).length(1),period:z.unknown().nullable() });
const sourceId = "question-06fe8009-6803-4e33-80a9-3dd881897640";
async function main() {
  const db = process.env.DATABASE_URL;
  if (!db || !["localhost","127.0.0.1","::1"].includes(new URL(db).hostname)) throw new Error("로컬 평가 DB가 아닙니다.");
  const state = await readState();
  const dataset = state.datasets.find(d => d.id === "knot-workspace-458" && d.version === "1.30" && d.locked);
  const source = state.runs.find(r => r.id === sourceId);
  if (!dataset?.corpusHash || !source?.experiment) throw new Error("기준 평가셋 또는 원본 실행 없음");
  const local = new pg.Client({host:"127.0.0.1",port:55441,database:"knot_lab",user:"knot_lab",password:"knot-lab-local-only"});
  await local.connect();
  try {
    const rows = await local.query("SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id",[458]);
    const hash = createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex");
    if(rows.rowCount !== 90 || hash !== dataset.corpusHash) throw new Error("합성 문서 버전 불일치");
  } finally { await local.end(); }
  for (const [label,variant] of [["raw","A"],["guarded","B"]] as const) {
    const file = resolve(dir,`condition-impact-s08-${label}-output.json`);
    const inputFile = resolve(dir,`condition-impact-s08-${label}-input.json`);
    const result = measuredSchema.parse(JSON.parse(await readFile(file,"utf8")));
    const input = JSON.parse(await readFile(inputFile,"utf8"));
    const entry = result.planned[0]; if (!entry) throw new Error("검색 결과 없음");
    const startedAt = (await stat(file)).mtime.toISOString();
    if(state.runs.some(r=>r.revision==="condition-impact-v1" && r.experiment?.variant===variant && r.startedAt===startedAt)) continue;
    const title = variant === "A" ? "모델 원본: 회의 추가" : "서버 보정: 회의 제거";
    const run=RunSchema.parse({id:`impact-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,name:`S08-01 · ${title} · ${startedAt}`,
      strategy:`${title} · 저장된 모델 출력 재사용 · 문서 확인 미실행`,environment:"isolated_spring",model:source.model,revision:"condition-impact-v1",startedAt,status:"completed",
      experiment:{kind:"search_retrieval",variant,inputHash:source.experiment.inputHash,promptVersion:"condition-impact-v1",stages:[
        {id:"question_understanding",label:"저장된 질문 이해 결과",status:"not_run",durationMs:null,result:`원본 실행: ${sourceId}\n${JSON.stringify(input.modelOutput,null,2)}`,inputTokens:null,outputTokens:null},
        {id:"document_retrieval",label:"실제 SQL 검색 후보",status:"completed",durationMs:entry.durationMs,result:JSON.stringify({...entry,period:result.period,note:"문자열 조건은 필터로 적용하지 않았고 회의는 검색어의 가중치 항목입니다. 후보는 검증된 근거가 아닙니다."},null,2),inputTokens:null,outputTokens:null}]},
      results:[{caseId:"S08-01",status:"completed",candidates:entry.candidates,answer:`${title} · 검색 후보만 수집 · 기대 문서 document-2149 ${entry.candidates.indexOf("document-2149")+1}위`,evidenceIds:[],latencyMs:entry.durationMs,error:null}]});
    await mutateState({type:"import_run",data:run}); console.log(JSON.stringify({id:run.id,variant,query:entry.query,count:entry.candidates.length}));
  }
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error ? error.message : "가져오기 실패");process.exit(1)});
