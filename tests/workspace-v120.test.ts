import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { workspaceV120, v120Ids } from '../lib/workspace-v120';

test('원문만 가진 값을 검증하는 사례는 전용 원문 조건을 사용하고 다른 사례는 보존한다', () => {
 const before = DatasetSchema.parse(raw);
 const after = workspaceV120(before);
 for (const id of v120Ids) {
  const old = before.cases.find((item) => item.id === id);
  const item = after.cases.find((candidate) => candidate.id === id);
  assert.ok(old);
  assert.ok(item);
  assert.equal(item.executionFixture,'transcript_exclusion');
  assert.deepEqual(item.expectedEvidenceIds,old.expectedEvidenceIds);
  assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);
  assert.equal(sharedCaseReadiness(item,new Date(),'hold').ready,false);
 }
 assert.equal(after.cases.find((item)=>item.id==='S02-01')?.executionFixture,undefined);
});
