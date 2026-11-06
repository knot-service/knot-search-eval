import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { workspaceV123, v123Ids } from '../lib/workspace-v123';

test('자정 경계, 두 달 비교, 일정 조건 사례는 명시된 질문 시각으로 실행한다', () => {
 const before = DatasetSchema.parse(raw);
 const after = workspaceV123(before);
 assert.equal(v123Ids.size,10);
 for (const id of v123Ids) {
  const old = before.cases.find((item) => item.id === id);
  const item = after.cases.find((candidate) => candidate.id === id);
  assert.ok(old);
  assert.ok(item?.evaluationTime);
  assert.deepEqual(item.expectedEvidenceIds,old.expectedEvidenceIds);
  assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);
 }
 assert.equal(after.cases.find((item)=>item.id==='S62-03')?.evaluationTime,undefined);
});
