import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { mutateState, readState } from '../lib/db';
import { DatasetSchema, RunSchema } from '../lib/schema';
import { contentHash } from '../lib/state';

const inputPath=resolve(process.cwd(),'../knot/backend/resume/search-improvement/worker-live-qwen.json');
const outcome=z.enum(['success','failure']).optional();
const stages=z.object({classificationMs:z.number().nonnegative().optional(),classificationOutcome:outcome,questionPlan:z.unknown().optional(),questionUnderstandingMs:z.number().nonnegative().optional(),questionUnderstandingOutcome:outcome,candidates:z.array(z.string()).optional(),searchParameters:z.unknown().optional(),sqlMs:z.number().nonnegative().optional(),sqlOutcome:outcome,generationMs:z.number().nonnegative().optional(),generationOutcome:outcome});
const record=z.object({case:z.enum(['first','followup','topic-change']),conversationId:z.number(),questionId:z.number(),answerId:z.number(),question:z.string(),receivedAt:z.string(),status:z.string(),answer:z.string(),failureCode:z.string().nullable(),evidenceIds:z.array(z.number()),workerMs:z.number().nonnegative(),stages});
async function main(){
  const url=process.env.DATABASE_URL;if(!url||!['localhost','127.0.0.1','::1'].includes(new URL(url).hostname))throw new Error('로컬 평가 DB가 아닙니다.');
  const records=z.array(record).min(1).max(3).parse(JSON.parse(await readFile(inputPath,'utf8')));
  let state=await readState();
  const source=state.datasets.find(d=>d.id==='followup-search-fixtures'&&d.version==='1.0'&&d.locked);
  if(!source?.corpusHash)throw new Error('고정 문서 기준 없음');
  const db=new pg.Client({host:'127.0.0.1',port:55441,database:'knot_lab',user:'knot_lab',password:'knot-lab-local-only'});
  await db.connect();try{const rows=await db.query('SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id',[458]);if(rows.rowCount!==90||createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex')!==source.corpusHash)throw new Error('v1.30 합성 문서가 일치하지 않습니다.');}finally{await db.end();}
  const makeId=(name:string)=>name==='first'?'WL-01':name==='followup'?'WL-02':'WL-03';
  const cases=records.map((r,index)=>{
    const original=source.cases.find(c=>c.id===(r.case==='topic-change'?'S12-01':'QG-01'));if(!original)throw new Error('원본 사례 없음');
    const history=records.slice(0,index).filter(previous=>previous.status==='COMPLETED').flatMap(previous=>[{role:'user' as const,content:previous.question},{role:'assistant' as const,content:previous.answer}]);
    return {...original,id:makeId(r.case),question:r.question,history,evaluationTime:r.receivedAt,setup:'실제 Worker와 로컬 Qwen 결과. 앞선 답변도 같은 대화의 실제 실행 결과.',expectedBehavior:r.case==='first'?'지난주 결제 킥오프에 대해 접근 가능한 문서에서 확인한 내용만 답한다.':r.case==='followup'?'이전 질문과 답변의 대상·확정 기간을 이어받아 담당자를 근거에 맞게 답한다.':'로그인 주제로 전환하고 이전 결제 조건을 임의로 유지하지 않는다.'};
  });
  const dataset=DatasetSchema.parse({id:'context-worker-live-fixtures',name:'실제 Worker · 로컬 Qwen 후속 대화',version:'1.0',source:'synthetic',corpusHash:source.corpusHash,cases});
  const existing=state.datasets.find(d=>d.id===dataset.id&&d.version===dataset.version);
  if(!existing){await mutateState({type:'import_dataset',data:dataset});state=await mutateState({type:'lock_dataset',id:dataset.id,version:dataset.version});}
  else if(!existing.locked||existing.contentHash!==contentHash(dataset))throw new Error('기존 실험셋과 다릅니다. 별도 버전을 사용하세요.');
  for(const item of records){const id=makeId(item.case);if(state.runs.some(r=>r.revision==='context-worker-live-v1'&&r.results[0]?.caseId===id))continue;
    const ok=item.status==='COMPLETED';const runStatus=ok?'completed':'failed';
    const stageList=[
      {id:'intent_classification',label:'기존 의도 분류',status:item.stages.classificationOutcome===undefined?'not_run':item.stages.classificationOutcome==='success'?'completed':'failed',durationMs:item.stages.classificationMs??null,result:'기존 분류 호출 시간. 세부 판정은 별도 수집하지 않음.',inputTokens:null,outputTokens:null},
      {id:'question_understanding',label:'새 질문 이해',status:item.stages.questionUnderstandingOutcome===undefined?'not_run':item.stages.questionUnderstandingOutcome==='success'?'completed':'failed',durationMs:item.stages.questionUnderstandingMs??null,result:item.stages.questionPlan===undefined?'구조화 결과 미수집':JSON.stringify(item.stages.questionPlan,null,2),inputTokens:null,outputTokens:null},
      {id:'document_retrieval',label:'실제 SQL 검색',status:item.stages.sqlOutcome===undefined?'not_run':item.stages.sqlOutcome==='success'?'completed':'failed',durationMs:item.stages.sqlMs??null,result:JSON.stringify({parameters:item.stages.searchParameters??null,candidates:item.stages.candidates??null},null,2),inputTokens:null,outputTokens:null},
      {id:'answer_generation',label:'기존 답변 생성',status:item.stages.generationOutcome===undefined?'not_run':item.stages.generationOutcome==='success'?'completed':'failed',durationMs:item.stages.generationMs??null,result:ok?item.answer:(item.failureCode??'결과 없음'),inputTokens:null,outputTokens:null},
    ];
    const run=RunSchema.parse({id:`worker-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,name:`${id} · 실제 Worker Qwen · ${item.receivedAt}`,strategy:'로컬 Qwen · 실제 Worker·대화 DB·SQL · 별도 답변 검증 없음',environment:'isolated_spring',model:'qwen3.8-27b',revision:'context-worker-live-v1',startedAt:item.receivedAt,status:runStatus,
      experiment:{kind:'search_retrieval',variant:'B',inputHash:createHash('sha256').update(JSON.stringify({conversationId:item.conversationId,questionId:item.questionId})).digest('hex'),promptVersion:'question-understanding-followup-v2',stages:stageList},
      results:[{caseId:id,status:runStatus,candidates:item.stages.candidates??[],answer:item.answer,evidenceIds:item.evidenceIds.map(n=>`document-${n}`),latencyMs:item.workerMs,error:item.failureCode}]});
    await mutateState({type:'import_run',data:run});console.log(JSON.stringify({case:id,status:runStatus,id:run.id}));
  }
}
main().then(()=>process.exit(0)).catch((error:unknown)=>{console.error(error instanceof Error?error.message:'기록 실패');process.exit(1)});
