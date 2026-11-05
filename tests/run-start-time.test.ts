import assert from "node:assert/strict";
import test from "node:test";
import {formatKoreaRunTime} from "../lib/korea-time";

test("실험 시각은 서울 시간으로 날짜가 바뀌어도 월·일·시·분을 유지한다", () => {
  assert.equal(formatKoreaRunTime("2026-11-04T15:05:00.000Z"), "11-05 00:05");
  assert.equal(formatKoreaRunTime("2026-11-05T01:07:44.827Z"), "11-05 10:07");
  assert.equal(formatKoreaRunTime("invalid"), null);
});
