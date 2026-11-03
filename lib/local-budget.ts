import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { executeSharedCase } from './local-spring';
import type { EvalCase, Run } from './schema';
const docker=promisify(execFile);
const directory='/Users/yongtae/Desktop/knot/backend/resume/search-eval/local-runner/clock-control';
const common={host:'127.0.0.1',port:55440,user:'knot_eval',password:'local-eval-only',connectionTimeoutMillis:3000};
async function setOffset(offset:number){const path=`${directory}/budget-${randomUUID()}`;await writeFile(path,`${offset}\n`,{mode:0o644,flag:'wx'});await rename(path,`${directory}/offset`);}
async function ensureServer(){
 const state=await docker('docker',['inspect','--format','{{.State.Running}} {{.Image}}','knot-eval-budget-prototype'],{timeout:3000});
 const image=await docker('docker',['image','inspect','--format','{{.Id}}','knot-eval-budget-prototype'],{timeout:3000});const digest=image.stdout.trim();
 if(!/^sha256:[a-f0-9]{64}$/.test(digest)||![`true ${digest}`,`false ${digest}`].includes(state.stdout.trim()))throw Error('자료량 서버 이미지가 다릅니다');
 const env=await docker('docker',['inspect','--format','{{range .Config.Env}}{{println .}}{{end}}','knot-eval-budget-prototype'],{timeout:3000});const vars=new Set(env.stdout.split(/\r?\n/));
 for(const value of ['DB_URL=jdbc:postgresql://postgres:5432/knot_eval_budget','EVAL_BUDGET_FIXTURE_FILE=/eval-clock/budget-mode','SEARCH_CONTEXT_CHARACTER_LIMIT=6000','SEARCH_READ_CODE_POINTS=1000'])if(!vars.has(value))throw Error('자료량 실험 서버 설정이 다릅니다');
 if(state.stdout.startsWith('false '))await docker('docker',['start','knot-eval-budget-prototype'],{timeout:15000});
 for(let i=0;i<30;i++){try{const response=await fetch('http://127.0.0.1:18086/api/v1/auth/csrf',{signal:AbortSignal.timeout(1000)});if(response.ok)return digest;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
 throw Error('자료량 실험 서버가 응답하지 않습니다');
}
export async function executeBudgetCase(c:EvalCase,dataset:{readonly id:string;readonly version:string;readonly corpusHash?:string}):Promise<Run>{
 if(!['S43','S56'].includes(c.scenario)||c.executionFixture!=='limited_context')throw Error('지원하지 않는 자료량 사례입니다');
 const digest=await ensureServer();const lock=new Client({...common,database:'knot_eval_clock'});const db=new Client({...common,database:'knot_eval_budget'});await lock.connect();await db.connect();let held=false,mode=false,offsetChanged=false;
 try{
  const result=await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',['knot-eval-clock-run']);if(!result.rows[0].ok)throw Error('다른 시각 실험이 진행 중입니다');held=true;
  for(const client of [lock,db]){const pending=await client.query("SELECT count(*)::int AS n FROM search_answer_executions WHERE state IN ('QUEUED','RUNNING')");if(pending.rows[0].n!==0)throw Error('다른 실행이 진행 중입니다');}
  const target=c.evaluationTime??new Date().toISOString();const offset=Math.round((Date.parse(target)-Date.now())/1000);if(!Number.isFinite(offset))throw Error('질문 시각이 잘못됐습니다');
  await setOffset(offset);offsetChanged=true;await writeFile(`${directory}/budget-mode`,c.scenario,{mode:0o644,flag:'wx'});mode=true;
  const startedAt=new Date().toISOString();const run=await executeSharedCase(c,`budget ${digest}`,dataset,{offsetSeconds:offset,evaluationTime:target,sandbox:'budget'});
  if(run.status!=='completed') return run;
  const answer=await db.query("SELECT e.answer_id FROM search_answer_executions e JOIN search_messages m ON m.id=e.question_id WHERE m.content=$1 ORDER BY m.id DESC LIMIT 1",[c.question]);const answerId=answer.rows[0]?.answer_id;
  const log=await docker('docker',['logs','--since',startedAt,'knot-eval-budget-prototype'],{timeout:5000,maxBuffer:5_000_000});const lines=`${log.stdout}\n${log.stderr}`.split(/\r?\n/);
  const matching=lines.filter(line=>line.includes(`workspaceId=458 answerId=${answerId} `)&&line.includes('Search context budget '));
  const parsed=matching.length===1?/inputChars=(\d+) limitChars=(\d+) documents=(\d+) selectedDocuments=(\d+).*partial=(true|false)/.exec(matching[0]??''):null;
  const marker=c.scenario==='S56'?'EVAL_BUDGET_INPUT S56 count=2 ids=2191,2192':'EVAL_BUDGET_INPUT S43 count=';
  const valid=lines.some(line=>line.includes(marker))&&parsed&&Number(parsed[2])===6000&&parsed[5]==='true'&&(c.scenario!=='S56'||(Number(parsed[3])===2&&Number(parsed[4])===1));
  if(!valid){return {...run,status:'failed',results:run.results.map(item=>({...item,status:'failed',error:'자료량 제한 또는 지정 후보 조건이 실제 실행에서 확인되지 않았습니다.'}))};}
  return {...run,budgetObservation:{inputChars:Number(parsed[1]),limitChars:Number(parsed[2]),documents:Number(parsed[3]),selectedDocuments:Number(parsed[4]),partial:true}};
 } finally {if(mode)await unlink(`${directory}/budget-mode`).catch(()=>{});if(offsetChanged)await setOffset(0);if(held)await lock.query('SELECT pg_advisory_unlock(hashtext($1))',['knot-eval-clock-run']);await db.end();await lock.end();}
}
