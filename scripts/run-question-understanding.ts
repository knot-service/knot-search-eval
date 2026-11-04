import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { mutateState, readState } from "../lib/db";
import { DatasetSchema, RunSchema } from "../lib/schema";
import { contentHash } from "../lib/state";

const guardCases = ["QG-01", "QG-02", "QG-03", "QG-04"] as const;
const cases = ["S08-01", "S09-01", "S17-01", "S23-01", "S35-01", "S36-01", "S69-01", "S73-01", "S74-01", "QX-01", ...guardCases] as const;
const resultSchema = z.object({client:z.enum(["http","spring"]),mode:z.enum(["prompt","schema"]),model:z.string(),promptVersion:z.string(),status:z.enum(["completed","failed"]),calls:z.number().nullable(),durationMs:z.number().nonnegative(),output:z.unknown().optional(),compactOutput:z.unknown().optional(),error:z.string().optional(),timings:z.object({clientPreparationMs:z.number().nonnegative(),responseHeadersMs:z.number().nonnegative(),firstContentMs:z.number().nonnegative(),generationAfterFirstMs:z.number().nonnegative(),parseMs:z.number().nonnegative(),guardMs:z.number().nonnegative()}).optional(),serverGuard:z.object({modelOutput:z.unknown(),corrections:z.array(z.object({requestIndex:z.number(),field:z.string(),original:z.string(),adjusted:z.string(),reason:z.string()})),durationMs:z.number().nonnegative()}).optional(),usage:z.object({prompt_tokens:z.number().nullable().optional(),completion_tokens:z.number().nullable().optional()}).optional()});
const pendingDir = resolve(process.cwd(), "../knot/backend/resume/search-improvement/question-understanding-runs");
const executable = resolve(process.cwd(), "../knot-search-lab/experiments/question-understanding/build/install/question-understanding-experiment/bin/question-understanding-experiment");
const envPath = resolve(process.cwd(), "../knot-search-lab/.env.search-local");
const promptVersion = "question-understanding-v7";
const contractFixture = DatasetSchema.parse({id:"question-contract-fixtures",name:"질문 이해 계약 · 추가 합성 사례",version:"1.0",source:"synthetic",corpusHash:"question-contract-no-documents-v1",cases:[{id:"QX-01",scenario:"복합 질문",category:"질문 이해",question:"지난주 결제 회의의 담당자와 이번 달 로그인 회의의 결정 사항을 알려줘.",history:[],documents:[],expectedType:"answer",expectedBehavior:"결제 회의 담당자에는 지난주를, 로그인 회의 결정 사항에는 이번 달을 각각 적용한다.",expectedEvidenceIds:[],evaluationTime:"2026-10-29T03:00:00.000Z"}]});
const guardFixture = DatasetSchema.parse({id:"question-guard-fixtures",name:"질문 이해 · 회의 보정 반대 사례",version:"1.0",source:"synthetic",corpusHash:"question-guard-no-documents-v1",cases:[
  {id:"QG-01",scenario:"암시된 모임",category:"질문 이해",question:"그거 담당자는?",history:[{role:"user",content:"지난주 결제 킥오프에서 결정된 내용 알려줘."},{role:"assistant",content:"결제 취소 기능을 출시하기로 했어요."}],documents:[],expectedType:"answer",expectedBehavior:"지난주 결제 킥오프의 결제 취소 기능 맥락을 유지하고 담당자를 찾는다.",expectedEvidenceIds:[],evaluationTime:"2026-10-29T03:00:00.000Z"},
  {id:"QG-02",scenario:"복합 질문",category:"질문 이해",question:"배포 회의 결정 사항과 결제 기능 담당자를 알려줘.",history:[],documents:[],expectedType:"answer",expectedBehavior:"배포 회의와 결제 기능을 분리하며 결제 기능에 명시되지 않은 회의를 필수 조건으로 추가하지 않는다.",expectedEvidenceIds:[],evaluationTime:"2026-10-29T03:00:00.000Z"},
  {id:"QG-03",scenario:"문서 유형",category:"질문 이해",question:"결제 회의록 목록 보여줘.",history:[],documents:[],expectedType:"answer",expectedBehavior:"사용자가 명시한 회의록 유형과 목록 요청을 유지한다.",expectedEvidenceIds:[],evaluationTime:"2026-10-29T03:00:00.000Z"},
  {id:"QG-04",scenario:"명시된 미팅",category:"질문 이해",question:"지난주 결제 미팅 담당자는?",history:[],documents:[],expectedType:"answer",expectedBehavior:"결제 미팅과 지난주 조건을 유지하고 담당자를 찾는다.",expectedEvidenceIds:[],evaluationTime:"2026-10-29T03:00:00.000Z"}
]});

async function modelEnv(): Promise<NodeJS.ProcessEnv> {
  const content = await readFile(envPath, "utf8");
  const values = new Map(content.split(/\r?\n/).filter(line => line.includes("=")).map(line => {
    const at = line.indexOf("=");
    return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
  const base = values.get("LLM_BASE_URL"), token = values.get("LLM_API_TOKEN"), model = values.get("LLM_MODEL");
  if (!base || !token || !model || new URL(base).protocol !== "https:") throw new Error("실험 모델 설정을 확인하세요.");
  return {...process.env, JAVA_HOME: process.env.QUESTION_LAB_JAVA_HOME ?? "/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home", LLM_BASE_URL:base, LLM_API_TOKEN:token, LLM_MODEL:model};
}
async function runModel(input: object, env: NodeJS.ProcessEnv) {
  return new Promise<z.infer<typeof resultSchema>>((resolveResult, reject) => {
    const child = spawn(executable, [], {env, stdio:["pipe","pipe","pipe"]});
    let stdout = "";
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill("SIGTERM"), 110_000);
    child.on("error", reject);
    child.on("close", code => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error(`실험 프로세스 종료 (${code ?? "signal"})`);
        resolveResult(resultSchema.parse(JSON.parse(stdout)));
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl).hostname)) throw new Error("이 배치는 로컬 평가 DB에서만 실행할 수 있습니다.");
  const selected = process.argv[2] ?? "S08-01";
  const repeats = Number(process.argv[3] ?? "1");
  const compact = process.argv[4] === "compact";
  const audit = process.argv[4] === "condition-audit";
  const timing = process.argv[4] === "timing" || compact || audit;
  if (process.argv[4] && !timing) throw new Error("실험 모드가 올바르지 않습니다.");
  if (!(selected === "all" || cases.some(id => id === selected)) || !Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error("사용법: 사례 ID 또는 all, 반복 횟수 1~3");
  let state = await readState();
  if (selected === "all" || selected === "QX-01") {
    const existing = state.datasets.find(d => d.id === contractFixture.id && d.version === contractFixture.version);
    if (!existing) {
      await mutateState({type:"import_dataset",data:contractFixture});
      state = await mutateState({type:"lock_dataset",id:contractFixture.id,version:contractFixture.version});
    } else if (!existing.locked || existing.contentHash !== contentHash(contractFixture)) {
      throw new Error("추가 합성 사례의 고정 버전이 일치하지 않습니다.");
    }
  }
  if (selected === "all" || guardCases.some(id => id === selected)) {
    const existing = state.datasets.find(d => d.id === guardFixture.id && d.version === guardFixture.version);
    if (!existing) {
      await mutateState({type:"import_dataset",data:guardFixture});
      state = await mutateState({type:"lock_dataset",id:guardFixture.id,version:guardFixture.version});
    } else if (!existing.locked || existing.contentHash !== contentHash(guardFixture)) {
      throw new Error("회의 보정 사례의 고정 버전이 일치하지 않습니다.");
    }
  }
  const env = await modelEnv();
  await mkdir(pendingDir,{recursive:true,mode:0o700});
  for (const file of (await readdir(pendingDir)).filter(name => name.endsWith(".json"))) {
    const path = resolve(pendingDir, file);
    const pending = z.object({state:z.literal("pending"),run:RunSchema}).safeParse(JSON.parse(await readFile(path,"utf8")));
    if (!pending.success) throw new Error(`미완료 실행 기록을 확인하세요: ${file}`);
    const current = await readState();
    const existing = current.runs.find(run => run.id === pending.data.run.id);
    if (existing && JSON.stringify(RunSchema.parse(existing)) !== JSON.stringify(pending.data.run)) throw new Error(`실험 ID 내용 충돌: ${file}`);
    if (!existing) await mutateState({type:"import_run",data:pending.data.run});
    await unlink(path);
  }
  for (const caseId of (selected === "all" ? cases : [selected])) {
    const dataset = state.datasets.find(d => caseId === "QX-01" ? d.id === contractFixture.id && d.version === contractFixture.version && d.locked : guardCases.some(id => id === caseId) ? d.id === guardFixture.id && d.version === guardFixture.version && d.locked : d.id === "knot-workspace-458" && d.version === "1.30" && d.locked);
    if (!dataset?.corpusHash) throw new Error("잠긴 평가셋과 문서 버전이 필요합니다.");
    const item = dataset.cases.find(entry => entry.id === caseId);
    if (!item) throw new Error(`사례를 찾지 못했습니다: ${caseId}`);
    const input = {question:item.question,history:item.history,receivedAt:item.evaluationTime ?? "2026-10-29T03:00:00.000Z",timezone:"Asia/Seoul"};
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const variants = timing ? [{client:"http",mode:"schema"}] as const : [{client:"http",mode:"prompt"},{client:"spring",mode:"prompt"},{client:"http",mode:"schema"},{client:"spring",mode:"schema"}] as const;
    for (let repetition=0; repetition<repeats; repetition++) {
      for (let index=0; index<variants.length; index++) {
        const variant = variants[(index + repetition) % variants.length];
        if (!variant) throw new Error("실험 조합을 찾을 수 없습니다.");
        await readState(); // Stop before each call when storage is unavailable.
        const id = `question-${randomUUID()}`, startedAt = new Date().toISOString();
        const pendingPath = resolve(pendingDir, `${id}.json`);
        await writeFile(pendingPath,JSON.stringify({id,caseId,variant,startedAt,state:"started"}),{mode:0o600,flag:"wx"});
        let measured: z.infer<typeof resultSchema>;
        try { measured = await runModel({...variant,input,measureStream:timing,compact},env); }
        catch (error) { measured = { ...variant,model:env.LLM_MODEL ?? "unknown",promptVersion,status:"failed",calls:null,durationMs:0,error:error instanceof Error ? error.name : "unknown" }; }
        if (measured.promptVersion !== promptVersion) throw new Error("실험기 버전이 일치하지 않습니다. pending 기록을 확인하세요.");
        if (measured.status === "completed" && !measured.serverGuard) throw new Error("서버 점검 결과가 없습니다. 실험기 빌드와 pending 기록을 확인하세요.");
        const output = measured.output === undefined ? "" : JSON.stringify(measured.output,null,2);
        const duration = measured.durationMs || null;
        const run = RunSchema.parse({id,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,
          name:`${caseId} · 질문 이해 ${variant.client} ${variant.mode} · ${startedAt}`,
          strategy:`질문 이해 ${variant.client} · ${variant.mode} · ${audit ? "조건 대조 실험" : compact ? "축약 JSON" : timing ? "스트리밍 시간 측정" : "회의 보정 v1"} · 반복 ${repetition + 1} · 호출 ${measured.calls ?? "미확인"}`,
          environment:"direct_model",model:measured.model,revision:`${promptVersion}-${audit ? "condition-audit-v1" : compact ? "compact-v1" : timing ? "stream-timing-v1" : "meeting-guard-v1"}`,startedAt,status:measured.status,
          experiment:{kind:"question_understanding",variant:variant.client === "http" ? "A" : "B",inputHash:hash,promptVersion:audit ? `${promptVersion}-condition-audit-v1` : compact ? `${promptVersion}-compact-v1` : timing ? `${promptVersion}-stream-timing-v1` : promptVersion,stages:[{id:"question_understanding",label:"질문 이해",status:measured.status,durationMs:duration,result:output || measured.error || "결과 없음",inputTokens:measured.usage?.prompt_tokens ?? null,outputTokens:measured.usage?.completion_tokens ?? null},...(measured.compactOutput !== undefined ? [{id:"compact_output",label:"축약 원본 JSON",status:"completed" as const,durationMs:null,result:JSON.stringify(measured.compactOutput,null,2),inputTokens:null,outputTokens:null}] : []),...(measured.timings ? [
            {id:"client_preparation",label:"클라이언트·요청 준비",status:"completed" as const,durationMs:measured.timings.clientPreparationMs,result:"Java 프로세스 기동 이후 요청과 클라이언트 준비",inputTokens:null,outputTokens:null},
            {id:"response_headers",label:"응답 헤더까지",status:"completed" as const,durationMs:measured.timings.responseHeadersMs,result:"요청 전송부터 HTTP 헤더까지. 연결·네트워크·서버 대기를 분리하지 않음. 첫 내용까지 시간에 포함됨.",inputTokens:null,outputTokens:null},
            {id:"first_content",label:"첫 내용까지",status:"completed" as const,durationMs:measured.timings.firstContentMs,result:"요청 전송부터 첫 비어 있지 않은 콘텐츠 델타까지. 서버 TTFT 단독 측정 아님.",inputTokens:null,outputTokens:null},
            {id:"generation_after_first",label:"첫 내용 이후 스트림 종료까지",status:"completed" as const,durationMs:measured.timings.generationAfterFirstMs,result:"첫 내용 수신 후 종료 이벤트까지. 네트워크·수신 처리 포함.",inputTokens:null,outputTokens:null},
            {id:"parse",label:"JSON 파싱·검사",status:"completed" as const,durationMs:measured.timings.parseMs,result:"스트림 종료 후 전체 JSON 파싱·계약 검사",inputTokens:null,outputTokens:null},
          ] : []),{id:"server_guard",label:"서버 조건 점검",status:measured.serverGuard ? "completed" : "not_run",durationMs:measured.serverGuard?.durationMs ?? null,result:measured.serverGuard ? JSON.stringify({modelOutput:measured.serverGuard.modelOutput,corrections:measured.serverGuard.corrections},null,2) : "모델 결과 없음",inputTokens:null,outputTokens:null}]},
          results:[{caseId,status:measured.status,candidates:[],answer:output,evidenceIds:[],latencyMs:duration,error:measured.status === "failed" ? measured.error ?? "실험 실패" : null}]});
        await writeFile(pendingPath,JSON.stringify({run,state:"pending",calls:measured.calls},null,2),{mode:0o600});
        await mutateState({type:"import_run",data:run});
        await unlink(pendingPath);
        console.log(JSON.stringify({id,caseId,...variant,status:measured.status,durationMs:duration,calls:measured.calls}));
      }
    }
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : "실험 실행 오류"); process.exit(1); });
