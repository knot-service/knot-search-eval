import test from "node:test";
import assert from "node:assert/strict";
import { belongsToSpace } from "../lib/experiment-spaces";
import { RunSchema } from "../lib/schema";

function run(kind?: "question_understanding" | "fixed_document_verification" | "search_retrieval") {
  return RunSchema.parse({id:"run",datasetId:"dataset",datasetVersion:"1",corpusHash:"hash",name:"run",strategy:"strategy",environment:"direct_model",model:"model",revision:"rev",startedAt:"2026-11-03T00:00:00Z",status:"completed",...(kind ? {experiment:{kind,variant:"A",inputHash:"hash",promptVersion:"v1",stages:[]}} : {}),results:[]});
}
test("실험 유형을 정확한 공간에만 표시하고 기존 기록은 보존한다", () => {
  const question = run("question_understanding"), verification = run("fixed_document_verification"), existing = run();
  assert.equal(belongsToSpace(question,"question"),true);
  assert.equal(belongsToSpace(question,"verification"),false);
  assert.equal(belongsToSpace(verification,"verification"),true);
  assert.equal(belongsToSpace(existing,"existing"),true);
  assert.equal(belongsToSpace(existing,"question"),false);
  assert.equal(belongsToSpace(existing,"retrieval"),false);
  assert.equal(belongsToSpace(question,"document"),false);
  assert.equal([question,verification,existing].every(item => belongsToSpace(item,"all")),true);
});
test("검색 실험은 검색 공간에서만 선택할 수 있다", () => {
  const retrieval = run("search_retrieval");
  assert.equal(belongsToSpace(retrieval,"retrieval"),true);
  assert.equal(belongsToSpace(retrieval,"question"),false);
  assert.equal(belongsToSpace(retrieval,"verification"),false);
  assert.equal(belongsToSpace(retrieval,"existing"),false);
});
