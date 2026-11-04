import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { mutateState, readState } from '../lib/db';
import { DatasetSchema, RunSchema } from '../lib/schema';
import { contentHash } from '../lib/state';

const dir = resolve(process.cwd(), '../knot/backend/resume/search-improvement/confirmed-followup-20261104');
const fixtures = [
  {file:'kickoff-confirmed',id:'CF-01',original:'QG-01',expected:'서버가 이전 턴에 확정한 기간과 킥오프 표현을 해당 요청 검색에 반영한다.'},
  {file:'kickoff-next-week',id:'CF-02',original:'QG-01',expected:'다음 주의 후속 질문에도 이전 턴에서 확정한 기간을 유지한다.'},
  {file:'kickoff-missing',id:'CF-03',original:'QG-01',expected:'확정된 기간 정보가 없으면 날짜를 임의 적용하지 않는다.'},
  {file:'kickoff-wrong-request',id:'CF-04',original:'QG-01',expected:'다른 요청에 묶인 이전 맥락을 현재 요청에 적용하지 않는다.'},
  {file:'subject-changed',id:'CF-05',original:'S12-01',expected:'로그인으로 주제가 바뀌면 결제 킥오프 맥락을 적용하지 않는다.'},
  {file:'previous-week',id:'CF-06',original:'S09-01',expected:'이전 주 기간을 서버가 별도로 확인하여 적용한다.'},
  {file:'explicit-minutes',id:'CF-07',original:'QG-03',expected:'명시된 회의록 표현을 검색어에 유지한다.'},
] as const;
const inputSchema = z.object({question:z.string(),history:z.array(z.object({role:z.string(),content:z.string()})),receivedAt:z.string(),modelOutput:z.unknown(),confirmedContext:z.unknown().optional(),sourceRunId:z.string()});
const outputSchema = z.object({planned:z.array(z.object({requestId:z.string(),query:z.string(),conditions:z.unknown(),contextApplied:z.boolean(),appliedPeriod:z.unknown().nullable(),candidates:z.array(z.string()),durationMs:z.number().nonnegative()})).length(1)});

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !['localhost','127.0.0.1','::1'].includes(new URL(url).hostname)) throw new Error('로컬 평가 DB가 아닙니다.');
  let state = await readState();
  const sourceDataset = state.datasets.find(d => d.id === 'followup-search-fixtures' && d.version === '1.0' && d.locked);
  if (!sourceDataset?.corpusHash) throw new Error('고정된 출처 평가셋 없음');
  const db = new pg.Client({host:'127.0.0.1',port:55441,database:'knot_lab',user:'knot_lab',password:'knot-lab-local-only'});
  await db.connect();
  try {
    const rows = await db.query('SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id',[458]);
    if (rows.rowCount !== 90 || createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex') !== sourceDataset.corpusHash) throw new Error('문서 묶음이 v1.30과 다릅니다.');
  } finally { await db.end(); }
  const caseItems = await Promise.all(fixtures.map(async f => {
    const original = sourceDataset.cases.find(c => c.id === f.original);
    if (!original) throw new Error(`원본 사례 없음: ${f.original}`);
    const input = inputSchema.parse(JSON.parse(await readFile(resolve(dir,`${f.file}-input.json`),'utf8')));
    return {...original,id:f.id,question:input.question,evaluationTime:input.receivedAt,expectedBehavior:f.expected,setup:`${f.original} 변형: ${f.file}. 확정 맥락은 별도 서버 상태를 가정한 합성 입력.`};
  }));
  const dataset = DatasetSchema.parse({id:'confirmed-followup-search-fixtures',name:'이전 턴 확정 맥락과 검색',version:'1.0',source:'synthetic',corpusHash:sourceDataset.corpusHash,cases:caseItems});
  const existing = state.datasets.find(d => d.id === dataset.id && d.version === dataset.version);
  if (!existing) { await mutateState({type:'import_dataset',data:dataset}); state = await mutateState({type:'lock_dataset',id:dataset.id,version:dataset.version}); }
  else if (!existing.locked || existing.contentHash !== contentHash(dataset)) throw new Error('잠긴 실험셋이 다릅니다.');
  for (const fixture of fixtures) {
    const input = inputSchema.parse(JSON.parse(await readFile(resolve(dir,`${fixture.file}-input.json`),'utf8')));
    const file = resolve(dir,`${fixture.file}-output.json`);
    const output = outputSchema.parse(JSON.parse(await readFile(file,'utf8')));
    const result = output.planned[0];
    const source = state.runs.find(run => run.id === input.sourceRunId);
    if (!result || !source) throw new Error(`검색 결과 또는 원본 없음: ${fixture.file}`);
    const startedAt = (await stat(file)).mtime.toISOString();
    if (state.runs.some(run => run.revision === 'confirmed-followup-search-v1' && run.results[0]?.caseId === fixture.id && run.startedAt === startedAt)) continue;
    const run = RunSchema.parse({id:`retrieval-${randomUUID()}`,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,name:`${fixture.id} · ${fixture.file} · ${startedAt}`,strategy:'이전 모델 출력과 합성 확정 맥락 재사용 · SQL 검색',environment:'isolated_spring',model:source.model,revision:'confirmed-followup-search-v1',startedAt,status:'completed',
      experiment:{kind:'search_retrieval',variant:'B',inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),promptVersion:'confirmed-followup-search-v1',stages:[
        {id:'question_understanding',label:'저장된 질문 이해와 확정 맥락',status:'not_run',durationMs:null,result:JSON.stringify({sourceRunId:input.sourceRunId,modelOutput:input.modelOutput,confirmedContext:input.confirmedContext ?? null},null,2),inputTokens:null,outputTokens:null},
        {id:'document_retrieval',label:'검색 조건과 후보',status:'completed',durationMs:result.durationMs,result:JSON.stringify({...result,note:'킥오프는 검색어 가중치에 반영하며 필수 필터가 아님. 후보는 검증된 답변 근거가 아님.'},null,2),inputTokens:null,outputTokens:null}]},
      results:[{caseId:fixture.id,status:'completed',candidates:result.candidates,answer:'검색 조건과 후보만 수집 · 전체 답변 미실행',evidenceIds:[],latencyMs:result.durationMs,error:null}]});
    await mutateState({type:'import_run',data:run});
    console.log(JSON.stringify({caseId:fixture.id,runId:run.id,contextApplied:result.contextApplied,count:result.candidates.length}));
  }
}
main().then(()=>process.exit(0)).catch((error:unknown)=>{console.error(error instanceof Error ? error.message : '가져오기 실패');process.exit(1)});
