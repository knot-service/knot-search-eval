import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {readState,mutateState} from '../lib/db';
import {DatasetSchema,RunSchema} from '../lib/schema';
import {contentHash} from '../lib/state';

const specs=[
 {id:'KO-01',name:'조건 없는 기존 문서',file:'kickoff-negative-qwen.json',fixture:'baseline',verifyMs:null,accepted:0,expected:'킥오프 회의의 결정을 확인할 수 없다고 답한다.',review:'킥오프 표현이 없는 문서 2206을 근거로 사용하지 않고 확인하지 못했다고 답했다.'},
 {id:'KO-02',name:'실제 킥오프 회의 문서',file:'kickoff-positive-qwen.json',fixture:'positive',verifyMs:861,accepted:1,expected:'킥오프 회의에서 카드 결제 지원을 확정한 사실을 답한다.',review:'복제 DB에 삽입한 킥오프 회의 기록에서 카드 결제 지원 결정을 찾고 2206을 근거로 답했다.'},
 {id:'KO-03',name:'미래 킥오프 계획',file:'kickoff-future-qwen.json',fixture:'future',verifyMs:999,accepted:0,expected:'예정된 킥오프를 지난 회의의 결정으로 답하지 않는다.',review:'미래 킥오프 계획 문서를 지난 킥오프 회의의 결정으로 사용하지 않고 확인하지 못했다고 답했다.'},
 {id:'KO-04',name:'대상 확인 · 결제 킥오프',file:'kickoff-target-positive-qwen.json',fixture:'target-positive',verifyMs:865,accepted:1,expected:'결제 킥오프 회의의 카드 결제 지원 결정을 답한다.',review:'대상이 일치하는 결제 킥오프 회의 기록을 확인했다.'},
 {id:'KO-05',name:'대상 확인 · 로그인 킥오프',file:'kickoff-target-other-qwen.json',fixture:'other',verifyMs:1000,accepted:0,expected:'로그인 킥오프를 결제 킥오프로 답하지 않는다.',review:'서로 다른 대상의 킥오프를 구분했다.'},
] as const;
const positive='## 회의 개요\n이 문서는 결제 킥오프 회의의 기록이다.\n\n## 결정\n결제 킥오프 회의에서 카드 결제 지원을 확정했다.\n담당자는 민지다.';
const future='## 준비\n다음 주 결제 킥오프 회의를 열 예정이다. 카드 결제 지원 여부는 아직 논의하지 않았다.';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 const url=process.env.DATABASE_URL;if(!url||!['localhost','127.0.0.1','::1'].includes(new URL(url).hostname))throw Error('로컬 평가 DB만 지원');
 const db=new pg.Client({host:'127.0.0.1',port:55441,database:'knot_lab',user:'knot_lab',password:'knot-lab-local-only'});await db.connect();
 const rows=(await db.query('SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id',[458])).rows;await db.end();
 if(rows.length!==90)throw Error('합성 문서 개수 불일치');
 let state=await readState();const source=state.datasets.find(d=>d.id==='followup-search-fixtures'&&d.version==='1.0'&&d.locked);const original=source?.cases.find(c=>c.id==='QG-01');if(!source?.corpusHash||!original||hash(rows)!==source.corpusHash)throw Error('원래 문서 조건 불일치');
 for(const s of specs){const [item]=JSON.parse(await readFile(`/Users/yongtae/Desktop/knot/backend/resume/search-improvement/${s.file}`,'utf8'));const isPositive=s.fixture==='positive'||s.fixture==='target-positive';const fixtureRows=rows.map(row=>row.id==='2206'&&s.fixture!=='baseline'?{...row,title:isPositive?'결제 킥오프 회의 결정':s.fixture==='other'?'로그인 킥오프 회의':'결제 킥오프 준비',content:isPositive?positive:s.fixture==='other'?'이 문서는 로그인 킥오프 회의의 기록이다.\n카드 결제 지원은 다른 회의에서 논의할 예정이다.':future}:row);const corpusHash=hash(fixtureRows);const caseDoc=fixtureRows.find(row=>row.id==='2206');
 const dataset=DatasetSchema.parse({id:`kickoff-${s.fixture}-fixture`,name:`킥오프 조건 확인 · ${s.name}`,version:'1.0',source:'synthetic',corpusHash,cases:[{...original,id:s.id,question:item.question,history:[],evaluationTime:item.receivedAt,documents:[{id:'document-2206',title:caseDoc.title,content:caseDoc.content}],expectedEvidenceIds:isPositive?['document-2206']:[],expectedType:isPositive?'answer':'not_found',expectedBehavior:s.expected,setup:s.fixture==='baseline'?'기존 v1.30 합성 문서 90개.':'v1.30을 복제한 DB에서 문서 2206만 교체한 별도 합성 문서 조건.'}]});
 const existing=state.datasets.find(d=>d.id===dataset.id&&d.version===dataset.version);if(!existing){await mutateState({type:'import_dataset',data:dataset});state=await mutateState({type:'lock_dataset',id:dataset.id,version:dataset.version});}else if(!existing.locked||existing.contentHash!==contentHash(dataset))throw Error('기존 평가셋 버전 불일치');
 if(state.runs.some(r=>(r.revision==='kickoff-verification-v1'||r.revision==='kickoff-verification-v2')&&r.results.some(x=>x.caseId===s.id)))continue;
 const st=item.stages;const stage=(id:string,label:string,status:'completed'|'failed'|'not_run',durationMs:number|null,result:string)=>({id,label,status,durationMs,result,inputTokens:null,outputTokens:null});
 const run=RunSchema.parse({id:`worker-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash,name:`${s.id} · ${s.name} · 실제 Worker Qwen`,strategy:'실제 Worker·Qwen · 킥오프 조건 확인',environment:'isolated_spring',model:'qwen3.8-27b MTP6 128K',revision:s.id==='KO-04'||s.id==='KO-05'?'kickoff-verification-v2':'kickoff-verification-v1',startedAt:item.receivedAt,status:item.status==='COMPLETED'?'completed':'failed',experiment:{kind:'search_retrieval',variant:'B',inputHash:hash({question:item.question,corpusHash}),promptVersion:'question-understanding-followup-v2',stages:[stage('intent_classification','기존 의도 분류','completed',st.classificationMs??null,'실제 모델 호출'),stage('question_understanding','질문 이해','completed',st.questionUnderstandingMs??null,JSON.stringify(st.questionPlan)),stage('document_retrieval','검색 후보','completed',st.sqlMs??null,JSON.stringify({parameters:st.searchParameters,candidates:st.candidates})),stage('kickoff_verification','킥오프 조건 확인','completed',s.verifyMs,`검색 후보 ${st.candidates.length}개 중 ${s.accepted}개를 답변에 전달. 판정 원문 인용은 별도 저장하지 않음.`),stage('answer_generation','답변 생성',st.generationOutcome?'completed':'not_run',st.generationMs??null,st.generationOutcome?item.answer:'확인된 문서가 없어 안내문으로 종료; 답변 모델 미호출')]},results:[{caseId:s.id,status:item.status==='COMPLETED'?'completed':'failed',candidates:st.candidates??[],answer:item.answer,evidenceIds:item.evidenceIds.map((n:number)=>`document-${n}`),latencyMs:item.workerMs,error:item.failureCode}]});
 state=await mutateState({type:'import_run',data:run});console.log(JSON.stringify({case:s.id,run:run.id,corpusHash}));
 }
}
main().then(()=>process.exit(0)).catch((e:unknown)=>{console.error(e instanceof Error?e.message:'기록 실패');process.exit(1)});
