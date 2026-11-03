import test from "node:test";
import assert from "node:assert/strict";
import { latestReviewsByProvenance } from "../lib/review-provenance";
import type { Review } from "../lib/schema";

const review = (reviewer: string, outcome: Review["outcome"], createdAt: string): Review => ({id:`${reviewer}-${createdAt}`,datasetId:"dataset",datasetVersion:"1.30",caseId:"S08-01",reviewer,outcome,notes:"",createdAt});
test("AI와 사람 검수를 분리하고 과거 출처는 추측하지 않는다", () => {
  const grouped = latestReviewsByProvenance([
    review("AI 검수 (Codex)","hold","2026-11-01T00:00:00Z"),
    review("사람 검수 (실험실)","correct","2026-11-02T00:00:00Z"),
    review("개인 평가자","incorrect","2026-11-03T00:00:00Z"),
  ]);
  assert.equal(grouped.ai?.outcome,"hold");
  assert.equal(grouped.human?.outcome,"correct");
  assert.equal(grouped.unknown?.outcome,"incorrect");
});
