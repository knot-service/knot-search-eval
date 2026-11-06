import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStageTimings } from "../lib/stage-timings";

test("해당 답변의 실제 단계 시간과 실패만 수집한다", () => {
  const logs = [
    "Search latency phase=queue_wait workspaceId=458 answerId=17 elapsedMs=12 outcome=success",
    "Search latency phase=intent_classification workspaceId=458 answerId=17 elapsedMs=80 outcome=failure",
    "Search latency phase=answer_generation workspaceId=458 answerId=170 elapsedMs=999 outcome=success",
    "Search latency phase=document_retrieval workspaceId=459 answerId=17 elapsedMs=999 outcome=success",
    "Search latency phase=worker_total workspaceId=458 answerId=17 elapsedMs=101",
  ].join("\n");
  assert.deepEqual(parseStageTimings(logs,17), {capture:"collected",stages:[
    {phase:"queue_wait",durationMs:12,outcome:"success"},
    {phase:"intent_classification",durationMs:80,outcome:"failure"},
    {phase:"worker_total",durationMs:101,outcome:"unknown"},
  ]});
});

test("해당 답변의 측정 로그가 없으면 0ms가 아닌 미수집으로 표시한다", () => {
  assert.deepEqual(parseStageTimings("unrelated log",17), {capture:"unavailable",stages:[]});
});
