import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { mutateState, readState } from "../lib/db";
import { RunSchema } from "../lib/schema";

const outputSchema = z.object({baselineCandidates:z.array(z.string()),baselineMs:z.number(),planned:z.array(z.object({requestId:z.string(),query:z.string(),conditions:z.unknown(),candidates:z.array(z.string()),durationMs:z.number()})),period:z.unknown().nullable()});
const dir = resolve(process.cwd(), "../knot/backend/resume/search-improvement");

async function main() {
  const db = process.env.DATABASE_URL;
  if (!db || !["localhost","127.0.0.1","::1"].includes(new URL(db).hostname)) throw new Error("로컬 평가 DB가 아닙니다.");
  const state = await readState();
  const dataset = state.datasets.find(d => d.id === "knot-workspace-458" && d.version === "1.30" && d.locked);
  if (!dataset?.corpusHash) throw new Error("고정된 평가셋이 없습니다.");
  for (const [caseId, suffix] of [["S08-01","s08"],["S09-01","s09"]] as const) {
    const source = state.runs.find(r => r.revision === "question-understanding-v7-meeting-guard-v1" && r.results[0]?.caseId === caseId && r.strategy.includes("spring · schema"));
    if (!source?.experiment) throw new Error("원본 모델 실행 기록이 없습니다.");
    const path = resolve(dir, `search-link-output-${suffix}.json`);
    const measured = outputSchema.parse(JSON.parse(await readFile(path,"utf8")));
    const startedAt = (await stat(path)).mtime.toISOString();
    if (measured.planned.length !== 1) throw new Error("요청별 결과를 확인해야 합니다.");
    const plan = measured.planned[0];
    if (!plan) throw new Error("검색 결과가 없습니다.");
    for (const variant of ["A","B"] as const) {
      if (state.runs.some(r => r.revision === "search-link-v1" && r.experiment?.kind === "search_retrieval" && r.experiment.variant === variant && r.results[0]?.caseId === caseId && r.startedAt === startedAt)) {
        console.log(JSON.stringify({caseId,variant,status:"already_imported"}));
        continue;
      }
      const candidates = variant === "A" ? measured.baselineCandidates : plan.candidates;
      const elapsed = variant === "A" ? measured.baselineMs : plan.durationMs;
      const stageResult = variant === "A" ? {candidates,query:"원 질문",period:"기존 검색기 기준"} : {candidates,query:plan.query,conditions:plan.conditions,period:measured.period};
      const run = RunSchema.parse({id:`retrieval-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,
        name:`${caseId} · ${variant === "A" ? "기존 검색" : "질문 이해 후 검색"} · ${startedAt}`,
        strategy:variant === "A" ? "원 질문 검색 · 고정 시각 · 답변 생성 안 함" : `이전 Spring AI 모델 결과 재사용 ${source.id} · 고정 시각 · 답변 생성 안 함`,
        environment:"isolated_spring",model:source.model,revision:"search-link-v1",startedAt,status:"completed",
        experiment:{kind:"search_retrieval",variant,inputHash:source.experiment.inputHash,promptVersion:source.experiment.promptVersion,stages:[
          {id:"question_understanding",label:"질문 이해",status:"not_run",durationMs:null,result:variant === "A" ? "원 질문 사용" : `이전 실행의 실제 모델 결과 재사용: ${source.id}\n${source.results[0]?.answer ?? ""}`,inputTokens:null,outputTokens:null},
          {id:"document_retrieval",label:"문서 검색",status:"completed",durationMs:elapsed,result:JSON.stringify(stageResult,null,2),inputTokens:null,outputTokens:null}]},
        results:[{caseId,status:"completed",candidates,answer:"검색 후보 확인 · 답변 생성은 실행하지 않음",evidenceIds:[],latencyMs:elapsed,error:null}]});
      await mutateState({type:"import_run",data:run});
      console.log(JSON.stringify({caseId,variant,id:run.id,count:candidates.length,elapsed}));
    }
  }
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error ? error.message : "기록 실패");process.exit(1)});
