import {loadEnvConfig} from '@next/env';
import {Client,Pool} from 'pg';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {DatasetSchema,type DataState,type EvalCase} from '../lib/schema';
import {applyAction} from '../lib/state';
import {workspaceV13,revisedIds} from '../lib/workspace-v13';

loadEnvConfig(process.cwd());
const localConfig={host:'127.0.0.1',port:55440,database:'knot_eval',user:'knot_eval',password:'local-eval-only'};
const selectCorpus='SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id';
const digest=(rows:unknown)=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function main(){
 if (!process.env.DATABASE_URL) throw new Error('평가 저장소 설정 없음');
 const local=new Client(localConfig); const pool=new Pool({connectionString:process.env.DATABASE_URL});
 await local.connect(); const remote=await pool.connect(); let localCommitted=false;
 try {
  await remote.query('BEGIN');
  const stateResult=await remote.query('SELECT data FROM eval_state WHERE id=1 FOR UPDATE');
  let state:DataState=stateResult.rows[0]?.data;
  const source=state?.datasets.find(d=>d.id==='knot-workspace-458'&&d.version==='1.2');
  if (!source || state.datasets.some(d=>d.id===source.id&&d.version==='1.3')) throw new Error('기준 또는 신규 버전 상태 불일치');
  await local.query('BEGIN');
  await local.query('SELECT pg_advisory_xact_lock($1)',[458013]);
  const database=await local.query('SELECT current_database() AS name');
  if (database.rows[0].name!=='knot_eval') throw new Error('로컬 평가 DB가 아님');
  const before=await local.query(selectCorpus,[458]);
  if (before.rowCount!==90 || digest(before.rows)!==source.corpusHash) throw new Error('기존 문서 버전이나 개수가 변경됨');
  const originals=await local.query('SELECT d.id::text,d.content,d.summary,d.created_at,r.started_at,r.ended_at,r.last_seen_at FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=458 AND d.id IN (2142,2174) ORDER BY d.id');
  if (originals.rowCount!==2) throw new Error('수정 대상 문서 없음');
  const snapshotPath='/Users/yongtae/Desktop/knot/backend/resume/search-eval/runtime/workspace-458-before-v13.json';
  if(process.argv.includes('--apply')) writeFileSync(snapshotPath,JSON.stringify({version:'1.2',corpusHash:source.corpusHash,corpus:before.rows,originals:originals.rows},null,2),{mode:0o600,flag:'wx'});
  const changed=await local.query("UPDATE documents SET created_at=$1, content=replace(content,$2,$3) WHERE id=2142 AND workspace_id=458 AND content LIKE '%' || $2 || '%' RETURNING id",['2026-10-24T05:00:00Z','이전 논의에서 정한 목표','10월 20일 회의에서 정한 목표']);
  if (changed.rowCount!==1) throw new Error('문서 2142 본문 사전 조건 불일치');
  const rec=await local.query("UPDATE recording_sessions SET started_at=$1,ended_at=$2,last_seen_at=$2 WHERE id=(SELECT recording_session_id FROM documents WHERE id=2142 AND workspace_id=458) AND workspace_id=458 RETURNING id",['2026-10-24T04:00:00Z','2026-10-24T04:35:00Z']);
  if (rec.rowCount!==1) throw new Error('회의 시각 수정 실패');
  const sum=await local.query("UPDATE documents SET summary=$1 WHERE id=2174 AND workspace_id=458 AND summary LIKE '%일정을 확정했다%' RETURNING id",['팀은 다음 출시 주기의 후보 검토를 시작하기로 했다. 후보 목록과 구체적인 검토 일정, 담당자는 미정이다.']);
  if (sum.rowCount!==1) throw new Error('문서 2174 요약 사전 조건 불일치');
  const after=await local.query(selectCorpus,[458]); const hash=digest(after.rows);
  const documents=new Map<string,EvalCase['documents'][number]>();
  for(const row of after.rows){
   const old=source.cases.flatMap(c=>c.documents).find(d=>d.id===`document-${row.id}`);
   if(old) documents.set(old.id,{...old,title:row.title,content:row.content,summary:row.summary,createdAt:row.created_at.toISOString(),meetingStartedAt:row.started_at.toISOString()});
  }
  const next=workspaceV13(DatasetSchema.parse(source),documents,hash);
  const latest=new Map(state.reviews.filter(r=>r.datasetId===source.id&&r.datasetVersion===source.version&&!r.runId).map(r=>[r.caseId,r]));
  if(latest.size!==source.cases.length) throw new Error('기존 검수 결과 누락');
  state=applyAction(state,{type:'import_dataset',data:next});
  for(const c of next.cases){
   const prior=latest.get(c.id); if(!prior) throw new Error('검수 결과 누락');
   const revised=revisedIds.has(c.id);
   const outcome=revised ? (c.scenario==='S03'||c.scenario==='S39'?'correct':'hold') : prior.outcome;
   const notes=revised ? `[AI 수정 검토] ${c.scenario==='S03'?'합성 문서의 회의 선후 관계와 이전 목표 출처를 명확히 함.':c.scenario==='S39'?'요약·본문 충돌을 수정하고 기준 시각 및 장애 조건을 명시함. 장애 주입은 실행 보류.':'공통 문서와 모순되지 않도록 질문을 구체화함. 문서 전체의 의미적 부재 확인 필요.'} 이전 판정: ${prior.notes}` : `v1.2 검수 이관: ${prior.notes}`;
   state=applyAction(state,{type:'review',datasetId:next.id,datasetVersion:next.version,caseId:c.id,outcome,notes:notes.slice(0,5000)});
  }
  await remote.query('UPDATE eval_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(state)]);
  if(!process.argv.includes('--apply')){await local.query('ROLLBACK');await remote.query('ROLLBACK');console.log(JSON.stringify({preview:true,cases:next.cases.length,revised:revisedIds.size,oldHash:source.corpusHash,newHash:hash,backup:snapshotPath}));return;}
  await local.query('COMMIT'); localCommitted=true;
  try {await remote.query('COMMIT');} catch(e){
   let committed: boolean;
   try {
    const check=await pool.query('SELECT data FROM eval_state WHERE id=1');
    const stored: DataState = check.rows[0]?.data;
    committed=Boolean(stored?.datasets.some(d=>d.id===next.id && d.version===next.version && d.corpusHash===hash));
   } catch {
    throw new Error('원격 저장 성공 여부를 확인할 수 없음. 로컬 문서는 유지했으며 백업과 원격 상태 확인 필요');
   }
   if(committed) {console.log(JSON.stringify({version:next.version,commitConfirmed:true,newHash:hash,backup:snapshotPath}));return;}
   await local.query('BEGIN');
   const current=await local.query(selectCorpus,[458]);
   if(digest(current.rows)!==hash) throw new Error('원격 저장 실패 후 로컬 문서가 변경되어 자동 복구 중단. 백업 확인 필요');
   for(const row of originals.rows){
    await local.query('UPDATE documents SET content=$1,summary=$2,created_at=$3 WHERE id=$4 AND workspace_id=458',[row.content,row.summary,row.created_at,row.id]);
    await local.query('UPDATE recording_sessions SET started_at=$1,ended_at=$2,last_seen_at=$3 WHERE id=(SELECT recording_session_id FROM documents WHERE id=$4 AND workspace_id=458)',[row.started_at,row.ended_at,row.last_seen_at,row.id]);
   }
   await local.query('COMMIT'); localCommitted=false; throw e;
  }
  console.log(JSON.stringify({version:next.version,cases:next.cases.length,revised:revisedIds.size,runsPreserved:state.runs.length,oldHash:source.corpusHash,newHash:hash,backup:snapshotPath}));
 } catch(e){if(!localCommitted) await local.query('ROLLBACK').catch(()=>{});await remote.query('ROLLBACK').catch(()=>{});throw e;}
 finally{remote.release();await pool.end();await local.end();}
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:'반영 실패');process.exitCode=1});
