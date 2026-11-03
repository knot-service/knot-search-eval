import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { mutateState, readState } from "../lib/db";
import { RunSchema } from "../lib/schema";

const cases = ["S08-01", "S09-01", "S17-01", "S23-01", "S35-01", "S36-01", "S69-01", "S73-01", "S74-01"] as const;
const resultSchema = z.object({client:z.enum(["http","spring"]),mode:z.enum(["prompt","schema"]),model:z.string(),promptVersion:z.string(),status:z.enum(["completed","failed"]),calls:z.number().nullable(),durationMs:z.number().nonnegative(),output:z.unknown().optional(),error:z.string().optional(),usage:z.object({prompt_tokens:z.number().nullable().optional(),completion_tokens:z.number().nullable().optional()}).optional()});
const pendingDir = resolve(process.cwd(), "../knot/backend/resume/search-improvement/question-understanding-runs");
const executable = resolve(process.cwd(), "../knot-search-lab/experiments/question-understanding/build/install/question-understanding-experiment/bin/question-understanding-experiment");
const envPath = resolve(process.cwd(), "../knot-search-lab/.env.search-local");
const promptVersion = "question-understanding-v4";

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
  if (!(selected === "all" || cases.some(id => id === selected)) || !Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error("사용법: 사례 ID 또는 all, 반복 횟수 1~3");
  const state = await readState();
  const dataset = state.datasets.find(d => d.id === "knot-workspace-458" && d.version === "1.30" && d.locked);
  if (!dataset?.corpusHash) throw new Error("잠긴 v1.30 평가셋과 문서 버전이 필요합니다.");
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
    const item = dataset.cases.find(entry => entry.id === caseId);
    if (!item) throw new Error(`사례를 찾지 못했습니다: ${caseId}`);
    const input = {question:item.question,history:item.history,receivedAt:item.evaluationTime ?? "2026-10-29T03:00:00.000Z",timezone:"Asia/Seoul"};
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const variants = [{client:"http",mode:"prompt"},{client:"spring",mode:"prompt"},{client:"http",mode:"schema"},{client:"spring",mode:"schema"}] as const;
    for (let repetition=0; repetition<repeats; repetition++) {
      for (let index=0; index<variants.length; index++) {
        const variant = variants[(index + repetition) % variants.length];
        if (!variant) throw new Error("실험 조합을 찾을 수 없습니다.");
        await readState(); // Stop before each call when storage is unavailable.
        const id = `question-${randomUUID()}`, startedAt = new Date().toISOString();
        const pendingPath = resolve(pendingDir, `${id}.json`);
        await writeFile(pendingPath,JSON.stringify({id,caseId,variant,startedAt,state:"started"}),{mode:0o600,flag:"wx"});
        let measured: z.infer<typeof resultSchema>;
        try { measured = await runModel({...variant,input},env); }
        catch (error) { measured = { ...variant,model:env.LLM_MODEL ?? "unknown",promptVersion,status:"failed",calls:null,durationMs:0,error:error instanceof Error ? error.name : "unknown" }; }
        if (measured.promptVersion !== promptVersion) throw new Error("실험기 버전이 일치하지 않습니다. pending 기록을 확인하세요.");
        const output = measured.output === undefined ? "" : JSON.stringify(measured.output,null,2);
        const duration = measured.durationMs || null;
        const run = RunSchema.parse({id,datasetId:dataset.id,datasetVersion:dataset.version,corpusHash:dataset.corpusHash,
          name:`${caseId} · 질문 이해 ${variant.client} ${variant.mode} · ${startedAt}`,
          strategy:`질문 이해 ${variant.client} · ${variant.mode} · 반복 ${repetition + 1} · 호출 ${measured.calls ?? "미확인"}`,
          environment:"direct_model",model:measured.model,revision:promptVersion,startedAt,status:measured.status,
          experiment:{kind:"question_understanding",variant:variant.client === "http" ? "A" : "B",inputHash:hash,promptVersion,stages:[{id:"question_understanding",label:"질문 이해",status:measured.status,durationMs:duration,result:output || measured.error || "결과 없음",inputTokens:measured.usage?.prompt_tokens ?? null,outputTokens:measured.usage?.completion_tokens ?? null}]},
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
