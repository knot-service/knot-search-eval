import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { z } from "zod";
import { DatasetSchema, ExperimentStageSchema, RunSchema, type DataState, type EvalCase } from "../lib/schema";
import { applyAction, contentHash } from "../lib/state";

const evalEnvPath = resolve(process.cwd(), ".env.local");
const labRoot = resolve(process.cwd(), "../knot-search-lab/experiments");
const outputFiles = {
  A: resolve(labRoot, "stage3-period-context-worker-2026-11-05-run-03-pre-attempt-03.json"),
  B: resolve(labRoot, "stage3-period-context-worker-2026-11-05-run-03-post-attempt-05.json"),
} as const;
const promptVersion = "stage3-period-followup-v1";
const datasetId = "stage3-period-context-worker";
const datasetVersion = "1.1";

type TraceEntry = Record<string, unknown> & { stage?: string; elapsedMs?: number; error?: string };
type ExperimentStage = z.infer<typeof ExperimentStageSchema>;
type Scenario = {
  scenarioId: string;
  previousQuestion: string;
  currentQuestion: string;
  answerStatus: string;
  failureCode: string | null;
  answer: string;
  workerElapsedMs: number;
  followupAcceptedAt: string;
  sqlSearchCount: number;
  storedPreviousContext: Record<string, unknown>;
  trace: TraceEntry[];
};
type WorkerArtifact = {
  startedAt: string;
  finishedAt: string;
  mode: "pre-fix" | "post-fix";
  database: string;
  schema: string;
  model: string;
  llmBaseUrl: string;
  llmUpstreamBaseUrl: string;
  maxResponseBytes: number;
  sourceSha256: string;
  testSha256: string;
  loadedExperimentClassSha256: string;
  loadedTestClassSha256: string;
  fixture: { workspaceId: number; memberId: number; documentIds: number[]; workspace458Used: boolean; acceptedAt?: string };
  scenarios: Scenario[];
};

const documentFixtures = [
  {
    id: "document-2",
    title: "결제 회의 담당자",
    content: "결제 회의에서 담당자는 민지입니다.",
    summary: "결제 회의 담당자는 민지입니다.",
    workspaceId: "2",
    accessible: true,
    meetingStartedAt: "2026-10-27T12:00:00Z",
    createdAt: "2026-10-27T12:00:00Z",
  },
  {
    id: "document-3",
    title: "결제 회의 이번 주 담당자",
    content: "이번 주 결제 회의 담당자는 지훈입니다.",
    summary: "이번 주 결제 회의 담당자는 지훈입니다.",
    workspaceId: "2",
    accessible: true,
    meetingStartedAt: "2026-11-03T12:00:00Z",
    createdAt: "2026-11-03T12:00:00Z",
  },
  {
    id: "document-4",
    title: "로그인 회의 담당자",
    content: "로그인 회의 담당자는 서연입니다.",
    summary: "로그인 회의 담당자는 서연입니다.",
    workspaceId: "2",
    accessible: true,
    meetingStartedAt: "2026-11-03T12:00:00Z",
    createdAt: "2026-11-03T12:00:00Z",
  },
  {
    id: "document-5",
    title: "보안 회의 담당자",
    content: "보안 회의 담당자는 도윤입니다.",
    summary: "보안 회의 담당자는 도윤입니다.",
    workspaceId: "2",
    accessible: true,
    meetingStartedAt: "2026-10-27T13:00:00Z",
    createdAt: "2026-10-27T13:00:00Z",
  },
] as const;

const caseSpecs = [
  {
    scenarioId: "period-retained",
    id: "S3-R03-01",
    previousQuestion: "저번 주 결제 회의 담당자는?",
    previousAnswer: "결제 회의를 확인했습니다.",
    question: "그 회의 담당자는?",
    expectedType: "answer" as const,
    expectedEvidenceIds: ["document-2"],
    expectedBehavior: "이전 사용자 질문의 저번 주와 결제 회의 맥락을 이어받아 해당 주의 저장 문서를 확인하고 담당자를 답한다.",
  },
  {
    scenarioId: "current-week-period-retained-before-week-end",
    id: "S3-R03-02",
    previousQuestion: "이번 주 결제 회의에서 정한 일정은?",
    previousAnswer: "이번 주 결제 회의를 확인했습니다.",
    question: "그 회의 담당자는?",
    expectedType: "answer" as const,
    expectedEvidenceIds: ["document-3"],
    expectedBehavior: "이번 주가 끝나기 전에 후속 질문을 해도 이전 사용자 질문에서 정한 이번 주 기간을 유지한다.",
  },
  {
    scenarioId: "current-period-overrides-history",
    id: "S3-R03-03",
    previousQuestion: "저번 주 결제 회의 담당자는?",
    previousAnswer: "결제 회의를 확인했습니다.",
    question: "이번 주 결제 회의 담당자는?",
    expectedType: "answer" as const,
    expectedEvidenceIds: ["document-3"],
    expectedBehavior: "현재 질문에 명시된 이번 주가 이전 대화의 저번 주보다 우선하고 현재 주 결제 문서를 선택한다.",
  },
  {
    scenarioId: "new-topic-and-explicit-current-period-win",
    id: "S3-R03-04",
    previousQuestion: "저번 주 결제 회의 담당자는?",
    previousAnswer: "결제 회의를 확인했습니다.",
    question: "이번 주 로그인 회의 담당자는?",
    expectedType: "answer" as const,
    expectedEvidenceIds: ["document-4"],
    expectedBehavior: "현재 질문의 로그인 주제와 이번 주를 사용하고 이전 결제 주제·기간을 잘못 적용하지 않는다.",
  },
  {
    scenarioId: "ambiguous-meeting-reference-fails-closed",
    id: "S3-R03-05",
    previousQuestion: "저번 주 결제 회의와 보안 회의 담당자는?",
    previousAnswer: "결제 회의와 보안 회의가 모두 언급됐습니다.",
    question: "그 회의 담당자는?",
    expectedType: "clarify" as const,
    expectedEvidenceIds: [],
    expectedBehavior: "이전 대화에 결제 회의와 보안 회의가 함께 있어 지시 대상이 모호하면 임의 선택하지 않고 확인 질문을 반환한다.",
  },
] as const;

function readArtifact(value: unknown): WorkerArtifact {
  if (!value || typeof value !== "object") throw new Error("Worker 결과 JSON 형식 오류");
  const artifact = value as WorkerArtifact;
  if (artifact.database !== "knot_lab" || artifact.schema !== "stage3_period_link_20261105") {
    throw new Error("승인된 격리 DB/schema가 아닌 결과는 가져오지 않습니다.");
  }
  if (artifact.model !== "qwen3.8-27b" || artifact.maxResponseBytes !== 2_097_152) {
    throw new Error("Qwen 모델 또는 응답 상한이 고정 조건과 다릅니다.");
  }
  const documentIds = [...artifact.fixture.documentIds].sort((a, b) => a - b);
  if (artifact.fixture.workspace458Used || artifact.fixture.workspaceId !== 2 || artifact.fixture.memberId !== 2 ||
      documentIds.join(",") !== "2,3,4,5" || artifact.scenarios.length !== caseSpecs.length) {
    throw new Error("실험 fixture 범위가 다릅니다.");
  }
  if (artifact.llmBaseUrl !== "http://127.0.0.1:54271" || artifact.llmUpstreamBaseUrl !== "http://100.110.23.115:1234") {
    throw new Error("실험 모델 경로가 승인된 loopback relay → Tailscale upstream과 다릅니다.");
  }
  for (const [index, spec] of caseSpecs.entries()) {
    const scenario = artifact.scenarios[index];
    if (scenario.scenarioId !== spec.scenarioId || scenario.previousQuestion !== spec.previousQuestion || scenario.currentQuestion !== spec.question) {
      throw new Error(`실험 입력 순서 또는 대화가 예상 사례와 다릅니다: ${spec.id}`);
    }
  }
  return artifact;
}

function traceEntries(scenario: Scenario, stage: string): TraceEntry[] {
  return scenario.trace.filter((entry) => entry.stage === stage);
}

function duration(entries: TraceEntry[]): number | null {
  if (entries.length === 0) return null;
  const values = entries.map((entry) => entry.elapsedMs).filter((value): value is number => typeof value === "number");
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function status(entries: TraceEntry[]): "completed" | "failed" | "not_run" {
  if (entries.length === 0) return "not_run";
  return entries.some((entry) => Boolean(entry.error)) ? "failed" : "completed";
}

function compact(entries: TraceEntry[], fields: string[]): Record<string, unknown>[] {
  return entries.map((entry) => Object.fromEntries(fields.filter((field) => field in entry).map((field) => [field, entry[field]])));
}

function makeCase(spec: (typeof caseSpecs)[number], scenario: Scenario, corpusHash: string): EvalCase {
  if (scenario.scenarioId !== spec.scenarioId) throw new Error(`사례 입력 불일치: ${spec.id}`);
  return {
    id: spec.id,
    scenario: "이전 사용자 기간·대상 후속 검색",
    category: "질문 접수·맥락 → 검색·문서 확인",
    question: spec.question,
    history: [
      { role: "user", content: spec.previousQuestion },
      { role: "assistant", content: spec.previousAnswer },
    ],
    documents: documentFixtures.map((document) => ({ ...document })),
    expectedEvidenceIds: [...spec.expectedEvidenceIds],
    expectedType: spec.expectedType,
    expectedBehavior: spec.expectedBehavior,
    setup: `실제 SearchAnswerWorker · Qwen ${scenario.trace.some((entry) => entry.stage === "qwen-intent") ? "호출" : "결과"}. knot_lab.${"stage3_period_link_20261105"}의 합성 문서 4건만 사용. assistant 확인 문장은 합성 맥락이며 기간 조건의 근거는 이전 사용자 발화다. fixture corpus ${corpusHash}.`,
    evaluationTime: scenario.followupAcceptedAt,
  };
}

function stagesFor(artifact: WorkerArtifact, scenario: Scenario): ExperimentStage[] {
  const intent = traceEntries(scenario, "intent-classification");
  const plan = traceEntries(scenario, "question-understanding-plan");
  const context = traceEntries(scenario, "stored-prior-context");
  const searches = traceEntries(scenario, "database-search");
  const verification = traceEntries(scenario, "document-verification");
  const generation = traceEntries(scenario, "qwen-answer-generation");
  const modelIntent = traceEntries(scenario, "qwen-intent");
  const understandingModel = traceEntries(scenario, "qwen-question-understanding-or-verification");
  const result = (entries: TraceEntry[], fields: string[]) => JSON.stringify(compact(entries, fields), null, 2);
  return [
    {
      id: "context_memory",
      label: "이전 대화 맥락 조회",
      status: status(context),
      durationMs: duration(context),
      result: result(context, ["request", "context", "elapsedMs"]),
      inputTokens: null,
      outputTokens: null,
    },
    {
      id: "intent_classification",
      label: "의도 분류",
      status: status(intent),
      durationMs: duration(intent),
      result: JSON.stringify({ application: compact(intent, ["intent", "elapsedMs"]), qwenCalls: compact(modelIntent, ["output", "error", "elapsedMs"]), qwenCallCount: modelIntent.length }, null, 2),
      inputTokens: null,
      outputTokens: null,
    },
    {
      id: "question_understanding",
      label: "질문 이해·후속 조건 계획",
      status: status(plan),
      durationMs: duration(plan),
      result: JSON.stringify({ plan: compact(plan, ["question", "requests", "error", "elapsedMs"]), modelCalls: compact(understandingModel.slice(0, plan.length), ["output", "error", "elapsedMs"]), qwenCallCount: Math.min(understandingModel.length, plan.length), sourceSha256: artifact.sourceSha256, loadedClassSha256: artifact.loadedExperimentClassSha256 }, null, 2),
      inputTokens: null,
      outputTokens: null,
    },
    {
      id: "document_retrieval",
      label: "조건을 적용한 SQL 검색",
      status: status(searches),
      durationMs: duration(searches),
      result: result(searches, ["query", "recordedFrom", "recordedBefore", "candidateDocuments", "error", "elapsedMs"]),
      inputTokens: null,
      outputTokens: null,
    },
    {
      id: "document_verification",
      label: "검색 문서 조건 확인",
      status: status(verification),
      durationMs: duration(verification),
      result: JSON.stringify({ checks: compact(verification, ["target", "find", "conditions", "candidateDocuments", "acceptedDocuments", "error", "elapsedMs"]), qwenCallCount: Math.max(0, understandingModel.length - plan.length), qwenCalls: compact(understandingModel.slice(plan.length), ["output", "error", "elapsedMs"]) }, null, 2),
      inputTokens: null,
      outputTokens: null,
    },
    {
      id: "answer_generation",
      label: "답변 생성·최종 Worker 결과",
      status: generation.length === 0 ? "not_run" : status(generation),
      durationMs: duration(generation),
      result: JSON.stringify({ generation: compact(generation, ["error", "elapsedMs"]), qwenCallCount: generation.length, workerAnswerStatus: scenario.answerStatus, workerFailureCode: scenario.failureCode, visibleAnswer: scenario.answer }, null, 2),
      inputTokens: null,
      outputTokens: null,
    },
  ];
}

function stagesForVariant(artifact: WorkerArtifact, scenarioById: Map<string, Scenario>) {
  return caseSpecs.map((spec) => {
    const scenario = scenarioById.get(spec.scenarioId);
    if (!scenario) throw new Error(`Worker 결과에서 사례 누락: ${spec.id}`);
    return { caseId: spec.id, scenario, stages: stagesFor(artifact, scenario) };
  });
}

function reviewRows(runId: string, variant: "A" | "B", rows: ReturnType<typeof stagesForVariant>) {
  const reviews: Array<{ datasetId: string; datasetVersion: string; caseId: string; runId: string; stageId: string; outcome: "correct" | "incorrect"; notes: string; reviewer: string }> = [];
  for (const { caseId, scenario, stages } of rows) {
    const pre = variant === "A";
    reviews.push({
      datasetId,
      datasetVersion,
      caseId,
      runId,
      stageId: "question_understanding",
      outcome: "correct",
      notes: `요청 대상·기간 계획을 원 대화와 대조했다. ${scenario.scenarioId === "ambiguous-meeting-reference-fails-closed" ? "복수 회의 지시어를 임의 선택하지 않고 CLARIFY로 분기했다." : "이전 또는 현재 발화의 대상·기간 출처를 구분했다."} 이 판정은 검색·최종 답변의 성공을 뜻하지 않는다.`,
      reviewer: "AI 검수 (Codex)",
    });
    const retrieval = stages.find((stage) => stage.id === "document_retrieval");
    if (retrieval?.status === "completed" || scenario.sqlSearchCount === 0) {
      let note: string;
      let outcome: "correct" | "incorrect";
      if (scenario.scenarioId === "ambiguous-meeting-reference-fails-closed") {
        note = "두 회의가 가능한 맥락에서 SQL을 실행하지 않고 확인 분기로 보냈다. 다만 Worker가 최종 확인 답변을 내지 못한 것은 답변 단계의 실패로 별도 기록한다.";
        outcome = "correct";
      } else if (pre && scenario.sqlSearchCount === 0) {
        note = "이전 기간은 질문 계획에 남았지만 SQL 검색이 실행되지 않았다. 후속 질문의 조건이 검색까지 연결되지 못했다.";
        outcome = "incorrect";
      } else {
        const accepted = stages.find((stage) => stage.id === "document_verification")?.result ?? "";
        note = `실제 검색 범위와 확인 결과를 고정 문서의 시점·대상과 대조했다. ${accepted ? "승인 문서는 별도 문서 확인 단계에 기록되어 있다." : "검색 여부만 관측했고 문서 검증 결과는 없는 경우다."}`;
        outcome = "correct";
      }
      reviews.push({ datasetId, datasetVersion, caseId, runId, stageId: "document_retrieval", outcome, notes: note, reviewer: "AI 검수 (Codex)" });
    }
    const verification = stages.find((stage) => stage.id === "document_verification");
    if (verification?.status === "completed") {
      reviews.push({
        datasetId,
        datasetVersion,
        caseId,
        runId,
        stageId: "document_verification",
        outcome: "correct",
        notes: "검증기가 선택한 문서의 회의 주제와 기록 시점이 요청 조건과 일치한다. 이것은 답변 생성 성공이나 최종 답변 근거 공개를 뜻하지 않는다.",
        reviewer: "AI 검수 (Codex)",
      });
    }
    const gen = scenario.trace.find((entry) => entry.stage === "qwen-answer-generation");
    const failure = gen?.error ?? scenario.failureCode;
    reviews.push({
      datasetId,
      datasetVersion,
      caseId,
      runId,
      stageId: "answer_generation",
      outcome: "incorrect",
      notes: `${pre ? "개선 전" : "개선 후"} Worker 최종 응답은 기대 동작을 충족하지 못해 부적합이다. 실행 상태=${scenario.answerStatus}; ${failure ? `실패 코드=${String(failure).slice(0, 500)}` : `실제 안내 응답=${scenario.answer.slice(0, 500)}`}. 문서 검색·검증이 통과한 사례도 답변 실패를 정답으로 취급하지 않는다.`,
      reviewer: "AI 검수 (Codex)",
    });
  }
  return reviews;
}

async function loadDatabaseUrl(): Promise<string> {
  if (!process.env.DATABASE_URL) {
    const envText = await readFile(evalEnvPath, "utf8");
    const line = envText.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
    if (!line) throw new Error("로컬 .env.local에 DATABASE_URL이 없습니다.");
    process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== "127.0.0.1" || url.port !== "55440" || url.pathname !== "/knot_eval") {
    throw new Error("실험 결과는 로컬 knot_eval(127.0.0.1:55440)에만 기록할 수 있습니다.");
  }
  return process.env.DATABASE_URL;
}

async function main() {
  const databaseUrl = await loadDatabaseUrl();
  const artifacts = {
    A: readArtifact(JSON.parse(await readFile(outputFiles.A, "utf8"))),
    B: readArtifact(JSON.parse(await readFile(outputFiles.B, "utf8"))),
  };
  if (artifacts.A.mode !== "pre-fix" || artifacts.B.mode !== "post-fix") throw new Error("A/B 실행 모드가 다릅니다.");
  if (artifacts.A.database !== artifacts.B.database || artifacts.A.schema !== artifacts.B.schema ||
      artifacts.A.model !== artifacts.B.model || artifacts.A.maxResponseBytes !== artifacts.B.maxResponseBytes ||
      artifacts.A.llmBaseUrl !== artifacts.B.llmBaseUrl || artifacts.A.llmUpstreamBaseUrl !== artifacts.B.llmUpstreamBaseUrl ||
      artifacts.A.fixture.workspaceId !== artifacts.B.fixture.workspaceId || artifacts.A.fixture.memberId !== artifacts.B.fixture.memberId ||
      artifacts.A.fixture.documentIds.join(",") !== artifacts.B.fixture.documentIds.join(",") ||
      artifacts.A.fixture.acceptedAt !== artifacts.B.fixture.acceptedAt) {
    throw new Error("pre/post 실행 환경 또는 고정 fixture가 다릅니다.");
  }
  if (artifacts.A.testSha256 !== artifacts.B.testSha256 || artifacts.A.loadedTestClassSha256 !== artifacts.B.loadedTestClassSha256) {
    throw new Error("pre/post 테스트 원문 또는 런타임 테스트 클래스가 다릅니다.");
  }
  const corpusHash = createHash("sha256").update(JSON.stringify(documentFixtures)).digest("hex");
  const cases = caseSpecs.map((spec) => makeCase(spec, artifacts.A.scenarios.find((scenario) => scenario.scenarioId === spec.scenarioId)!, corpusHash));
  const dataset = DatasetSchema.parse({
    id: datasetId,
    name: "실제 Worker · 이전 기간 상속과 검색",
    version: datasetVersion,
    source: "synthetic",
    corpusHash,
    cases,
  });
  const inputHash = createHash("sha256").update(JSON.stringify({ dataset: contentHash(dataset), sourceTestSha256: artifacts.A.testSha256 })).digest("hex");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let importedRuns = 0;
  let importedReviews = 0;
  try {
    await client.query("BEGIN");
    const record = await client.query("SELECT data FROM eval_state WHERE id=1 FOR UPDATE");
    if (record.rowCount !== 1) throw new Error("로컬 평가 상태를 찾을 수 없습니다.");
    let state = record.rows[0].data as DataState;
    const existingDataset = state.datasets.find((entry) => entry.id === dataset.id && entry.version === dataset.version);
    if (!existingDataset) {
      state = applyAction(state, { type: "import_dataset", data: dataset });
      state = applyAction(state, { type: "lock_dataset", id: dataset.id, version: dataset.version });
    } else if (!existingDataset.locked || existingDataset.contentHash !== contentHash(dataset)) {
      throw new Error("실험셋 1.1이 이미 다른 내용으로 잠겨 있습니다.");
    }
    for (const variant of ["A", "B"] as const) {
      const artifact = artifacts[variant];
      const scenarioById = new Map(artifact.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
      const rows = stagesForVariant(artifact, scenarioById);
      const runId = variant === "A" ? "stage3-period-run03-pre" : "stage3-period-run03-post";
      const revision = variant === "A" ? "stage3-period-run03-pre-fix-v1" : "stage3-period-run03-post-fix-v1";
      const results = rows.map(({ caseId, scenario }) => {
        const searches = traceEntries(scenario, "database-search");
        const candidates = [...new Set(searches.flatMap((entry) => {
          const docs = entry.candidateDocuments;
          return Array.isArray(docs) ? docs.map((doc) => `document-${(doc as Record<string, unknown>).documentId}`) : [];
        }))];
        return {
          caseId,
          status: scenario.answerStatus === "COMPLETED" ? "completed" as const : "failed" as const,
          candidates,
          answer: scenario.answer,
          // A verified retrieval is not an answer citation. Failed or guidance answers publish no evidence IDs.
          evidenceIds: [],
          latencyMs: scenario.workerElapsedMs,
          error: scenario.failureCode,
          retrievalObserved: scenario.sqlSearchCount > 0 ? "performed" as const : "skipped" as const,
        };
      });
      const run = RunSchema.parse({
        id: runId,
        datasetId,
        datasetVersion,
        corpusHash,
        name: variant === "A" ? "실제 Worker · 기간 상속 개선 전" : "실제 Worker · 기간 상속 개선 후",
        strategy: `SearchAnswerWorker · Qwen · knot_lab stage3 · ${artifact.mode} · relay→Tailscale`,
        environment: "isolated_spring",
        model: artifact.model,
        revision,
        startedAt: artifact.startedAt,
        status: "completed",
        experiment: {
          kind: "search_retrieval",
          variant,
          inputHash,
          promptVersion,
          stages: rows.flatMap(({ stages }) => stages),
        },
        results,
      });
      const existingRun = state.runs.find((entry) => entry.id === runId);
      if (!existingRun) {
        state = applyAction(state, { type: "import_run", data: run });
        importedRuns++;
      } else if (JSON.stringify(existingRun) !== JSON.stringify(run)) {
        throw new Error(`기존 실험 ${runId}의 기록이 산출물과 다릅니다.`);
      }
      const reviews = reviewRows(runId, variant, rows);
      for (const review of reviews) {
        const exists = state.reviews.some((entry) => entry.runId === runId && entry.caseId === review.caseId && entry.stageId === review.stageId && entry.reviewer === review.reviewer);
        if (!exists) {
          state.reviews.push({ ...review, id: randomUUID(), createdAt: new Date().toISOString() });
          importedReviews++;
        }
      }
    }
    if (process.argv.includes("--dry-run")) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ dryRun: true, database: "local knot_eval", dataset: `${datasetId}@${datasetVersion}`, willLockDataset: !existingDataset, plannedRuns: ["stage3-period-run03-pre", "stage3-period-run03-post"], plannedAiReviews: importedReviews, caseCount: caseSpecs.length, stageCountPerRun: 30, inputHash }));
      return;
    }
    await client.query("UPDATE eval_state SET data=$1::jsonb WHERE id=1", [JSON.stringify(state)]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ database: "local knot_eval", dataset: `${datasetId}@${datasetVersion}`, locked: true, importedRuns, importedAiReviews: importedReviews, runIds: ["stage3-period-run03-pre", "stage3-period-run03-post"], caseCount: caseSpecs.length, inputHash }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "실험실 등록 실패");
  process.exit(1);
});
