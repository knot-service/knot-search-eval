import { test } from "node:test";
import assert from "node:assert/strict";
import { koreaTimeInText } from "../lib/korea-time";

test("UTC 실험 시각을 날짜 경계를 포함해 한국 시간으로 표시한다", () => {
  assert.match(koreaTimeInText("S01-01 · 2026-11-03T07:50:50.980Z"), /S01-01 · 2026\. 11\. 3\. 16(?:시 |:)50(?:분 |:)50(?:초)? \(한국 시간\)/);
  assert.match(koreaTimeInText("2026-11-03T18:00:00Z"), /2026\. 11\. 4\./);
  assert.equal(koreaTimeInText("일반 결과"), "일반 결과");
});
