import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/);
const text = z.string().max(50000);
export const CaseSchema = z.object({
  id,
  scenario: z.string().min(1).max(50),
  category: z.string().min(1).max(100),
  question: text.min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: text }))
    .max(40),
  documents: z
    .array(z.object({ id, title: text.min(1), content: text }))
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
  ]),
});
export const DatasetSchema = z
  .object({
    id,
    name: z.string().min(1).max(150),
    version: z.string().min(1).max(50),
    source: z.literal("synthetic"),
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
    results: z
      .array(
        z.object({
          caseId: id,
          status: z.enum(["completed", "failed", "timeout", "cancelled"]),
          candidates: z.array(id).max(100),
          answer: text,
          evidenceIds: z.array(id).max(50),
          latencyMs: z.number().nonnegative().nullable(),
          error: z.string().max(2000).nullable(),
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
