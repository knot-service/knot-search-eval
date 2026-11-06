import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Client } from "pg";
import { z } from "zod";
import original from "../data/synthetic-full-dataset.json";
import { DatasetSchema } from "../lib/schema";
import { sharedCaseReadiness } from "../lib/local-cases";

const Row = z.object({id:z.string(),title:z.string(),topic:z.string(),content:z.string(),summary:z.string().nullable(),status:z.string(),created_at:z.date(),archived_at:z.date().nullable(),started_at:z.date(),ended_at:z.date().nullable(),accumulated_recording_millis:z.union([z.string(),z.number()]).nullable()});
const Link = z.object({case_id:z.string(),physical_id:z.string(),role:z.enum(["expected_candidate","context"])});
async function main() {
 const db = new Client({host:"127.0.0.1",port:55440,database:"knot_eval",user:"knot_eval",password:"local-eval-only"});
 await db.connect();
 try {
  await db.query("BEGIN READ ONLY");
  const check=await db.query("SELECT current_database() AS name");
  if(check.rows[0]?.name !== "knot_eval") throw new Error("평가 전용 DB가 아닙니다.");
  const result=await db.query("SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id",[458]);
  const rows=z.array(Row).parse(result.rows);
  const count=await db.query("SELECT document_count FROM eval_shared_corpora WHERE workspace_id=$1",[458]);
  if(count.rows.length!==1 || Number(count.rows[0].document_count)!==rows.length || rows.some(x=>x.archived_at)) throw new Error("워크스페이스 문서 구성이 변경됐습니다.");
  const corpusHash=createHash("sha256").update(JSON.stringify(result.rows)).digest("hex");
  const links=z.array(Link).parse((await db.query("SELECT case_id,physical_id::text,role FROM eval_shared_case_links ORDER BY case_id,physical_id")).rows);
  const byId=new Map(rows.map(d=>[d.id,d]));
  const source=DatasetSchema.parse(original);
  const cases=source.cases.map(c=>{
   const relevant=links.filter(l=>l.case_id===c.id);
   const physicalIds=[...new Set(relevant.map(l=>l.physical_id))];
   const documents=physicalIds.map(id=>{
    const d=byId.get(id);if(!d) throw new Error(`문서 연결 오류: ${c.id}`);
    return {id:`document-${id}`,title:d.title,content:d.content,summary:d.summary,workspaceId:"workspace-458",accessible:true,meetingStartedAt:d.started_at.toISOString(),createdAt:d.created_at.toISOString(),fixtureStatus:"pending" as const,fixtureSource:"워크스페이스 458",fixtureReason:"기대 근거 후보: 실제 문서 내용과 공통 공간 조건 검수 필요"};
   });
   const expectedEvidenceIds=[...new Set(relevant.filter(l=>l.role==="expected_candidate").map(l=>`document-${l.physical_id}`))];
   const oldReadiness=sharedCaseReadiness(c);
   return {...c,documents,expectedEvidenceIds,...(!oldReadiness.ready ? {executionHoldReason:oldReadiness.reason} : {})};
  });
  const dataset=DatasetSchema.parse({id:"knot-workspace-458",name:"탐색 평가셋 · 워크스페이스 458",version:"1.0",source:"synthetic",corpusHash,cases});
  await writeFile("data/workspace-458-dataset.json",JSON.stringify(dataset)+"\n");
  await db.query("COMMIT");
  console.log(JSON.stringify({cases:cases.length,documents:rows.length,casesWithEvidenceCandidates:cases.filter(c=>c.expectedEvidenceIds.length).length,pendingReview:true}));
 } finally {await db.end();}
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:"생성 실패");process.exitCode=1});
