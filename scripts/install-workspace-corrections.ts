import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { DatasetSchema, type DataState } from "../lib/schema";
import { applyAction } from "../lib/state";
import { correctedWorkspaceDataset, correctionOutcome, isCorrectedCase } from "../lib/workspace-corrections";

loadEnvConfig(process.cwd());
async function main() {
 if (!process.env.DATABASE_URL) throw new Error("평가 저장소 설정이 없습니다.");
 const pool = new Pool({connectionString:process.env.DATABASE_URL});
 const client = await pool.connect();
 try {
  await client.query("BEGIN");
  const result = await client.query("SELECT data FROM eval_state WHERE id=1 FOR UPDATE");
  let state: DataState = result.rows[0]?.data;
  if (!state) throw new Error("평가 상태가 없습니다.");
  const source = state.datasets.find(d => d.id === "knot-workspace-458" && d.version === "1.0");
  if (!source) throw new Error("기준 평가셋이 없습니다.");
  if (state.datasets.some(d => d.id === source.id && d.version === "1.2")) throw new Error("새 버전이 이미 있습니다.");
  const corrected = correctedWorkspaceDataset(DatasetSchema.parse(source));
  const latest = new Map(state.reviews.filter(r => r.datasetId === source.id && r.datasetVersion === source.version && !r.runId).map(r => [r.caseId,r]));
  if (latest.size !== source.cases.length) throw new Error("기존 검수 결과가 완전하지 않습니다.");
  state = applyAction(state,{type:"import_dataset",data:corrected});
  let transferred=0, changed=0;
  for (const item of corrected.cases) {
   const prior = latest.get(item.id);
   if (!prior) throw new Error("기존 검수 결과가 누락됐습니다.");
   const correctedCase = isCorrectedCase(item.id);
   const outcome = correctedCase ? correctionOutcome(item.id) : prior.outcome;
   const notes = correctedCase
     ? `[AI 재검토] ${item.scenario === "S75" ? "공통 문서의 제목·요약·본문에서 Redis/레디스/cluster/클러스터를 확인했으며 관련 표기를 찾지 못함." : item.scenario === "S28" ? "공통 문서에서 푸시·push 표기를 찾지 못했고 알림 관련 문서를 대조함." : "질문·기대 유형·이전 대화 또는 실행 보류 사유를 수정함."} 기존 검수: ${prior.notes}`
     : `v1.0 검수 이관 (변경 없음): ${prior.notes}`;
   state = applyAction(state,{type:"review",datasetId:corrected.id,datasetVersion:corrected.version,caseId:item.id,outcome,notes:notes.slice(0,5000)});
   if (correctedCase) changed++; else transferred++;
  }
  await client.query("UPDATE eval_state SET data=$1::jsonb WHERE id=1",[JSON.stringify(state)]);
  await client.query("COMMIT");
  console.log(JSON.stringify({version:corrected.version,cases:corrected.cases.length,changed,transferred,runsPreserved:state.runs.length}));
 } catch (e) {
  await client.query("ROLLBACK");
  throw e;
 } finally {
  client.release();
  await pool.end();
 }
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:"평가셋 반영 실패");process.exitCode=1});
