import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { executeSharedCase } from './local-spring';
import type { EvalCase, Run } from './schema';

const docker = promisify(execFile);
const directory = '/Users/yongtae/Desktop/knot/backend/resume/search-eval/local-runner/clock-control';
const db = {host:'127.0.0.1', port:55440, database:'knot_eval_clock', user:'knot_eval', password:'local-eval-only', connectionTimeoutMillis:3000};
const transcripts: Readonly<Record<string, {readonly documentId: number; readonly content:string; readonly segments:readonly string[]}>> = {
 S02:{documentId:2144,content:'합성 발언: 결제 기능 출시를 결제사 점검 때문에 연기했습니다.',segments:['합성 발언: 결제 기능 출시를 결제사 점검 때문에 연기했습니다.']},
 S24:{documentId:2163,content:'합성 발언: 외부 연동은 오늘 오후 14시에 재시도합니다.',segments:['합성 발언: 외부 연동은 오늘 오후 14시에 재시도합니다.']},
 S30:{documentId:2169,content:'합성 발언: 논의한 데이터 보관 기간은 38일입니다.',segments:['합성 발언: 논의한 데이터 보관 기간은 38일입니다.']},
 S57:{documentId:2192,content:'합성 발언 1: 보안 인증서 갱신이 지연됐습니다. 합성 발언 2: 이 지연으로 배포를 연기합니다.',segments:['합성 발언 1: 보안 인증서 갱신이 지연됐습니다.','합성 발언 2: 이 지연으로 배포를 연기합니다.']},
};

/** Only one test may change the isolated server clock; stale running work blocks a new test. */
export async function executeClockCase(c: EvalCase, dataset: {readonly id:string; readonly version:string; readonly corpusHash?:string}): Promise<Run> {
 if (!c.evaluationTime && !c.executionFixture) throw new Error('사례의 실행 조건이 없습니다.');
 const evaluationTime = c.evaluationTime ?? new Date().toISOString();
 const target = Date.parse(evaluationTime);
 if (!Number.isFinite(target)) throw new Error('사례의 기준 시각이 올바르지 않습니다.');
 const container = await docker('docker', ['inspect','--format','{{.State.Running}} {{.Image}}','knot-eval-clock-controlled'], {timeout:3000});
 const image = await docker('docker', ['image','inspect','--format','{{.Id}}','knot-eval-controlled-clock-local'], {timeout:3000});
 const imageId = image.stdout.trim();
 const state = container.stdout.trim();
 if (!/^sha256:[a-f0-9]{64}$/.test(imageId) || ![`true ${imageId}`, `false ${imageId}`].includes(state)) throw new Error('시각 제어 전용 Spring이 준비되지 않았습니다.');
 const configuration = await docker('docker', ['inspect','--format','{{range .Config.Env}}{{println .}}{{end}}','knot-eval-clock-controlled'], {timeout:3000});
 const environment = new Set(configuration.stdout.split(/\r?\n/));
 if (!environment.has('DB_URL=jdbc:postgresql://postgres:5432/knot_eval_clock') || !environment.has('EVAL_CLOCK_OFFSET_FILE=/eval-clock/offset')) throw new Error('시각 제어 서버의 격리 설정을 확인할 수 없습니다.');
 if (state.startsWith('false ')) await docker('docker', ['start','knot-eval-clock-controlled'], {timeout:15000});
 let healthy = false;
 for (let attempt = 0; attempt < 30; attempt++) {
  try {
   const response = await fetch('http://127.0.0.1:18083/api/v1/auth/csrf', {signal:AbortSignal.timeout(1000)});
   if (response.ok) { healthy = true; break; }
  } catch (error) { if (!(error instanceof Error)) throw error; }
  await new Promise((resolve) => setTimeout(resolve,1000));
 }
 if (!healthy) throw new Error('시각 제어 전용 Spring이 응답하지 않습니다.');
 const client = new Client(db);
 await client.connect();
 let locked = false;
 const temporary = `${directory}/offset-${randomUUID()}`;
 try {
  const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['knot-eval-clock-run']);
  if (lock.rows[0]?.locked !== true) throw new Error('다른 시각 제어 실험이 진행 중입니다.');
  locked = true;
  const pending = await client.query("SELECT count(*)::int AS total FROM search_answer_executions WHERE state IN ('QUEUED','RUNNING')");
  if (pending.rows[0]?.total !== 0) throw new Error('이전 시각 제어 실험이 아직 종료되지 않았습니다.');
  if (c.executionFixture === 'transcript_exclusion') {
   const fixture = transcripts[c.scenario];
   if (!fixture) throw new Error('사례의 합성 원문 조건을 확인할 수 없습니다.');
   const actual = await client.query('SELECT t.content, array_agg(s.text ORDER BY s.position) AS segments FROM documents d JOIN transcripts t ON t.id=d.source_transcript_id JOIN transcript_segments s ON s.transcript_id=t.id WHERE d.workspace_id=458 AND d.id=$1 GROUP BY t.content', [fixture.documentId]);
   if (actual.rowCount !== 1 || actual.rows[0]?.content !== fixture.content || JSON.stringify(actual.rows[0]?.segments) !== JSON.stringify(fixture.segments)) throw new Error('합성 원문 조건이 변경됐습니다.');
  }
  if (c.executionFixture === 'no_document_recording') {
   const recordingId: Readonly<Record<string, number>> = {S37:940037, S38:940038, S62:940062};
   const id = recordingId[c.scenario];
   if (!id) throw new Error('문서 없는 녹음의 사례 조건을 알 수 없습니다.');
   if (c.scenario === 'S37') {
    await client.query(`UPDATE recording_transcriptions SET status='PROCESSING', failure_code=NULL
      WHERE recording_session_id=940037 AND attempt_id='94000000-0000-4000-a000-000000000037'
        AND status='FAILED' AND failure_code='SERVER_RESTARTED'
        AND NOT EXISTS (SELECT 1 FROM recording_transcriptions WHERE status='PROCESSING')
        AND EXISTS (SELECT 1 FROM recording_audio_uploads WHERE recording_id=940037 AND storage_key='synthetic-eval-only/s37-not-uploaded' AND status='RESERVED')`);
   }
   const result = await client.query(`SELECT r.status, r.started_at, r.ended_at,
     (SELECT count(*)::int FROM documents d WHERE d.recording_session_id=r.id) AS document_count,
     (SELECT status FROM recording_transcriptions rt WHERE rt.recording_session_id=r.id) AS transcription_status,
     (SELECT t.content FROM transcripts t WHERE t.recording_session_id=r.id) AS transcript,
     (SELECT b.processing_status FROM document_generation_batches b WHERE b.recording_session_id=r.id) AS batch_status,
     (SELECT j.status FROM document_generation_jobs j JOIN transcripts t ON t.id=j.transcript_id WHERE t.recording_session_id=r.id) AS job_status
     FROM recording_sessions r WHERE r.id=$1 AND r.workspace_id=458`, [id]);
   const actual = result.rows[0];
   const expectedTimes: Readonly<Record<string, readonly [string,string]>> = {
    S37:['2026-11-02T02:00:00.000Z','2026-11-02T02:59:00.000Z'],
    S38:['2026-11-02T02:00:00.000Z','2026-11-02T02:59:00.000Z'],
    S62:['2026-10-28T14:30:00.000Z','2026-10-28T16:00:00.000Z'],
   };
   const [start,end] = expectedTimes[c.scenario];
   if (result.rowCount !== 1 || actual.status !== 'ENDED' || actual.document_count !== 0 || actual.started_at.toISOString() !== start || actual.ended_at.toISOString() !== end) throw new Error('문서 없는 녹음 조건이 변경됐습니다.');
   if (c.scenario === 'S37' && (actual.transcription_status !== 'PROCESSING' || actual.transcript !== null)) throw new Error('전사 진행 조건이 변경됐습니다.');
   if (c.scenario === 'S38' && (actual.transcript !== '합성 발언: 장애 대응 리허설의 배포 담당자는 하늘입니다.' || actual.batch_status !== 'FAILED' || actual.job_status !== 'FAILED')) throw new Error('문서 생성 실패 조건이 변경됐습니다.');
   if (c.scenario === 'S62' && actual.transcript !== '합성 발언: 정기 결제 회의에서 임시 코드명 가람을 검토했습니다.') throw new Error('자정 경계 원문 조건이 변경됐습니다.');
  }
  const offsetSeconds = Math.round((target - Date.now()) / 1000);
  await writeFile(temporary, `${offsetSeconds}\n`, {mode:0o644, flag:'wx'});
  await rename(temporary, `${directory}/offset`);
  return await executeSharedCase(c, `clock ${imageId}`, dataset, {offsetSeconds, evaluationTime});
 } finally {
  try {
   try { await unlink(temporary); } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  } finally {
   try { if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['knot-eval-clock-run']); }
   finally { await client.end(); }
  }
 }
}
