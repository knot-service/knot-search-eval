import { collectPrivacyLog, type PrivacyLogObservation } from './privacy-observation';
import { createHash, createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";
import { readSpringStream } from "./spring-stream";
import { caseReadiness } from "./local-cases";
import { collectRetrievalObservation, type RetrievalObservation } from './retrieval-observation';
import { collectStageTimings } from './stage-timings';
import type { EvalCase, Run } from "./schema";

const EXCLUDED_TRANSCRIPTS: Readonly<Record<string, string>> = {
  S02: "합성 발언: 출시 연기 이유는 결제사 점검 때문이다.",
  S24: "합성 발언: 외부 연동은 수요일 오후에 재시도한다.",
  S30: "합성 발언: 데이터 보관 기간은 97일이다.",
  S57: "합성 발언: 배포 연기 이유는 합성 데이터 검증 실패다.",
  S58: "합성 발언: 이 결정의 담당자는 가상 인물 은하이다.",
};
const FIXED_TIME = "2026-01-01T00:00:00.000Z";
const DB = { host: "127.0.0.1", port: 55440, database: "knot_eval", user: "knot_eval", password: "local-eval-only", connectionTimeoutMillis: 3000 };
const Registry = z.object({ workspace_id: z.string(), restricted_workspace_id: z.string().nullable(), documents: z.array(z.object({ logicalId: z.string(), physicalId: z.string(), workspaceId:z.string() })) });
const StoredDoc = z.object({ id: z.string(), workspace_id: z.string(), title: z.string(), content: z.string(), topic: z.string(), summary: z.string().nullable(), status: z.string(), created_at: z.date(), started_at: z.date() });
type Fixture = z.infer<typeof Registry>;

export function checkLocalCase(c: EvalCase, review?: "correct" | "incorrect" | "hold"): void {
  const readiness = caseReadiness(c, new Date(), review);
  if (!readiness.ready) throw new Error(readiness.reason);
}
export function fixtureFingerprint(c: EvalCase): string {
  return createHash("sha256").update(JSON.stringify({ schema: 8, case: c, fixedTime: FIXED_TIME, transcript: EXCLUDED_TRANSCRIPTS[c.scenario] ?? "합성 전사. 검색 근거는 저장 문서만 사용한다." })).digest("hex");
}
async function prepareFixture(client: Client, c: EvalCase, hash: string): Promise<Fixture> {
  await client.query(`CREATE TABLE IF NOT EXISTS eval_case_fixtures (fixture_hash text PRIMARY KEY, workspace_id bigint NOT NULL UNIQUE, documents jsonb NOT NULL)`);
  await client.query("ALTER TABLE eval_case_fixtures ADD COLUMN IF NOT EXISTS restricted_workspace_id bigint");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [hash]);
    const identity = await client.query("SELECT current_database() AS name");
    if (z.object({name:z.literal("knot_eval")}).parse(identity.rows[0]).name !== "knot_eval") throw new Error("평가 전용 DB가 아닙니다.");
    const member = await client.query("SELECT nickname,deleted_at FROM members WHERE id=1");
    if (!member.rows.length) {
      const count = await client.query("SELECT count(*)::int AS total FROM members");
      if (z.object({total:z.number()}).parse(count.rows[0]).total !== 0) throw new Error("평가 전용 사용자를 확인할 수 없습니다.");
      const created = await client.query("INSERT INTO members(nickname) VALUES('평가자') RETURNING id::text");
      if (z.object({id:z.literal("1")}).parse(created.rows[0]).id !== "1") throw new Error("평가 전용 사용자를 만들 수 없습니다.");
    } else {
      const current = z.object({nickname:z.literal("평가자"),deleted_at:z.null()}).parse(member.rows[0]);
      if (current.nickname !== "평가자") throw new Error("평가 전용 사용자를 확인할 수 없습니다.");
    }
    const existing = await client.query("SELECT workspace_id::text, restricted_workspace_id::text, documents FROM eval_case_fixtures WHERE fixture_hash=$1", [hash]);
    if (existing.rows.length) {
      const found = Registry.parse(existing.rows[0]);
      await client.query("COMMIT");
      return found;
    }
    const workspace = await client.query("INSERT INTO workspaces(name,created_at) VALUES($1,$2) RETURNING id::text", [`평가 ${c.id}`,FIXED_TIME]);
    const workspaceId = z.object({id:z.string()}).parse(workspace.rows[0]).id;
    await client.query("INSERT INTO workspace_members(workspace_id,member_id,role,joined_at) VALUES($1,1,'OWNER',$2)",[workspaceId,FIXED_TIME]);
    let restrictedId: string | null = null;
    if (c.documents.some((doc) => doc.accessible === false)) {
      const owner = await client.query("INSERT INTO members(nickname) VALUES('별도 합성 사용자') RETURNING id::text");
      const ownerId = z.object({id:z.string()}).parse(owner.rows[0]).id;
      const restricted = await client.query("INSERT INTO workspaces(name,created_at) VALUES($1,$2) RETURNING id::text", [`제한 ${c.id}`,FIXED_TIME]);
      restrictedId = z.object({id:z.string()}).parse(restricted.rows[0]).id;
      await client.query("INSERT INTO workspace_members(workspace_id,member_id,role,joined_at) VALUES($1,$2,'OWNER',$3)",[restrictedId,ownerId,FIXED_TIME]);
    }
    const documents: {logicalId:string; physicalId:string; workspaceId:string}[] = [];
    const transcriptContent = EXCLUDED_TRANSCRIPTS[c.scenario] ?? "합성 전사. 검색 근거는 저장 문서만 사용한다.";
    if (!c.documents.length && EXCLUDED_TRANSCRIPTS[c.scenario]) {
      const recording = await client.query("INSERT INTO recording_sessions(workspace_id,member_id,request_id,tab_id,control_token_hash,status,started_at,ended_at,last_seen_at,end_reason) VALUES($1,1,$2,$3,$4,'ENDED',$5,$5,$5,'USER_ENDED') RETURNING id::text",[workspaceId,randomUUID(),randomUUID(),"0".repeat(64),FIXED_TIME]);
      const recordingId = z.object({id:z.string()}).parse(recording.rows[0]).id;
      await client.query("INSERT INTO transcripts(recording_session_id,content,created_at) VALUES($1,$2,$3)",[recordingId,transcriptContent,FIXED_TIME]);
    }
    for (const [i, doc] of c.documents.entries()) {
      const documentWorkspace = doc.accessible === false ? restrictedId : workspaceId;
      if (!documentWorkspace) throw new Error("제한된 작업 공간이 없습니다.");
      const meetingTime = doc.meetingStartedAt ?? FIXED_TIME;
      const documentTime = doc.createdAt ?? FIXED_TIME;
      const recording = await client.query("INSERT INTO recording_sessions(workspace_id,member_id,request_id,tab_id,control_token_hash,status,started_at,ended_at,last_seen_at,end_reason) VALUES($1,1,$2,$3,$4,'ENDED',$5,$5,$5,'USER_ENDED') RETURNING id::text",[documentWorkspace,randomUUID(),randomUUID(),"0".repeat(64),meetingTime]);
      const recordingId = z.object({id:z.string()}).parse(recording.rows[0]).id;
      const transcript = await client.query("INSERT INTO transcripts(recording_session_id,content,created_at) VALUES($1,$2,$3) RETURNING id::text",[recordingId,transcriptContent,documentTime]);
      const transcriptId = z.object({id:z.string()}).parse(transcript.rows[0]).id;
      const batch = await client.query("INSERT INTO document_generation_batches(recording_session_id,transcript_id,topic_registration_state,accepted_at,registered_at,processing_status,succeeded_count,finished_at) VALUES($1,$2,'TOPICS_REGISTERED',$3,$3,'SUCCEEDED',1,$3) RETURNING id::text",[recordingId,transcriptId,documentTime]);
      const batchId = z.object({id:z.string()}).parse(batch.rows[0]).id;
      const topic = doc.title;
      await client.query("INSERT INTO document_generation_batch_topics(batch_id,position,topic) VALUES($1,0,$2)",[batchId,topic]);
      const job = await client.query("INSERT INTO document_generation_jobs(transcript_id,status,created_at,updated_at,batch_id,stage,topic) VALUES($1,'SUCCEEDED',$2,$2,$3,'GENERATION',$4) RETURNING id::text",[transcriptId,documentTime,batchId,topic]);
      const jobId = z.object({id:z.string()}).parse(job.rows[0]).id;
      const result = await client.query("INSERT INTO documents(workspace_id,recording_session_id,source_transcript_id,document_generation_job_id,topic,title,content,summary,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9) RETURNING id::text",[documentWorkspace,recordingId,transcriptId,jobId,topic,doc.title,doc.content,doc.summary ?? null,documentTime]);
      documents.push({logicalId:doc.id,physicalId:z.object({id:z.string()}).parse(result.rows[0]).id,workspaceId:documentWorkspace});
    }
    await client.query("INSERT INTO eval_case_fixtures(fixture_hash,workspace_id,documents,restricted_workspace_id) VALUES($1,$2,$3::jsonb,$4)",[hash,workspaceId,JSON.stringify(documents),restrictedId]);
    await client.query("COMMIT");
    return {workspace_id:workspaceId,restricted_workspace_id:restrictedId,documents};
  } catch (e) { await client.query("ROLLBACK"); throw e; }
}
async function verifyFixture(client: Client,c: EvalCase,fixture: Fixture): Promise<void> {
  const actual = await client.query("SELECT d.id::text,d.workspace_id::text,d.title,d.content,d.topic,d.summary,d.status,d.created_at,r.started_at FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=ANY($1::bigint[]) ORDER BY d.id",[[fixture.workspace_id,...(fixture.restricted_workspace_id ? [fixture.restricted_workspace_id] : [])]]);
  const rows = z.array(StoredDoc).parse(actual.rows);
  const transcripts = await client.query("SELECT t.content FROM transcripts t JOIN recording_sessions r ON r.id=t.recording_session_id WHERE r.workspace_id=ANY($1::bigint[])", [[fixture.workspace_id,...(fixture.restricted_workspace_id ? [fixture.restricted_workspace_id] : [])]]);
  const contents = z.array(z.object({content:z.string()})).parse(transcripts.rows);
  const expectedTranscript = EXCLUDED_TRANSCRIPTS[c.scenario] ?? "합성 전사. 검색 근거는 저장 문서만 사용한다.";
  const expectedCount = c.documents.length || (EXCLUDED_TRANSCRIPTS[c.scenario] ? 1 : 0);
  if (contents.length !== expectedCount || contents.some((t) => t.content !== expectedTranscript)) throw new Error("사례의 전사 조건이 변경됐습니다.");
  if (fixture.restricted_workspace_id) {
    const membership = await client.query("SELECT count(*)::int AS count FROM workspace_members WHERE workspace_id=$1 AND member_id=1 AND left_at IS NULL",[fixture.restricted_workspace_id]);
    if (z.object({count:z.number()}).parse(membership.rows[0]).count !== 0) throw new Error("제한 작업 공간의 권한이 변경됐습니다.");
  }
  if (rows.length !== c.documents.length || rows.length !== fixture.documents.length) throw new Error("사례의 문서 수가 변경됐습니다.");
  for (const [i, expected] of c.documents.entries()) {
    const mapping = fixture.documents[i];
    const row = rows.find((x) => x.id === mapping?.physicalId);
    if (!mapping || mapping.logicalId !== expected.id || mapping.workspaceId !== (expected.accessible === false ? fixture.restricted_workspace_id : fixture.workspace_id) || !row || row.workspace_id !== mapping.workspaceId || row.title !== expected.title || row.content !== expected.content || row.topic !== expected.title || row.summary !== (expected.summary ?? null) || row.status !== "DRAFT" || row.created_at.toISOString() !== new Date(expected.createdAt ?? FIXED_TIME).toISOString() || row.started_at.toISOString() !== new Date(expected.meetingStartedAt ?? FIXED_TIME).toISOString()) throw new Error("사례의 문서 조건이 변경됐습니다.");
  }
}
async function createHistory(client: Client, c: EvalCase, fixture: Fixture, offsetSeconds = 0): Promise<string | null> {
  if (!c.history.length) return null;
  await client.query("BEGIN");
  try {
    const result = await client.query("INSERT INTO search_conversations(workspace_id,member_id,created_at,updated_at,visible_in_list) VALUES($1,1,now() + make_interval(secs => $2),now() + make_interval(secs => $2),false) RETURNING id::text", [fixture.workspace_id, offsetSeconds]);
    const id = z.object({id:z.string()}).parse(result.rows[0]).id;
    for (const [i, item] of c.history.entries()) {
      const role = item.role === "user" ? "USER" : "ASSISTANT";
      const status = item.role === "user" ? "RECEIVED" : "COMPLETED";
      await client.query("INSERT INTO search_messages(conversation_id,role,sequence,content,status,created_at) VALUES($1,$2,$3,$4,$5,now() + make_interval(secs => $6))", [id,role,i+1,item.content,status,offsetSeconds]);
    }
    await client.query("COMMIT");
    return id;
  } catch (e) { await client.query("ROLLBACK"); throw e; }
}
function localCookie(offsetSeconds = 0, secret = "local-evaluation-only-secret-not-for-other-environments"): string {
  const now=Math.floor(Date.now()/1000) + offsetSeconds;
  const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString("base64url");
  const body=`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:"1",iss:"https://knoted.kr",aud:["knot-api"],iat:now,exp:now+300,token_type:"ACCESS",nickname:"평가자"})}`;
  return `KNOT_ACCESS_TOKEN=${body}.${createHmac("sha256",secret).update(body).digest("base64url")}`;
}
/** Materializes only synthetic case documents; does not imply the scenario can run yet. */
export async function stageLocalCase(c: EvalCase): Promise<void> {
  const client = new Client(DB);
  await client.connect();
  try {
    const fixture = await prepareFixture(client, c, fixtureFingerprint(c));
    await verifyFixture(client, c, fixture);
  } finally { await client.end(); }
}

/** Run against the single synthetic workspace. Its results are unscored until cases are recalibrated. */
export async function executeSharedCase(c: EvalCase, revision: string, datasetRef: {readonly id:string; readonly version:string; readonly corpusHash?:string}, clock?: {readonly offsetSeconds: number; readonly evaluationTime: string; readonly sandbox?: 'fuzzy' | 'budget'}, target: 'baseline' | 'lab' = 'baseline'): Promise<Run> {
  let connection = DB;
  let baseUrl = 'http://127.0.0.1:18081';
  let cookieSecret: string | undefined;
  if (target === 'lab') {
    if (clock || !process.env.SEARCH_LAB_DB_PASSWORD || !process.env.SEARCH_LAB_JWT_SECRET) throw new Error('탐색 실험실 연결 설정을 확인해 주세요.');
    connection = {...DB, port:55441, database:'knot_lab', user:'knot_lab', password:process.env.SEARCH_LAB_DB_PASSWORD};
    baseUrl = 'http://127.0.0.1:18087';
    cookieSecret = process.env.SEARCH_LAB_JWT_SECRET;
  }
  if (clock) { connection = {...DB, database:'knot_eval_clock'}; baseUrl = 'http://127.0.0.1:18083'; }
  if (clock?.sandbox === 'fuzzy') { connection = {...DB, database:'knot_eval_fuzzy'}; baseUrl = 'http://127.0.0.1:18084'; }
  if (clock?.sandbox === 'budget') { connection = {...DB, database:'knot_eval_budget'}; baseUrl = 'http://127.0.0.1:18086'; }
  const client = new Client(connection);
  await client.connect();
  let hash: string;
  let conversationId: string | null;
  const workspaceId = "458";
  try {
    const identity = await client.query("SELECT current_database() AS name");
    if (identity.rows[0]?.name !== connection.database) throw new Error("평가 전용 DB가 아닙니다.");
    const corpus = await client.query("SELECT document_count FROM eval_shared_corpora WHERE workspace_id=$1", [workspaceId]);
    if (corpus.rows.length !== 1) throw new Error("공통 합성 워크스페이스를 확인할 수 없습니다.");
    const rows = await client.query("SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id", [workspaceId]);
    if (rows.rowCount !== Number(corpus.rows[0].document_count)) throw new Error("공통 문서 수가 변경됐습니다.");
    hash = createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex");
    if (datasetRef.corpusHash && datasetRef.corpusHash !== hash) throw new Error("평가셋 기준 문서가 변경됐습니다.");
    if (c.history.length % 2 !== 0 || c.history.some((item, i) => item.role !== (i % 2 === 0 ? "user" : "assistant"))) throw new Error("이전 대화가 완전하지 않아 실행할 수 없습니다.");
    conversationId = await createHistory(client, c, {workspace_id:workspaceId,restricted_workspace_id:null,documents:[]}, clock?.offsetSeconds);
  } finally { await client.end(); }
  const startedAt=new Date().toISOString(), start=performance.now();
  let answer="", error:string|null=null, evidenceIds:string[]=[];
  let retrievalObserved:RetrievalObservation|undefined = c.executionFixture === 'no_search_observation' ? 'unknown' : undefined;
  let privacyLogObserved:PrivacyLogObservation|undefined = c.executionFixture === 'privacy_observation' ? 'unknown' : undefined;
  let status:Run["results"][number]["status"]="completed";
  let answerMessageId: number | undefined;
  let firstProgressMs: number | undefined, firstDeltaMs: number | undefined;
  try {
    const signal=AbortSignal.timeout(120_000);
    const csrfResponse=await fetch(`${baseUrl}/api/v1/auth/csrf`,{signal});
    if (!csrfResponse.ok) throw new Error("인증 준비 실패");
    const csrf=z.object({token:z.string().min(1)}).parse(await csrfResponse.json());
    const csrfCookie=csrfResponse.headers.getSetCookie().find((x)=>x.startsWith("XSRF-TOKEN="))?.split(";")[0];
    if (!csrfCookie) throw new Error("인증 준비 실패");
    const endpoint=conversationId ? `/search/conversations/${conversationId}/questions` : "/search/conversations";
    const requestStarted = performance.now();
    const response=await fetch(`${baseUrl}/api/v1/workspaces/${workspaceId}${endpoint}`,{method:"POST",signal,headers:{"content-type":"application/json",accept:"text/event-stream",cookie:`${localCookie(clock?.offsetSeconds, cookieSecret)}; ${csrfCookie}`,"X-XSRF-TOKEN":csrf.token},body:JSON.stringify({content:c.question,requestId:randomUUID()})});
    if (!response.ok || !response.body) throw new Error(`Spring 요청 실패 (${response.status})`);
    const result=await readSpringStream(response.body,(event) => {
      const elapsed = Math.round(performance.now() - requestStarted);
      if (event === 'progress' && firstProgressMs === undefined) firstProgressMs = elapsed;
      if (event === 'delta' && firstDeltaMs === undefined) firstDeltaMs = elapsed;
    });
    answerMessageId = result.answerMessageId;
    if (result.status !== "completed") { status="failed"; error=result.failureCode ?? "Spring 응답이 완료되지 않았습니다."; }
    else {
      if (clock) {
        const verification = new Client(connection);
        await verification.connect();
        try {
          const query = await verification.query("SELECT created_at FROM search_messages WHERE conversation_id=$1 AND role='USER' ORDER BY sequence DESC LIMIT 1", [result.conversationId]);
          const acceptedAt = z.object({created_at:z.date()}).parse(query.rows[0]).created_at;
          if (Math.abs(acceptedAt.getTime() - Date.parse(clock.evaluationTime)) > 30_000) throw new Error("실제 질문 접수 시각이 실험 조건과 다릅니다.");
          if (c.executionFixture === 'no_search_observation' || c.executionFixture === 'privacy_observation') {
            const execution = await verification.query('SELECT e.answer_id FROM search_answer_executions e JOIN search_messages m ON m.id=e.answer_id WHERE e.conversation_id=$1 ORDER BY m.sequence DESC LIMIT 1', [result.conversationId]);
            const answerId = z.object({answer_id:z.coerce.number().int().positive()}).parse(execution.rows[0]).answer_id;
            if (c.executionFixture === 'no_search_observation') retrievalObserved = await collectRetrievalObservation(answerId,startedAt);
            if (c.executionFixture === 'privacy_observation') privacyLogObserved = await collectPrivacyLog(answerId,startedAt);
          }
        } finally { await verification.end(); }
      }
      answer=result.answer; evidenceIds=result.evidenceIds.map((id)=>`document-${id}`);
    }
  } catch (e) { status=e instanceof Error && e.name === "TimeoutError" ? "timeout" : "failed"; error="서버 요청 또는 응답을 완료하지 못했습니다."; }
  const after=new Client(connection);await after.connect();
  try {
    const rows=await after.query("SELECT d.id::text,d.title,d.topic,d.content,d.summary,d.status,d.created_at,d.archived_at,r.started_at,r.ended_at,r.accumulated_recording_millis FROM documents d JOIN recording_sessions r ON r.id=d.recording_session_id WHERE d.workspace_id=$1 ORDER BY d.id",[workspaceId]);
    if(createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex")!==hash) throw new Error("실행 중 공통 문서가 변경됐습니다.");
  } finally { await after.end(); }
  const latencyMs = Math.round(performance.now()-start);
  const container = target === 'lab' ? 'knot-search-lab-backend-1' : clock?.sandbox === 'fuzzy' ? 'knot-eval-fuzzy-prototype' : clock?.sandbox === 'budget' ? 'knot-eval-budget-prototype' : clock ? 'knot-eval-clock-controlled' : 'knot-eval-isolated-backend-1';
  const stageTimings = answerMessageId ? await collectStageTimings(answerMessageId,startedAt,container) : {capture:'unavailable' as const,stages:[]};
  let strategy = '공통 합성 공간 · 기대 결과 재검수 필요';
  if (target === 'lab') strategy = 'knot-search-lab · 공통 합성 공간 · 기대 결과 재검수 필요';
  if (clock) strategy = `시각 제어 사본 · ${clock.evaluationTime}`;
  if (clock?.sandbox === 'fuzzy') strategy = '유사도 검색 프로토타입 · 합성 DB 사본';
  if (clock?.sandbox === 'budget') strategy = '입력 제한·지정 후보 · 합성 DB 사본';
  if (c.executionFixture === 'transcript_exclusion') strategy = '원문 제외 조건 · 합성 DB 사본';
  if (c.executionFixture === 'no_document_recording') strategy = '문서 없는 녹음 · 합성 DB 사본';
  if (c.executionFixture === 'no_search_observation') strategy = '검색 여부 관측 · 합성 DB 사본';
  if (c.executionFixture === 'privacy_observation') strategy = '합성 개인정보 로그 관측 · 합성 DB 사본';
  return {id:`shared-${randomUUID()}`,datasetId:datasetRef.id,datasetVersion:datasetRef.version,corpusHash:hash,name:`${c.id} · ${startedAt}`,strategy,environment:"isolated_spring",model:(target === 'lab' ? process.env.SEARCH_LAB_MODEL : process.env.LOCAL_EVAL_MODEL) || "로컬 설정 모델 (확인 필요)",revision,startedAt,status:status === "completed" ? "completed" : "failed",results:[{caseId:c.id,status,candidates:[],answer,evidenceIds,latencyMs,error,retrievalObserved,privacyLogObserved,stageTimings,clientTimings:{firstProgressMs,firstDeltaMs}}]};
}
export async function executeLocalCase(c: EvalCase, revision: string, datasetRef: {readonly id:string; readonly version:string} = {id:"knot-local-cases",version:"1.0"}, review?: "correct" | "incorrect" | "hold"): Promise<Run> {
  checkLocalCase(c, review);
  const client=new Client(DB);
  await client.connect();
  const hash=fixtureFingerprint(c);
  let fixture: Fixture; let conversationId: string | null;
  try { fixture=await prepareFixture(client,c,hash); await verifyFixture(client,c,fixture); conversationId=await createHistory(client,c,fixture); } finally { await client.end(); }
  const startedAt=new Date().toISOString(); const start=performance.now();
  let answer=""; let evidenceIds:string[]=[]; let error:string|null=null; let status:Run["results"][number]["status"]="completed";
  try {
    const signal=AbortSignal.timeout(120_000);
    const csrfResponse=await fetch("http://127.0.0.1:18081/api/v1/auth/csrf",{signal});
    if (!csrfResponse.ok) throw new Error("로컬 서버 인증 준비 실패");
    const csrf=z.object({token:z.string().min(1)}).parse(await csrfResponse.json());
    const csrfCookie=csrfResponse.headers.getSetCookie().find((x)=>x.startsWith("XSRF-TOKEN="))?.split(";")[0];
    if (!csrfCookie) throw new Error("로컬 서버 인증 준비 실패");
    const endpoint=conversationId ? `/search/conversations/${conversationId}/questions` : "/search/conversations";
    const response=await fetch(`http://127.0.0.1:18081/api/v1/workspaces/${fixture.workspace_id}${endpoint}`,{method:"POST",signal,headers:{"content-type":"application/json",accept:"text/event-stream",cookie:`${localCookie()}; ${csrfCookie}`,"X-XSRF-TOKEN":csrf.token},body:JSON.stringify({content:c.question,requestId:randomUUID()})});
    if (!response.ok || !response.body) throw new Error(`로컬 Spring 요청 실패 (${response.status})`);
    const result=await readSpringStream(response.body);
    if (result.status !== "completed") { status="failed"; error=result.failureCode ?? "Spring 응답이 완료되지 않았습니다."; }
    else { answer=result.answer; evidenceIds=result.evidenceIds.map((id)=>fixture.documents.find((d)=>d.physicalId===id)?.logicalId ?? `document-${id}`); }
  } catch (e) { status=e instanceof Error && e.name === "TimeoutError" ? "timeout" : "failed"; error="서버 요청 또는 응답을 완료하지 못했습니다."; }
  const after=new Client(DB); await after.connect();
  try { await verifyFixture(after,c,fixture); } finally { await after.end(); }
  return {id:`local-${randomUUID()}`,datasetId:datasetRef.id,datasetVersion:datasetRef.version,corpusHash:hash,name:`${c.id} · ${startedAt}`,strategy:"격리 합성 문서 · 실제 Spring",environment:"isolated_spring",model:process.env.LOCAL_EVAL_MODEL || "로컬 설정 모델 (확인 필요)",revision,startedAt,status:status === "completed" ? "completed" : "failed",results:[{caseId:c.id,status,candidates:[],answer,evidenceIds,latencyMs:Math.round(performance.now()-start),error}]};
}
