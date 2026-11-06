import {loadEnvConfig} from '@next/env';
import {Pool,Client} from 'pg';
import {createHash} from 'node:crypto';
import {DatasetSchema,type DataState} from '../lib/schema';
import {applyAction} from '../lib/state';
import {workspaceV116,v116Ids} from '../lib/workspace-v116';
loadEnvConfig(process.cwd());
async function main(){
 if(!process.env.DATABASE_URL) throw new Error('평가 저장소 설정 없음');
 const local=new Client({host:'127.0.0.1',port:55440,database:'knot_eval',user:'knot_eval',password:'local-eval-only'});await local.connect();
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
 try{
  await client.query('BEGIN');const data=await client.query('SELECT data FROM eval_state WHERE id=1 FOR UPDATE');let state:DataState=data.rows[0]?.data;
  const source=state?.datasets.find(d=>d.id==='knot-workspace-458'&&d.version==='1.15');
  if(!source||state.datasets.some(d=>d.id===source.id&&d.version==='1.16'))throw new Error('기준 또는 신규 버전 불일치');
  const docs=await local.query('SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id',[458]);
  const hash=createHash('sha256').update(JSON.stringify(docs.rows)).digest('hex');
  if(docs.rowCount!==90||hash!==source.corpusHash)throw new Error('공통 문서 버전 불일치');
  const reviews=new Map(state.reviews.filter(r=>r.datasetId===source.id&&r.datasetVersion===source.version&&!r.runId).map(r=>[r.caseId,r]));
  if(reviews.size!==255||[...v116Ids].some(id=>reviews.get(id)?.outcome!=='correct'))throw new Error('검수 상태가 바뀌었거나 검수 결과가 누락됨');
  const next=workspaceV116(DatasetSchema.parse(source));
  state=applyAction(state,{type:'import_dataset',data:next});
  for(const item of next.cases){
   const prior=reviews.get(item.id);if(!prior)throw new Error('검수 결과 누락');
   const revised=v116Ids.has(item.id);
   state=applyAction(state,{type:'review',datasetId:next.id,datasetVersion:next.version,caseId:item.id,outcome:revised?'correct':prior.outcome,notes:(revised?`[AI 수정 검토] 질문과 이전 대화의 답변을 실제 Spring에 보내어 결과를 검토할 수 있음을 확인함. 도구 호출 생략 등 추적이 필요한 별도 조건은 검증된 것으로 간주하지 않음. 이전 판정: ${prior.notes}`:`v1.15 검수 이관: ${prior.notes}`).slice(0,5000)});
  }
  if(!process.argv.includes('--apply')){await client.query('ROLLBACK');console.log(JSON.stringify({preview:true,revised:v116Ids.size,cases:next.cases.length}));return;}
  await client.query('UPDATE eval_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(state)]);await client.query('COMMIT');
  console.log(JSON.stringify({version:next.version,revised:v116Ids.size,cases:next.cases.length,runsPreserved:state.runs.length}));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
 finally{client.release();await pool.end();await local.end();}
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:'반영 실패');process.exitCode=1});
