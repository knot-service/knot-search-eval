import { test } from "node:test";
import assert from "node:assert/strict";
import { CaseSchema } from "../lib/schema";
import { caseReadiness, sharedCaseReadiness } from "../lib/local-cases";
import dataset from "../data/synthetic-full-dataset.json";

test("문서만 필요한 사례는 준비되고 이전 대화나 장애 사례는 보류한다", () => {
  const get=(id:string)=>CaseSchema.parse(dataset.cases.find((c)=>c.id===id));
  const basic=get("S01-01");
  assert.equal(caseReadiness(basic).ready,true);
  const flagged={...basic,documents:basic.documents.map((d)=>({...d,fixtureStatus:"automatic_hold" as const}))};
  assert.equal(caseReadiness(flagged).ready,false);
  assert.equal(caseReadiness(flagged,new Date(),"correct").ready,true);
  assert.equal(caseReadiness(basic,new Date(),"incorrect").ready,false);
  assert.equal(caseReadiness(get("S01-02")).ready,true);
  assert.equal(caseReadiness(get("S01-03")).ready,true);
  assert.equal(caseReadiness(get("S08-01")).ready,true);
  assert.equal(caseReadiness(get("S02-01")).ready,true);
  assert.equal(caseReadiness(get("S31-01")).ready,true);
  assert.equal(caseReadiness(get("S16-01"), new Date("2026-11-02T00:00:00Z")).ready,true);
  assert.equal(caseReadiness(get("S16-01"), new Date("2027-01-01T00:00:00Z")).ready,false);
  assert.equal(caseReadiness(get("S40-01")).ready,false);
  assert.equal(caseReadiness(get("S03-03")).ready,true);
  assert.equal(caseReadiness(get("S70-01")).ready,false);
});

test("공통 공간은 사례별 무문서와 접근 제한 조건을 자동으로 재현했다고 보지 않는다", () => {
  const get=(id:string)=>CaseSchema.parse(dataset.cases.find((c)=>c.id===id));
  assert.equal(sharedCaseReadiness(get("S01-01")).ready,true);
  assert.equal(sharedCaseReadiness(get("S01-03")).ready,false);
  assert.equal(sharedCaseReadiness(get("S31-01")).ready,false);
  assert.equal(sharedCaseReadiness(get("S58-01")).ready,false);
  assert.equal(sharedCaseReadiness(get("S71-01")).ready,false);
});
