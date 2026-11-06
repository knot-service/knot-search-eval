import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { RunSchema, type DataState } from "../lib/schema";
import { applyAction, contentHash } from "../lib/state";

const labRoot = resolve(process.cwd(), "../knot-search-lab/experiments");
const attempts = {
  A: resolve(labRoot, "stage3-period-context-worker-2026-11-06-run-04-post-attempt-03.json"),
  B: resolve(labRoot, "stage3-period-context-worker-2026-11-06-run-04-post-attempt-04.json"),
} as const;
const datasetId = "stage3-period-context-worker";
const datasetVersion = "1.1";
const caseIds = ["S3-R03-01", "S3-R03-02", "S3-R03-03", "S3-R03-04", "S3-R03-05"] as const;
const scenarioIds = [
  "period-retained",
  "current-week-period-retained-before-week-end",
  "current-period-overrides-history",
  "new-topic-and-explicit-current-period-win",
  "ambiguous-meeting-reference-fails-closed",
] as const;
const runIds = {
  A: "stage3-period-run04-prompt-before",
  B: "stage3-period-run04-prompt-after",
} as const;
const promptVersion = "stage3-run04-answer-scope-dedup-ab-v1";
const expectedCorpusHash = "7990a121263098bdb9dca3ec93010c03ec9a785e48f55815833f8fc7af555e9e";
const aiReviewer = "AI 검수 (Codex)";

type TraceEntry = Record<string, unknown> & { stage?: string; elapsedMs?: number; error?: string };
type Scenario = {
  scenarioId: string;
  answerStatus: string;
  failureCode: string | null;
  answer: string;
  workerElapsedMs: number;
  sqlSearchCount: number;
  trace: TraceEntry[];
};
type Artifact = {
  startedAt: string;
  finishedAt: string;
  mode: string;
  database: string;
  schema: string;
  model: string;
  llmBaseUrl: string;
  llmUpstreamBaseUrl: string;
  maxResponseBytes: number;
  fixture: { workspaceId: number; memberId: number; documentIds: number[]; workspace458Used: boolean };
  parallelQwenLoadControlled: boolean;
  scenarios: Scenario[];
};

function assertArtifact(value: unknown, label: string): Artifact {
  if (!value || typeof value !== "object") throw new Error(`${label}: 결과 JSON 형식 오류`);
  const item = value as Artifact;
  const ids = [...(item.fixture?.documentIds ?? [])].sort((a, b) => a - b).join(",");
  if (item.database !== "knot_lab" || item.schema !== "stage3_period_link_20261105" ||
      item.model !== "qwen3.8-27b" || item.maxResponseBytes !== 2_097_152 ||
      item.llmBaseUrl !== "http://127.0.0.1:54271" || item.llmUpstreamBaseUrl !== "http://100.110.23.115:1234" ||
      item.fixture.workspaceId !== 2 || item.fixture.memberId !== 2 || item.fixture.workspace458Used || ids !== "2,3,4,5" ||
      item.scenarios.length !== scenarioIds.length || item.mode !== "post-fix") {
    throw new Error(`${label}: 승인된 격리 DB·Qwen·Workspace fixture와 다릅니다.`);
  }
  if (item.scenarios.some((scenario, index) => scenario.scenarioId !== scenarioIds[index])) {
    throw new Error(`${label}: 사례 구성 또는 순서가 다릅니다.`);
  }
  return item;
}

function entries(scenario: Scenario, stage: string): TraceEntry[] {
  return scenario.trace.filter((entry) => entry.stage === stage);
}

function elapsed(items: TraceEntry[]): number | null {
  const values = items.map((item) => item.elapsedMs).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function stageStatus(items: TraceEntry[]): "completed" | "failed" | "not_run" {
  if (!items.length) return "not_run";
  return items.some((item) => Boolean(item.error)) ? "failed" : "completed";
}

function compact(items: TraceEntry[], keys: string[]): Record<string, unknown>[] {
  return items.map((item) => Object.fromEntries(keys.filter((key) => key in item).map((key) => [key, item[key]])));
}

function makeStages(scenario: Scenario) {
  const stageDefs = [
    ["context_memory", "이전 대화 맥락 조회", "stored-prior-context", ["request", "context", "elapsedMs"]],
    ["intent_classification", "의도 분류", "intent-classification", ["intent", "elapsedMs", "error"]],
    ["question_understanding", "질문 이해·후속 조건 계획", "question-understanding-plan", ["question", "requests", "elapsedMs", "error"]],
    ["document_retrieval", "조건을 적용한 SQL 검색", "database-search", ["query", "recordedFrom", "recordedBefore", "candidateDocuments", "elapsedMs", "error"]],
    ["document_verification", "검색 문서 조건 확인", "document-verification", ["target", "find", "conditions", "candidateDocuments", "acceptedDocuments", "elapsedMs", "error"]],
    ["answer_generation", "답변 생성·최종 Worker 결과", "qwen-answer-generation", ["elapsedMs", "error"]],
  ] as const;
  return stageDefs.map(([id, label, traceStage, fields]) => {
    const items = entries(scenario, traceStage);
    const notApplicable = scenario.scenarioId === "ambiguous-meeting-reference-fails-closed" &&
      ["document_retrieval", "document_verification"].includes(id);
    const status = notApplicable ? "not_run" : stageStatus(items);
    const extra = id === "answer_generation"
      ? { workerAnswerStatus: scenario.answerStatus, workerFailureCode: scenario.failureCode, finalAnswer: scenario.answer }
      : id === "question_understanding"
        ? { qwenCallCount: entries(scenario, "qwen-question-understanding-or-verification").length }
        : id === "document_verification"
          ? { qwenCallCount: entries(scenario, "qwen-question-understanding-or-verification").length }
          : id === "intent_classification"
            ? { qwenCallCount: entries(scenario, "qwen-intent").length }
            : id === "document_retrieval"
              ? { sqlSearchCount: scenario.sqlSearchCount, skippedReason: notApplicable ? "질문 이해 결과가 CLARIFY라 검색을 실행하지 않음" : undefined }
              : undefined;
    return {
      id,
      label,
      status,
      durationMs: elapsed(items),
      result: JSON.stringify({ trace: compact(items, [...fields]), ...(extra ?? {}) }, null, 2),
      inputTokens: null,
      outputTokens: null,
    };
  });
}

function answerReview(variant: "A" | "B", scenario: Scenario) {
  const oldPromptDefects: Record<string, string> = {
    "new-topic-and-explicit-current-period-win": "정답인 담당자 외에 질문하지 않은 회의 시작일을 덧붙였다.",
    "ambiguous-meeting-reference-fails-closed": "확인 질문의 의미를 answer와 clarificationQuestion에 중복해 반환했다.",
  };
  if (variant === "A" && oldPromptDefects[scenario.scenarioId]) {
    return {
      outcome: "incorrect" as const,
      notes: `답변 범위 검수: ${oldPromptDefects[scenario.scenarioId]} Worker는 COMPLETED였지만 사용자 요청 범위 기준으로 부적합이다.`,
    };
  }
  return {
    outcome: "correct" as const,
    notes: scenario.scenarioId === "ambiguous-meeting-reference-fails-closed"
      ? "두 후보 회의 중 하나를 임의 선택하지 않고 한 번만 확인 질문했다. 확인 분기라 SQL 검색은 실행하지 않았다."
      : `최종 Worker 답변을 고정 문서와 요청 범위에 대조했다. 답변=${scenario.answer} 검색 완료=${scenario.sqlSearchCount > 0}; 이는 사람 검수 결과나 별도 주장 검증기 결과가 아니다.`,
  };
}

async function databaseUrl(): Promise<string> {
  const injected = process.env.DATABASE_URL;
  if (injected) {
    const target = new URL(injected);
    if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/knot_eval") {
      throw new Error("결과 등록 대상은 로컬 knot_eval(127.0.0.1:55440)만 허용합니다.");
    }
    return injected;
  }
  const path = resolve(process.cwd(), ".env.local");
  const text = await readFile(path, "utf8");
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error("로컬 .env.local에 DATABASE_URL이 없습니다.");
  const url = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || target.port !== "55440" || target.pathname !== "/knot_eval") {
    throw new Error("결과 등록 대상은 로컬 knot_eval(127.0.0.1:55440)만 허용합니다.");
  }
  return url;
}

async function main() {
  const dbUrl = await databaseUrl();
  const artifacts = {
    A: assertArtifact(JSON.parse(await readFile(attempts.A, "utf8")), "답변 지시 수정 전"),
    B: assertArtifact(JSON.parse(await readFile(attempts.B, "utf8")), "답변 지시 수정 후"),
  };
  if (artifacts.A.fixture.workspaceId !== artifacts.B.fixture.workspaceId ||
      artifacts.A.fixture.memberId !== artifacts.B.fixture.memberId ||
      artifacts.A.fixture.documentIds.join(",") !== artifacts.B.fixture.documentIds.join(",")) {
    throw new Error("A/B fixture가 서로 다릅니다.");
  }

  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query("SELECT data FROM eval_state WHERE id=1 FOR UPDATE");
    if (row.rowCount !== 1) throw new Error("로컬 평가 상태를 찾지 못했습니다.");
    let state = row.rows[0].data as DataState;
    const dataset = state.datasets.find((item) => item.id === datasetId && item.version === datasetVersion);
    if (!dataset?.locked || dataset.contentHash !== expectedCorpusHash || dataset.cases.length !== caseIds.length ||
        caseIds.some((id) => !dataset.cases.some((item) => item.id === id))) {
      throw new Error("기존 잠금 평가셋 1.1이 예상 상태가 아닙니다. 평가셋을 변경하지 않았습니다.");
    }
    const inputHash = createHash("sha256").update(`${dataset.contentHash}:${caseIds.join(",")}`).digest("hex");
    let importedRuns = 0;
    let importedReviews = 0;
    const plannedRunIds: string[] = [];

    for (const variant of ["A", "B"] as const) {
      const artifact = artifacts[variant];
      const rows = artifact.scenarios.map((scenario, index) => ({ scenario, caseId: caseIds[index], stages: makeStages(scenario) }));
      const results = rows.map(({ scenario, caseId }) => {
        const searches = entries(scenario, "database-search");
        const candidates = [...new Set(searches.flatMap((search) => {
          const docs = search.candidateDocuments;
          return Array.isArray(docs) ? docs.map((doc) => `document-${(doc as Record<string, unknown>).documentId}`) : [];
        }))];
        return {
          caseId,
          status: scenario.answerStatus === "COMPLETED" ? "completed" as const : "failed" as const,
          candidates,
          answer: scenario.answer,
          // 검색·문서 확인은 최종 사용자 답변 인용과 별개다.
          evidenceIds: [],
          latencyMs: scenario.workerElapsedMs,
          error: scenario.failureCode,
          retrievalObserved: scenario.sqlSearchCount ? "performed" as const : "skipped" as const,
        };
      });
      const id = runIds[variant];
      const run = RunSchema.parse({
        id,
        datasetId,
        datasetVersion,
        corpusHash: dataset.corpusHash ?? dataset.contentHash,
        name: variant === "A" ? "실제 Worker · 답변 범위 지시 수정 전" : "실제 Worker · 답변 범위 지시 수정 후",
        strategy: "SearchAnswerWorker · Qwen · knot_lab isolated fixture · 2 MiB SSE limit · local relay→Tailscale",
        environment: "isolated_spring",
        model: artifact.model,
        revision: variant === "A" ? "run04-attempt03-answer-prompt-before-dedup" : "run04-attempt04-answer-prompt-after-dedup",
        startedAt: artifact.startedAt,
        status: "completed",
        experiment: {
          kind: "search_retrieval",
          variant,
          inputHash,
          promptVersion,
          stages: rows.flatMap((entry) => entry.stages),
        },
        results,
      });
      const existing = state.runs.find((item) => item.id === id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(run)) throw new Error(`기존 run ${id}가 산출물과 다릅니다.`);
      if (!existing) {
        state = applyAction(state, { type: "import_run", data: run });
        importedRuns += 1;
      }
      plannedRunIds.push(id);

      for (const { scenario, caseId, stages } of rows) {
        const reviews = [
          {
            stageId: "question_understanding",
            outcome: "correct" as const,
            notes: scenario.scenarioId === "ambiguous-meeting-reference-fails-closed"
              ? "두 회의 후보를 보존하고 대상 선택을 보류해 CLARIFY로 분기했다."
              : "사용자 대화의 주제·기간을 해석하고 새로 명시된 주제/기간은 이전 상태보다 우선했다.",
          },
          {
            stageId: "document_retrieval",
            outcome: "correct" as const,
            notes: scenario.sqlSearchCount === 0
              ? "CLARIFY 분기에서 검색을 건너뛴 것은 기대 동작이다."
              : `SQL 검색 ${scenario.sqlSearchCount}회 실행. 후보 문서는 답변 근거로 자동 확정하지 않고 다음 단계에서 확인했다.`,
          },
          ...(entries(scenario, "document-verification").length ? [{
            stageId: "document_verification",
            outcome: "correct" as const,
            notes: "문서 확인 단계가 요청된 주제·기간에 맞는 문서만 승인했다. 승인된 문서 ID는 단계 기록에 남겼고 최종 evidenceIds로 과장하지 않았다.",
          }] : []),
          {
            stageId: "answer_generation",
            ...answerReview(variant, scenario),
          },
        ];
        for (const review of reviews) {
          if (!stages.some((stage) => stage.id === review.stageId)) throw new Error(`검수 단계가 run에 없습니다: ${review.stageId}`);
          const exists = state.reviews.some((item) => item.runId === id && item.caseId === caseId && item.stageId === review.stageId && item.reviewer === aiReviewer);
          if (!exists) {
            state.reviews.push({
              ...review,
              id: randomUUID(),
              datasetId,
              datasetVersion,
              caseId,
              runId: id,
              reviewer: aiReviewer,
              createdAt: new Date().toISOString(),
            });
            importedReviews += 1;
          }
        }
      }
    }

    if (process.argv.includes("--dry-run")) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ dryRun: true, database: "local knot_eval", dataset: `${datasetId}@${datasetVersion}`, plannedRuns: plannedRunIds, plannedReviews: importedReviews, casesPerRun: caseIds.length, stagesPerRun: 30, inputHash }));
      return;
    }
    await client.query("UPDATE eval_state SET data=$1::jsonb WHERE id=1", [JSON.stringify(state)]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ database: "local knot_eval", dataset: `${datasetId}@${datasetVersion}`, importedRuns, importedAiReviews: importedReviews, runIds: plannedRunIds, casesPerRun: caseIds.length }));
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
