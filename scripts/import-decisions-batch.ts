import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { mutateState, readState } from "../lib/db";
import { RunSchema } from "../lib/schema";

const directory = resolve(process.cwd(), "../knot/backend/resume/search-improvement/decision-api-runs");
const names = ["uses_prior_context", "needs_stored_documents", "contains_multiple_requests"] as const;
const fixture = z.object({caseId:z.enum(["S08-01","S09-01","QX-01","QG-02"]),startedAt:z.string().datetime({offset:true}),repeat:z.number().int().min(1).max(2),model:z.literal("gpt-6-luna"),status:z.literal("completed"),httpStatus:z.literal(200),durationMs:z.number().nonnegative(),answers:z.array(z.object({type:z.literal("predicate"),name:z.string(),probability:z.number().min(0).max(1)})).length(3),expected:z.array(z.boolean()).length(3),usage:z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative()})});

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !["localhost","127.0.0.1","::1"].includes(new URL(databaseUrl).hostname)) throw new Error("로컬 평가 DB가 아닙니다.");
  const state = await readState();
  const pool = new Pool({connectionString:databaseUrl});
  let imported = 0, reviewed = 0;
  try {
    for (const filename of (await readdir(directory)).filter(name => /^(S08-01|S09-01|QX-01|QG-02)-[0-9a-f-]+\.json$/.test(name)).sort()) {
      const parsed = fixture.parse(JSON.parse(await readFile(resolve(directory, filename),"utf8")));
      if (!names.every((name, index) => parsed.answers[index]?.name === name)) throw new Error("판정 항목 순서가 다릅니다.");
      const datasetId = parsed.caseId === "QX-01" ? "question-contract-fixtures" : parsed.caseId === "QG-02" ? "question-guard-fixtures" : "knot-workspace-458";
      const datasetVersion = datasetId === "knot-workspace-458" ? "1.30" : "1.0";
      const dataset = state.datasets.find(d => d.id === datasetId && d.version === datasetVersion && d.locked);
      const item = dataset?.cases.find(c => c.id === parsed.caseId);
      if (!dataset?.corpusHash || !item) throw new Error("고정 평가 사례를 찾지 못했습니다.");
      const id = `decisions-${filename.slice(parsed.caseId.length + 1, -5)}`;
      const inputHash = createHash("sha256").update(JSON.stringify({history:item.history,question:item.question,questions:names})).digest("hex");
      const judgments = parsed.answers.map((answer,index) => ({name:answer.name,probability:answer.probability,expected:parsed.expected[index],matchesAtIllustrativeThreshold:(answer.probability >= 0.5) === parsed.expected[index]}));
      const discrepancies = judgments.filter(item => !item.matchesAtIllustrativeThreshold).map(item => item.name);
      const note = discrepancies.length ? `임시 0.5 기준 불일치: ${discrepancies.join(", ")}. 입력·질문 문구의 영향도 추가 검토 필요. 전체 질문 이해 품질 판정이 아님.` : "임시 0.5 기준 세 판단이 합성 기대와 일치. 검색어·조건 추출과 전체 질문 이해 품질은 평가하지 않음.";
      const resultText = JSON.stringify({threshold:"0.5는 비교용 임시 기준이며 확률 보정이나 운영 기준 아님",judgments,usage:parsed.usage},null,2);
      const run = RunSchema.parse({id,datasetId,datasetVersion,corpusHash:dataset.corpusHash,name:`${parsed.caseId} · Decisions 질문 판단 · 반복 ${parsed.repeat} · ${parsed.startedAt}`,strategy:`OpenAI Decisions · 판단 3개 · 호출 1 · 반복 ${parsed.repeat}`,environment:"direct_model",model:parsed.model,revision:"decision-predicate-v1",startedAt:parsed.startedAt,status:"completed",experiment:{kind:"question_understanding",variant:"A",inputHash,promptVersion:"decision-predicate-v1",stages:[{id:"question_understanding",label:"Decisions 질문 판단 3개",status:"completed",durationMs:parsed.durationMs,result:resultText,inputTokens:parsed.usage.input_tokens,outputTokens:parsed.usage.output_tokens}]},results:[{caseId:parsed.caseId,status:"completed",candidates:[],answer:resultText,evidenceIds:[],latencyMs:parsed.durationMs,error:null}]});
      if (!state.runs.some(existing => existing.id === id)) { await mutateState({type:"import_run",data:run}); imported++; }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const row = await client.query("SELECT data FROM eval_state WHERE id=1 FOR UPDATE");
        const data = row.rows[0].data;
        if (!data.reviews.some((review: {runId?:string;stageId?:string;reviewer?:string}) => review.runId === id && review.stageId === "question_understanding" && review.reviewer === "AI 검수 (Codex)")) {
          data.reviews.push({id:randomUUID(),datasetId,datasetVersion,caseId:parsed.caseId,runId:id,stageId:"question_understanding",outcome:discrepancies.length ? "incorrect" : "correct",notes:note,reviewer:"AI 검수 (Codex)",createdAt:new Date().toISOString()});
          await client.query("UPDATE eval_state SET data=$1::jsonb WHERE id=1",[JSON.stringify(data)]);
          reviewed++;
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
  } finally { await pool.end(); }
  console.log(JSON.stringify({imported,reviewed}));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error ? error.message : "가져오기 실패");process.exit(1)});
