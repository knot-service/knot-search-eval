import { randomUUID, createHash, createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { readSpringStream } from './spring-stream';
import type { EvalCase, Run } from './schema';

const runDocker=promisify(execFile);
const directory='/Users/yongtae/Desktop/knot/backend/resume/search-eval/local-runner/clock-control';
const common={host:'127.0.0.1',port:55440,user:'knot_eval',password:'local-eval-only',connectionTimeoutMillis:3000};
const syntheticId=940068;
const targetDates:Record<string,string>={'S68-01':'2026-10-29T01:00:00.000Z','S68-02':'2026-10-29T01:00:00.000Z','S68-03':'2026-11-02T01:00:00.000Z'};
function cookie(offset:number):string {
 const now=Math.floor(Date.now()/1000)+offset;
 const enc=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const body=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:'1',iss:'https://knoted.kr',aud:['knot-api'],iat:now,exp:now+300,token_type:'ACCESS',nickname:'평가자'})}`;
 return `KNOT_ACCESS_TOKEN=${body}.${createHmac('sha256','local-evaluation-only-secret-not-for-other-environments').update(body).digest('base64url')}`;
}
async function setOffset(offset:number):Promise<void> {
 const tmp=`${directory}/timing-${randomUUID()}`;
 await writeFile(tmp,`${offset}\n`,{mode:0o644,flag:'wx'});
 await rename(tmp,`${directory}/offset`);
}
async function ensureServer():Promise<string> {
 const inspected=await runDocker('docker',['inspect','--format','{{.State.Running}} {{.Image}}','knot-eval-timing-prototype'],{timeout:3000});
 const image=await runDocker('docker',['image','inspect','--format','{{.Id}}','knot-eval-timing-prototype'],{timeout:3000});
 const digest=image.stdout.trim();const state=inspected.stdout.trim();
 if(!/^sha256:[a-f0-9]{64}$/.test(digest)||![`true ${digest}`,`false ${digest}`].includes(state))throw new Error('시점 실험 서버 이미지가 다릅니다');
 const env=await runDocker('docker',['inspect','--format','{{range .Config.Env}}{{println .}}{{end}}','knot-eval-timing-prototype'],{timeout:3000});
 const vars=new Set(env.stdout.split(/\r?\n/));
 if(!vars.has('DB_URL=jdbc:postgresql://postgres:5432/knot_eval_timing')||!vars.has('EVAL_SEARCH_BARRIER_FILE=/eval-clock/gate'))throw new Error('시점 실험 서버 격리를 확인할 수 없습니다');
 if(state.startsWith('false '))await runDocker('docker',['start','knot-eval-timing-prototype'],{timeout:15000});
 for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:18085/api/v1/auth/csrf',{signal:AbortSignal.timeout(1000)});if(r.ok)return digest;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
 throw new Error('시점 실험 서버가 응답하지 않습니다');
}
async function checkCorpus(db:Client,hash?:string):Promise<string> {
 const result=await db.query("SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id",[458]);
 if(result.rowCount!==90)throw new Error('시점 실험 사본의 문서 개수가 다릅니다');
 const actual=createHash('sha256').update(JSON.stringify(result.rows)).digest('hex');
 if(hash&&hash!==actual)throw new Error('시점 실험 사본의 문서 내용이 다릅니다');
 return actual;
}
export async function executeTimingCase(c:EvalCase,dataset:{readonly id:string;readonly version:string;readonly corpusHash?:string}):Promise<Run> {
 const target=targetDates[c.id];if(!target||c.executionFixture!=='document_after_intake')throw new Error('지원하지 않는 시점 실험입니다');
 const digest=await ensureServer();const lock=new Client({...common,database:'knot_eval_clock'});const db=new Client({...common,database:'knot_eval_timing'});await lock.connect();await db.connect();
 let held=false,gate=false,fixture=false;let offsetChanged=false;
 const startedAt=new Date().toISOString(), start=performance.now();const requestId=randomUUID();const token=randomUUID();
 try {
  const locked=await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',['knot-eval-clock-run']);if(!locked.rows[0].ok)throw new Error('다른 시각 제어 실험이 진행 중입니다');held=true;
  for(const client of [lock,db]){const pending=await client.query("SELECT count(*)::int AS n FROM search_answer_executions WHERE state IN ('QUEUED','RUNNING')");if(pending.rows[0].n!==0)throw new Error('이전 실험이 아직 진행 중입니다');}
  const hash=await checkCorpus(db,dataset.corpusHash);
  const exists=await db.query('SELECT count(*)::int AS n FROM recording_sessions WHERE id=$1',[syntheticId]);if(exists.rows[0].n)throw new Error('이전 시점 실험 자료가 남아 있습니다');
  const at=new Date(target);const startTime=new Date(at.getTime()-3600_000),endTime=new Date(at.getTime()-1800_000),transcribed=new Date(at.getTime()-1740_000),createdAt=new Date(at.getTime()+60_000);
  await db.query('BEGIN');
  await db.query(`INSERT INTO recording_sessions(id,workspace_id,member_id,request_id,tab_id,control_token_hash,status,started_at,ended_at,last_seen_at,accumulated_recording_millis,end_reason) OVERRIDING SYSTEM VALUE VALUES($1,458,1,$2,$3,repeat('d',64),'ENDED',$4,$5,$5,1800000,'USER_ENDED')`,[syntheticId,randomUUID(),randomUUID(),startTime,endTime]);
  await db.query('INSERT INTO transcripts(id,recording_session_id,content,created_at) OVERRIDING SYSTEM VALUE VALUES($1,$1,$2,$3)',[syntheticId,'시점 평가를 위한 합성 발언',transcribed]);
  await db.query('COMMIT');fixture=true;
  const offset=Math.round((at.getTime()-Date.now())/1000);await setOffset(offset);offsetChanged=true;
  await writeFile(`${directory}/gate`,token,{mode:0o644,flag:'wx'});gate=true;
  const base='http://127.0.0.1:18085';const prep=await fetch(base+'/api/v1/auth/csrf',{signal:AbortSignal.timeout(5000)});if(!prep.ok)throw new Error('인증 준비 실패');
  const csrf=await prep.json() as {token:string};const xsrf=prep.headers.getSetCookie().find(x=>x.startsWith('XSRF-TOKEN='))?.split(';')[0];if(!xsrf)throw new Error('인증 쿠키 없음');
  const request=fetch(base+'/api/v1/workspaces/458/search/conversations',{method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream',cookie:`${cookie(offset)}; ${xsrf}`,'X-XSRF-TOKEN':csrf.token},body:JSON.stringify({content:c.question,requestId}),signal:AbortSignal.timeout(90000)}).then(async response=>{if(!response.ok||!response.body)throw new Error(`Spring 요청 실패 (${response.status})`);return readSpringStream(response.body)});
  void request.catch(()=>{});
  let reached=false;for(let i=0;i<400;i++){const log=await runDocker('docker',['logs','--tail','100','knot-eval-timing-prototype'],{timeout:3000,maxBuffer:2_000_000});if(log.stdout.includes(`EVAL_RETRIEVAL_WAIT ${token}`)){reached=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  if(!reached)throw new Error('검색 대기 지점을 확인하지 못했습니다');
  const accepted=await db.query('SELECT m.created_at FROM search_request_receipts r JOIN search_messages m ON m.id=r.question_message_id WHERE r.request_id=$1 AND r.workspace_id=458',[requestId]);
  const acceptedAt=accepted.rows[0]?.created_at;if(accepted.rowCount!==1||!(acceptedAt instanceof Date)||Math.abs(acceptedAt.getTime()-at.getTime())>30000)throw new Error('실제 질문 접수 시각이 다릅니다');
  await setOffset(Math.round((createdAt.getTime()-Date.now())/1000));
  const topic='결제·정산';const subject=c.id==='S68-03'?'정기 결제':'카드 결제';
  await db.query('BEGIN');
  await db.query(`INSERT INTO document_generation_batches(id,recording_session_id,transcript_id,topic_registration_state,accepted_at,registered_at,processing_status,succeeded_count,finished_at) OVERRIDING SYSTEM VALUE VALUES($1,$1,$1,'TOPICS_REGISTERED',$2,$2,'SUCCEEDED',1,$3)`,[syntheticId,transcribed,createdAt]);
  await db.query('INSERT INTO document_generation_batch_topics(batch_id,position,topic) VALUES($1,0,$2)',[syntheticId,topic]);
  await db.query("INSERT INTO document_generation_jobs(id,transcript_id,status,created_at,updated_at,batch_id,stage,topic) OVERRIDING SYSTEM VALUE VALUES($1,$1,'SUCCEEDED',$2,$3,$1,'GENERATION',$4)",[syntheticId,transcribed,createdAt,topic]);
  const added=await db.query("INSERT INTO documents(id,workspace_id,recording_session_id,source_transcript_id,document_generation_job_id,topic,title,summary,content,status,created_at) OVERRIDING SYSTEM VALUE VALUES($1,458,$1,$1,$1,$2,$3,$4,$5,'DRAFT',$6) RETURNING created_at",[syntheticId,topic,`${subject} 신규 정책`, '접수 뒤 생성한 합성 기록',`## 핵심 요약\n${subject}의 수수료를 99퍼센트로 정했다.\n## 결정\n- 수수료 99퍼센트.`,createdAt]);
  await db.query('COMMIT');if(added.rows[0].created_at<=acceptedAt)throw new Error('문서 생성 순서가 다릅니다');
  await unlink(`${directory}/gate`);gate=false;const result=await request;
  const evidence=result.evidenceIds.map(id=>`document-${id}`);const included=evidence.includes(`document-${syntheticId}`)||/99\s*(퍼센트|%)/.test(result.answer);
  return {id:`timing-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:hash,name:`${c.id} · ${startedAt}`,strategy:included?'접수 후 문서 사용 의심 · 시간 사본':'접수 후 문서 생성 · 시간 사본',environment:'isolated_spring',model:process.env.LOCAL_EVAL_MODEL||'로컬 설정 모델 (확인 필요)',revision:`timing ${digest}`,startedAt,status:result.status==='completed'?'completed':'failed',results:[{caseId:c.id,status:result.status==='completed'?'completed':'failed',candidates:[],answer:result.answer,evidenceIds:evidence,latencyMs:Math.round(performance.now()-start),error:result.failureCode??null}]};
 } finally {
  await db.query('ROLLBACK').catch(()=>{});
  if(gate)await unlink(`${directory}/gate`).catch(()=>{});
  if(fixture){
   const refs=await db.query('SELECT count(*)::int AS n FROM search_evidences WHERE document_id=$1',[syntheticId]);
   if(refs.rows[0].n===0){await db.query('BEGIN');await db.query('DELETE FROM documents WHERE id=$1 AND workspace_id=458',[syntheticId]);await db.query('DELETE FROM document_generation_jobs WHERE id=$1 AND transcript_id=$1',[syntheticId]);await db.query('DELETE FROM document_generation_batch_topics WHERE batch_id=$1',[syntheticId]);await db.query('DELETE FROM document_generation_batches WHERE id=$1 AND recording_session_id=$1',[syntheticId]);await db.query('DELETE FROM transcripts WHERE id=$1 AND recording_session_id=$1',[syntheticId]);await db.query('DELETE FROM recording_sessions WHERE id=$1 AND workspace_id=458',[syntheticId]);await db.query('COMMIT');}
  }
  if(offsetChanged)await setOffset(0);
  if(held)await lock.query('SELECT pg_advisory_unlock(hashtext($1))',['knot-eval-clock-run']);
  await db.end();await lock.end();
 }
}
