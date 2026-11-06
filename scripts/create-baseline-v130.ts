import {loadEnvConfig} from '@next/env';
import {Pool} from 'pg';
import {DatasetSchema,type DataState} from '../lib/schema';
import {applyAction} from '../lib/state';
import {sharedCaseReadiness} from '../lib/local-cases';
loadEnvConfig(process.cwd());
async function main(){
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
 try{
  await client.query('BEGIN');const db=await client.query('SELECT current_database() AS name');if(db.rows[0].name!=='knot_eval')throw Error('로컬 평가 DB가 아닙니다');
  const result=await client.query('SELECT data FROM eval_state WHERE id=1 FOR UPDATE');let state:DataState=result.rows[0].data;
  const source=state.datasets.find(d=>d.id==='knot-workspace-458'&&d.version==='1.29');if(!source||state.datasets.some(d=>d.id===source.id&&d.version==='1.30'))throw Error('기준 버전을 확인하거나 중복을 해결해야 합니다');
  const latest=new Map(state.reviews.filter(r=>r.datasetId===source.id&&r.datasetVersion===source.version&&!r.runId).map(r=>[r.caseId,r]));
  if(latest.size!==255)throw Error('검수 이력이 누락됐습니다');
  const baseline=DatasetSchema.parse({...source,version:'1.30',name:'탐색 평가셋 · 일반 탐색 기준선'});
  const ready=baseline.cases.filter(c=>sharedCaseReadiness(c,new Date(),latest.get(c.id)?.outcome).ready).length;
  if(ready!==225)throw Error(`실행 준비 수가 예상과 다릅니다: ${ready}`);
  state=applyAction(state,{type:'import_dataset',data:baseline});
  for(const c of baseline.cases){const previous=latest.get(c.id);if(!previous)throw Error('검수 누락');state=applyAction(state,{type:'review',datasetId:baseline.id,datasetVersion:baseline.version,caseId:c.id,outcome:previous.outcome,notes:`v1.29 검수 이관: ${previous.notes}`.slice(0,5000)});}
  if(!process.argv.includes('--apply')){await client.query('ROLLBACK');console.log(JSON.stringify({preview:true,ready,total:baseline.cases.length,runsPreserved:state.runs.length}));return;}
  await client.query('UPDATE eval_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(state)]);await client.query('COMMIT');console.log(JSON.stringify({version:baseline.version,ready,total:baseline.cases.length,runsPreserved:state.runs.length}));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'실패');process.exitCode=1});
