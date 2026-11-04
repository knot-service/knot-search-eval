import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { mutateState, readState } from '../lib/db';
import { DatasetSchema, RunSchema } from '../lib/schema';
import { contentHash } from '../lib/state';

const dataSchema=z.object({model:z.literal('mock'),conversationId:z.number(),firstQuestionId:z.number(),firstAnswerId:z.number(),followQuestionId:z.number(),followAnswerId:z.number(),receivedAt:z.string(),followAnswer:z.string(),query:z.string(),from:z.string(),before:z.string()});
async function main(){
  const database=process.env.DATABASE_URL;
  if(!database||!['localhost','127.0.0.1','::1'].includes(new URL(database).hostname))throw new Error('로컬 평가 DB가 아닙니다.');
  const input=dataSchema.parse(JSON.parse(await readFile(resolve(process.cwd(),'../knot/backend/resume/search-improvement/worker-context-mock-result.json'),'utf8')));
  let state=await readState();
  const source=state.datasets.find(d=>d.id==='followup-search-fixtures'&&d.version==='1.0'&&d.locked);
  const item=source?.cases.find(c=>c.id==='QG-01');
  if(!source?.corpusHash||!item)throw new Error('기준 합성 사례 없음');
  const db=new pg.Client({host:'127.0.0.1',port:55441,database:'knot_lab',user:'knot_lab',password:'knot-lab-local-only'});
  await db.connect();
  try {
    const rows=await db.query('SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id',[458]);
    if(rows.rowCount!==90||createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex')!==source.corpusHash)throw new Error('v1.30 문서 버전 불일치');
  } finally { await db.end(); }
  const dataset=DatasetSchema.parse({id:'worker-context-mock-fixture',name:'Worker 연결 격리 시험 · 모델 대역',version:'1.0',source:'synthetic',corpusHash:source.corpusHash,cases:[{...item,id:'WM-01',evaluationTime:input.receivedAt,setup:'실제 Worker·대화 DB·SQL을 실행했으나 질문 이해·분류·답변 모델은 대역이다.',expectedBehavior:'저장된 이전 기간과 킥오프 표현이 후속 질문의 SQL에 전달된다.'}]});
  const existing=state.datasets.find(d=>d.id===dataset.id&&d.version===dataset.version);
  if(!existing){await mutateState({type:'import_dataset',data:dataset});state=await mutateState({type:'lock_dataset',id:dataset.id,version:dataset.version});}
  else if(!existing.locked||existing.contentHash!==contentHash(dataset))throw new Error('고정 사례가 일치하지 않습니다.');
  if(state.runs.some(r=>r.revision==='worker-context-mock-v1'&&r.results[0]?.caseId==='WM-01'))return;
  const run=RunSchema.parse({id:`worker-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,name:`WM-01 · 실제 Worker 연결 · 모델 대역 · ${input.receivedAt}`,strategy:'Spring Worker·실제 DB·SQL · 모델 대역',environment:'isolated_spring',model:'mock',revision:'worker-context-mock-v1',startedAt:input.receivedAt,status:'completed',
    experiment:{kind:'search_retrieval',variant:'B',inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),promptVersion:'worker-context-mock-v1',stages:[
      {id:'question_understanding',label:'질문 이해 대역',status:'completed',durationMs:null,result:'사전에 지정한 모의 질문 이해 결과를 반환했으며 실제 모델을 호출하지 않았다.',inputTokens:null,outputTokens:null},
      {id:'dialogue_context',label:'대화 상태 조회',status:'completed',durationMs:null,result:JSON.stringify({conversationId:input.conversationId,firstQuestionId:input.firstQuestionId,followQuestionId:input.followQuestionId,from:input.from,before:input.before},null,2),inputTokens:null,outputTokens:null},
      {id:'document_retrieval',label:'실제 SQL 조건',status:'completed',durationMs:null,result:JSON.stringify({query:input.query,from:input.from,before:input.before,note:'후보 목록과 소요 시간은 이 시험에서 수집하지 않았다.'},null,2),inputTokens:null,outputTokens:null},
      {id:'answer_generation',label:'답변 생성 대역',status:'completed',durationMs:null,result:input.followAnswer,inputTokens:null,outputTokens:null}]},
    results:[{caseId:'WM-01',status:'completed',candidates:[],answer:'모델 대역을 사용한 Worker 연결 시험 · 실제 Qwen 답변이 아님',evidenceIds:[],latencyMs:null,error:null}]});
  await mutateState({type:'import_run',data:run});console.log(JSON.stringify({id:run.id}));
}
main().then(()=>process.exit(0)).catch((error:unknown)=>{console.error(error instanceof Error?error.message:'기록 실패');process.exit(1)});
