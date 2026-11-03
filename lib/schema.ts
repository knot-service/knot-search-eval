import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/);
const text = z.string().max(50000);
export const ExperimentStageSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(100),
  status: z.enum(["completed", "failed", "not_applicable", "not_run"]),
  durationMs: z.number().nonnegative().nullable(),
  result: text,
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
});
export const CaseSchema = z.object({
  id,
  scenario: z.string().min(1).max(50),
  category: z.string().min(1).max(100),
  question: text.min(1),
  setup: text.optional(),
  executionHoldReason: z.string().max(3000).optional(),
  evaluationTime: z.string().datetime({ offset: true }).optional(),
  executionFixture: z.enum(['transcript_exclusion','no_search_observation','no_document_recording','privacy_observation','document_after_intake','limited_context']).optional(),
  variant: z.string().max(100).optional(),
  issue: z.string().max(20).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: text }))
    .max(40),
  documents: z
    .array(
      z.object({
        id,
        title: text.min(1),
        content: text,
        summary: text.nullable().optional(),
        fixtureStatus: z.enum(["automatic_pass", "automatic_hold", "pending", "generation_failed"]).optional(),
        fixtureSource: text.optional(),
        fixtureReason: z.string().max(3000).optional(),
        workspaceId: id.optional(),
        accessible: z.boolean().optional(),
        meetingStartedAt: z.string().datetime({ offset: true }).optional(),
        createdAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .max(50),
  expectedBehavior: text.min(1),
  expectedEvidenceIds: z.array(id).max(50),
  expectedType: z.enum([
    "answer",
    "not_found",
    "clarify",
    "deny",
    "partial",
    "recovery",
    "conversation",
    "unsupported",
  ]),
});
export const DatasetSchema = z
  .object({
    id,
    name: z.string().min(1).max(150),
    version: z.string().min(1).max(50),
    source: z.literal("synthetic"),
    corpusHash: z.string().min(1).max(150).optional(),
    cases: z.array(CaseSchema).min(1).max(500),
  })
  .superRefine((v, ctx) => {
    const ids = v.cases.map((c) => c.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "사례 ID가 중복됐습니다" });
    for (const c of v.cases) {
      const docIds = c.documents.map((d) => d.id);
      if (new Set(docIds).size !== docIds.length)
        ctx.addIssue({
          code: "custom",
          message: `${c.id}: 문서 ID가 중복됐습니다`,
        });
      if (c.expectedEvidenceIds.some((e) => !docIds.includes(e)))
        ctx.addIssue({
          code: "custom",
          message: `${c.id}: 기대 근거를 문서에서 찾을 수 없습니다`,
        });
    }
  });
export const RunSchema = z
  .object({
    id,
    datasetId: id,
    datasetVersion: z.string().min(1).max(50),
    corpusHash: z.string().min(1).max(150),
    name: z.string().min(1).max(150),
    strategy: z.string().min(1).max(100),
    environment: z.enum([
      "synthetic",
      "direct_model",
      "isolated_spring",
      "production",
    ]),
    model: z.string().max(150),
    revision: z.string().max(150),
    startedAt: z.string().datetime({ offset: true }),
    status: z.enum(["completed", "failed", "cancelled"]),
    experiment: z.object({
      kind: z.literal("fixed_document_verification"),
      variant: z.enum(["A", "B"]),
      inputHash: z.string().min(1).max(150),
      promptVersion: z.string().min(1).max(100),
      stages: z.array(ExperimentStageSchema).max(30),
    }).optional(),
    budgetObservation: z.object({inputChars:z.number().int().nonnegative(),limitChars:z.number().int().positive(),documents:z.number().int().nonnegative(),selectedDocuments:z.number().int().nonnegative(),partial:z.boolean()}).optional(),
    results: z
      .array(
        z.object({
          caseId: id,
          status: z.enum(["completed", "failed", "timeout", "cancelled"]),
          candidates: z.array(id).max(100),
          answer: text,
          evidenceIds: z.array(id).max(50),
          latencyMs: z.number().nonnegative().nullable(),
          clientTimings: z.object({firstProgressMs:z.number().int().nonnegative().optional(),firstDeltaMs:z.number().int().nonnegative().optional()}).optional(),
          stageTimings: z.object({
            capture: z.enum(["collected", "unavailable"]),
            stages: z.array(z.object({
              phase: z.enum(["queue_wait", "intent_classification", "document_retrieval", "answer_generation", "llm_first_content", "content_persistence", "worker_total"]),
              durationMs: z.number().int().nonnegative(),
              outcome: z.enum(["success", "failure", "unknown"]),
            })).max(100),
          }).optional(),
          error: z.string().max(2000).nullable(),
          retrievalObserved: z.enum(['performed','skipped','unknown']).optional(),
          privacyLogObserved: z.enum(['exposed','not_observed','unknown']).optional(),
        }),
      )
      .max(500),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.results.map((r) => r.caseId)).size !== v.results.length)
      ctx.addIssue({
        code: "custom",
        message: "결과의 사례 ID가 중복됐습니다",
      });
  });
export type Dataset = z.infer<typeof DatasetSchema>;
export type EvalCase = z.infer<typeof CaseSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Review = {
  id: string;
  datasetId: string;
  datasetVersion: string;
  caseId: string;
  runId?: string;
  stageId?: string;
  outcome: "correct" | "incorrect" | "hold";
  notes: string;
  reviewer: string;
  createdAt: string;
};
export type DataState = {
  datasets: (Dataset & { locked: boolean; contentHash: string })[];
  runs: Run[];
  reviews: Review[];
};
