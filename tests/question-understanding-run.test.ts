import test from "node:test";
import assert from "node:assert/strict";
import { RunSchema } from "../lib/schema";
import { comparable } from "../lib/state";

function fixture(kind: "question_understanding" | "fixed_document_verification", inputHash = "input-hash") {
  return RunSchema.parse({
    id:`run-${kind}`, datasetId:"dataset", datasetVersion:"1.30", corpusHash:"corpus",
    name:"질문 이해", strategy:"http", environment:"direct_model", model:"model", revision:"v1",
    startedAt:"2026-11-03T00:00:00Z", status:"completed",
    experiment:{kind,variant:"A",inputHash,promptVersion:"v1",stages:[{id:"question_understanding",label:"질문 이해",status:"completed",durationMs:100,result:"{}",inputTokens:null,outputTokens:null}]},
    results:[{caseId:"S08-01",status:"completed",candidates:[],answer:"{}",evidenceIds:[],latencyMs:100,error:null}],
  });
}
test("질문 이해 실험은 같은 입력의 질문 이해 결과만 비교한다", () => {
  const run = fixture("question_understanding");
  assert.equal(comparable(run,fixture("question_understanding")),true);
  assert.equal(comparable(run,fixture("question_understanding","other-input")),false);
  assert.equal(comparable(run,fixture("fixed_document_verification")),false);
});
