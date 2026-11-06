import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { workspaceV121, v121Ids } from '../lib/workspace-v121';

test('결제 출시 연기 사유는 원문 제외 조건으로 검증하고 기대 결과를 유지한다', () => {
 const before = DatasetSchema.parse(raw);
 const after = workspaceV121(before);
 for (const id of v121Ids) {
  const old = before.cases.find((item) => item.id === id);
  const item = after.cases.find((candidate) => candidate.id === id);
  assert.ok(old);
  assert.ok(item);
  assert.equal(item.executionFixture,'transcript_exclusion');
  assert.equal(item.expectedBehavior,old.expectedBehavior);
  assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);
 }
});
