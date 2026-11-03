import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessComparison } from "../components/ProcessComparison";
import { RunSchema } from "../lib/schema";

function run(variant: "A" | "B", status: "completed" | "failed") {
  return RunSchema.parse({id:`run-${variant}`,datasetId:"dataset",datasetVersion:"1.30",corpusHash:"corpus",name:"질문 이해",strategy:`질문 이해 ${variant === "A" ? "http" : "spring"} · schema · 반복 1 · 호출 ${status === "completed" ? "1" : "미확인"}`,environment:"direct_model",model:"model",revision:"v1",startedAt:"2026-11-03T00:00:00Z",status,experiment:{kind:"question_understanding",variant,inputHash:"same",promptVersion:"v1",stages:[{id:"question_understanding",label:"질문 이해",status,durationMs:123,result:"{}",inputTokens:null,outputTokens:null}]},results:[{caseId:"S08-01",status,candidates:[],answer:"{}",evidenceIds:[],latencyMs:123,error:status === "failed" ? "error" : null}]});
}
test("질문 이해 비교에서 방식과 미수집 호출 수를 표시한다", () => {
  const html = renderToStaticMarkup(<ProcessComparison runs={[run("A","completed"),run("B","failed")]} reviews={[]} />);
  assert.match(html,/HTTP · 스키마/);
  assert.match(html,/Spring AI · 스키마/);
  assert.match(html,/1회/);
  assert.match(html,/미수집/);
  assert.doesNotMatch(html,/검증 A/);
});
