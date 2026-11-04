import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { mutateState, readState } from '../lib/db';
import { DatasetSchema, RunSchema } from '../lib/schema';
import { contentHash } from '../lib/state';

const path = resolve(process.cwd(),'../knot/backend/resume/search-improvement/confirmed-followup-20261104/persisted-dialogue-output.json');
const observation = z.object({case:z.string(),conversationId:z.number(),firstQuestionId:z.number(),followQuestionId:z.number(),firstReceivedAt:z.string(),followReceivedAt:z.string(),query:z.string(),contextApplied:z.boolean(),period:z.unknown().nullable(),candidates:z.array(z.string()),durationMs:z.number().nonnegative(),modelSourceRunId:z.string()});
const specs = [
  {name:'kickoff-confirmed',id:'PD-01',original:'QG-01',expected:'실제로 저장한 이전 질문의 확정 기간과 킥오프를 후속 검색에 반영한다.'},
  {name:'subject-changed',id:'PD-02',original:'S12-01',expected:'로그인으로 주제가 바뀌면 이전 결제 기간과 킥오프를 적용하지 않는다.'},
  {name:'explicit-minutes',id:'PD-03',original:'QG-03',expected:'명시된 결제 회의록 표현은 유지하고 이전 기간은 적용하지 않는다.'},
  {name:'missing-period',id:'PD-04',original:'QG-01',expected:'이전 질문에 확정된 기간이 없으면 기간을 임의로 적용하지 않는다.'},
  {name:'stopped-answer',id:'PD-05',original:'QG-01',expected:'이전 답변이 중단됐으면 이전 확정 맥락을 이어받지 않는다.'},
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !['localhost','127.0.0.1','::1'].includes(new URL(url).hostname)) throw new Error('로컬 평가 DB가 아닙니다.');
  let state = await readState();
  const source = state.datasets.find(d=>d.id==='followup-search-fixtures' && d.version==='1.0' && d.locked);
  if (!source?.corpusHash) throw new Error('기준 문서 묶음 없음');
  const lab = new pg.Client({host:'127.0.0.1',port:55441,database:'knot_lab',user:'knot_lab',password:'knot-lab-local-only'});
  await lab.connect();
  try {
    const rows=await lab.query('SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id',[458]);
    if(rows.rowCount!==90 || createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex')!==source.corpusHash) throw new Error('v1.30 문서 버전 불일치');
  } finally { await lab.end(); }
  const records=z.array(observation).length(specs.length).parse(JSON.parse(await readFile(path,'utf8')));
  const cases=specs.map(spec=>{
    const original=source.cases.find(c=>c.id===spec.original); const result=records.find(r=>r.case===spec.name);
    if(!original || !result) throw new Error(`사례 없음: ${spec.name}`);
    const first=spec.name==='missing-period'?'결제 킥오프에서 결정된 내용 알려줘.':'지난주 결제 킥오프에서 결정된 내용 알려줘.';
    return {...original,id:spec.id,evaluationTime:result.followReceivedAt,history:[{role:'user' as const,content:first},{role:'assistant' as const,content:'결제 취소 기능을 출시하기로 했어요.'}],expectedBehavior:spec.expected,setup:'실제 로컬 Spring 대화·DB 상태. 이전 답변은 합성 주입, 질문 이해 출력은 이전 모델 실행 재사용.'};
  });
  const dataset=DatasetSchema.parse({id:'persisted-dialogue-search-fixtures',name:'실제 대화 저장 후 후속 검색',version:'1.0',source:'synthetic',corpusHash:source.corpusHash,cases});
  const existing=state.datasets.find(d=>d.id===dataset.id&&d.version===dataset.version);
  if(!existing){await mutateState({type:'import_dataset',data:dataset});state=await mutateState({type:'lock_dataset',id:dataset.id,version:dataset.version});}
  else if(!existing.locked||existing.contentHash!==contentHash(dataset))throw new Error('고정 실험셋이 일치하지 않습니다.');
  for(const spec of specs){
    const result=records.find(r=>r.case===spec.name); const sourceRun=state.runs.find(r=>r.id===result?.modelSourceRunId);
    if(!result||!sourceRun)throw new Error(`실행 원본 없음: ${spec.name}`);
    if(state.runs.some(r=>r.revision==='persisted-dialogue-search-v1'&&r.results[0]?.caseId===spec.id))continue;
    const run=RunSchema.parse({id:`retrieval-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,name:`${spec.id} · ${spec.name} · ${result.followReceivedAt}`,strategy:'실제 대화 DB 저장과 검색 · 모델 출력 재사용',environment:'isolated_spring',model:sourceRun.model,revision:'persisted-dialogue-search-v1',startedAt:result.followReceivedAt,status:'completed',experiment:{kind:'search_retrieval',variant:'B',inputHash:createHash('sha256').update(JSON.stringify(result)).digest('hex'),promptVersion:'persisted-dialogue-search-v1',stages:[
      {id:'question_understanding',label:'저장된 질문 이해 결과',status:'not_run',durationMs:null,result:`이전 실제 모델 실행 재사용: ${result.modelSourceRunId}. 이전 답변은 합성 주입.`,inputTokens:null,outputTokens:null},
      {id:'dialogue_context',label:'실제 대화 상태 저장·조회',status:'completed',durationMs:null,result:JSON.stringify({conversationId:result.conversationId,firstQuestionId:result.firstQuestionId,followQuestionId:result.followQuestionId,firstReceivedAt:result.firstReceivedAt,followReceivedAt:result.followReceivedAt,contextApplied:result.contextApplied,period:result.period},null,2),inputTokens:null,outputTokens:null},
      {id:'document_retrieval',label:'실제 SQL 검색 후보',status:'completed',durationMs:result.durationMs,result:JSON.stringify({query:result.query,period:result.period,candidates:result.candidates,note:'킥오프는 필수 필터가 아닌 검색어 가중치. 후보는 검증된 근거가 아님.'},null,2),inputTokens:null,outputTokens:null}]},results:[{caseId:spec.id,status:'completed',candidates:result.candidates,answer:'대화 상태와 검색 후보 확인 · 최종 답변 미실행',evidenceIds:[],latencyMs:result.durationMs,error:null}]});
    await mutateState({type:'import_run',data:run}); console.log(JSON.stringify({case:spec.id,id:run.id}));
  }
}
main().then(()=>process.exit(0)).catch((error:unknown)=>{console.error(error instanceof Error?error.message:'기록 실패');process.exit(1)});
