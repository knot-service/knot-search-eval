import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {DatasetSchema,RunSchema} from '../lib/schema';
import {contentHash} from '../lib/state';
async function main(){
const root='/Users/yongtae/Desktop/knot/backend/resume/search-improvement/';
const parseLines=async(file:string)=>(await readFile(root+file,'utf8')).trim().split('\n').map(x=>JSON.parse(x));
const baseRuns=await parseLines('answer-relations-ab-2026-11-04T08-04-56-201Z.jsonl');
const reviewRuns=await parseLines('answer-relations-review-2026-11-04-v2.jsonl');
const fixed=JSON.parse(await readFile(root+'v130-검증-AB-고정문서-입력-초안.json','utf8'));
const [worker]=JSON.parse(await readFile(root+'answer-relations-worker-qwen.json','utf8'));
const evalUrl=process.env.DATABASE_URL;if(!evalUrl||!['localhost','127.0.0.1','::1'].includes(new URL(evalUrl).hostname))throw Error('로컬 평가 DB가 아닙니다.');
const lab=new pg.Client({host:'127.0.0.1',port:55441,database:'knot_lab',user:'knot_lab',password:'knot-lab-local-only'});await lab.connect();const docs=(await lab.query('select id::text,title,content from documents where workspace_id=458 and id=any($1::bigint[])',[[2141,2206,2213]])).rows;await lab.end();
const find=(id:string)=>docs.find(d=>d.id===id);const extra=[{id:'REL-01',question:'민지가 제안한 로그인 정책을 알려줘.',history:[],documents:[find('2213')],expectedBehavior:'민지가 제안한 내용과 그 상태를 원문에 맞게 설명하고 제안자를 추측하지 않는다.'},{id:'REL-02',question:'카드 결제 지원은 어떻게 됐어?',history:[],documents:[find('2141'),find('2206')],expectedBehavior:'결제 지원과 출시 목표를 설명하되 명시되지 않은 문서 간 최종 관계를 단정하지 않는다.'}];
const inputs=[...fixed.cases,...extra];const meta=baseRuns[0];const cases=inputs.map(c=>({id:c.id,scenario:'답변 관계 충실성',category:'답변 생성·검증',question:c.question,history:c.history,documents:c.documents.map((d:{id:string;title:string;content:string})=>({id:`document-${d.id}`,title:d.title,content:d.content})),expectedEvidenceIds:[],expectedType:'answer',expectedBehavior:c.expectedBehavior,setup:'고정 합성 문서 직접 호출. 문서 검색과 Worker/SSE는 별도 실험.'}));
const dataset=DatasetSchema.parse({id:'answer-relations-fixed',name:'답변 관계 충실성 · 고정 문서',version:'1.0',source:'synthetic',corpusHash:fixed.corpusHash,cases});
const notes:Record<string,[string,string]>={
 'S14-01':['correct','환불 담당자 준호를 문서 2152와 대조했다.'],
 'S19-01':['incorrect','세션과 JWT 각각의 1시간 기록이 30분으로 직접 변경되었다는 관계가 문서에 명시되지 않았다.'],
 'S29-01':['correct','관련 문서에 기록된 재인증, 실패 안내, 1시간 결정을 설명한다.'],
 'S29-01-review':['incorrect','15일 회의에서 결정하지 않았다는 기록을 기존 확정 기록과 반드시 충돌하는 것처럼 연결했다.'],
 'S69-01':['incorrect','세션과 자동 로그아웃, 서로 다른 회의 기록의 관계를 직접 변경이나 인과 관계로 단정했다.'],
 'S71-01':['incorrect','JWT 1시간 기록과 30분 기록 사이에 직접 변경 관계가 명시되지 않았다.'],
 'REL-01':['incorrect','파일럿 및 교육 방안까지 민지가 제안한 것처럼 연결했으나 문서는 제안자를 명시하지 않는다.'],
 'REL-01-review':['correct','민지의 2단계 인증 제안과 제안자 미명시의 다른 내용을 구분하고 미확정 상태를 보존했다.'],
 'REL-02':['incorrect','두 기록을 연결해 10월 29일에 최종 확정했다고 단정했으나 문서에는 그 관계가 없다.'],
 'REL-02-review':['correct','카드 결제 확정과 11월 목표를 구분하며 근거 없는 최종이라는 수식을 제거했다.']};
const mkStage=(id:string,label:string,status:'completed'|'failed'|'not_run',durationMs:number|null,result:string,usage:unknown)=>({id,label,status,durationMs,result,inputTokens:typeof (usage as {prompt_tokens?:unknown})?.prompt_tokens==='number'?(usage as {prompt_tokens:number}).prompt_tokens:null,outputTokens:typeof (usage as {completion_tokens?:unknown})?.completion_tokens==='number'?(usage as {completion_tokens:number}).completion_tokens:null});
const c=new pg.Client({connectionString:evalUrl});await c.connect();try{await c.query('BEGIN');const state=(await c.query('SELECT data FROM eval_state WHERE id=1 FOR UPDATE')).rows[0].data;const existing=state.datasets.find((d:{id:string;version:string})=>d.id===dataset.id&&d.version===dataset.version);if(existing&&existing.contentHash!==contentHash(dataset))throw Error('기존 평가셋과 다름');if(!existing)state.datasets.push({...dataset,locked:true,contentHash:contentHash(dataset)});let added=0;
 for(const b of baseRuns.filter((x:{type:string})=>x.type==='run')){for(const kind of (b.variant==='baseline'?['baseline']:['prompt','review'])){
 const r=kind==='review'?reviewRuns.find((x:{caseId:string})=>x.caseId===b.caseId):null;if(kind==='review'&&!r)throw Error('대조 결과 없음');const revision=`answer-relations-${kind}-v1`;
 if(state.runs.some((x:{revision:string;results:{caseId:string}[]})=>x.revision===revision&&x.results.some(y=>y.caseId===b.caseId)))continue;
 const output=kind==='review'?r.result:b.output;const status=output?'completed':'failed';const stages=[mkStage('generation','답변 생성',b.output?'completed':'failed',b.durationMs,JSON.stringify(b.output??{error:b.error}),b.usage)];if(r)stages.push(mkStage('review','관계 대조 및 수정','completed',r.reviewMs,JSON.stringify(r.result),r.usage));
 const run=RunSchema.parse({id:`relations-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,name:`${b.caseId} · 관계 확인 ${kind}`,strategy:kind==='review'?'고정 문서 · 답변 생성 후 관계 대조 및 수정':'고정 문서 · 답변 생성',environment:'direct_model',model:'qwen3.8-27b MTP6 128K',revision,startedAt:b.startedAt,status,experiment:{kind:'fixed_document_verification',variant:kind==='baseline'?'A':'B',inputHash:meta.inputHash,promptVersion:revision,stages},results:[{caseId:b.caseId,status,candidates:[],answer:output?.answer??'',evidenceIds:(output?.evidenceIds??[]).filter((id:string)=>/^E\d+$/.test(id)).map((id:string)=>`document-${id.slice(1)}`),latencyMs:b.durationMs+(r?.reviewMs??0),error:status==='failed'?'모델 결과 미수집':null}]});state.runs.push(run);
 const verdict=notes[`${b.caseId}${kind==='review'?'-review':''}`]??notes[b.caseId];state.reviews.push({id:randomUUID(),datasetId:dataset.id,datasetVersion:dataset.version,caseId:b.caseId,runId:run.id,outcome:verdict[0],notes:verdict[1],reviewer:'AI 검수 (Codex)',createdAt:new Date().toISOString()});added++;
 }}
 const wRevision='answer-relations-worker-prompt-v1';if(!state.runs.some((x:{revision:string})=>x.revision===wRevision)){const st=worker.stages;const run=RunSchema.parse({id:`relations-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,name:'REL-01 · 실제 Worker · 관계 지시문',strategy:'실제 Worker·Qwen · 문서 확인 후 답변',environment:'isolated_spring',model:'qwen3.8-27b MTP6 128K',revision:wRevision,startedAt:worker.receivedAt,status:worker.status==='COMPLETED'?'completed':'failed',experiment:{kind:'search_retrieval',variant:'B',inputHash:createHash('sha256').update(worker.question).digest('hex'),promptVersion:wRevision,stages:[mkStage('intent','의도 분류','completed',st.classificationMs,'모델 1회 호출',null),mkStage('understanding','질문 이해','completed',st.questionUnderstandingMs,JSON.stringify(st.questionPlan),null),mkStage('retrieval','SQL 검색','completed',st.sqlMs,JSON.stringify({candidates:st.candidates,parameters:st.searchParameters}),null),mkStage('document_verification','문서 조건 확인','completed',9637,'후보 20개, 5개씩 모델 4회, 통과 1개',null),mkStage('generation','답변 생성','completed',st.generationMs,worker.answer,null)]},results:[{caseId:'REL-01',status:worker.status==='COMPLETED'?'completed':'failed',candidates:st.candidates,answer:worker.answer,evidenceIds:worker.evidenceIds.map((n:number)=>`document-${n}`),latencyMs:worker.workerMs,error:worker.failureCode}]});state.runs.push(run);state.reviews.push({id:randomUUID(),datasetId:dataset.id,datasetVersion:dataset.version,caseId:'REL-01',runId:run.id,outcome:'incorrect',notes:'2단계 인증이 아직 확정되지 않은 초기 제안이라는 상태를 답변에서 누락했다. 추가 방안의 제안자도 분명히 구분되지 않는다.',reviewer:'AI 검수 (Codex)',createdAt:new Date().toISOString()});added++;}
 await c.query('UPDATE eval_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(state)]);await c.query('COMMIT');console.log(JSON.stringify({dataset:dataset.id,added}));}catch(e){await c.query('ROLLBACK');throw e}finally{await c.end()}

}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'기록 실패');process.exitCode=1});
