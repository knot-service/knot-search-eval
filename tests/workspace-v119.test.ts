import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { workspaceV119, v119Ids } from '../lib/workspace-v119';

test('시각 제어가 필요한 사례만 기준 시각과 완전한 대화를 갖는다', () => {
 const before = DatasetSchema.parse(raw);
 const after = workspaceV119(before);
 assert.equal(v119Ids.size, 19);
 for (const id of v119Ids) {
  const old = before.cases.find((item) => item.id === id);
  const item = after.cases.find((candidate) => candidate.id === id);
  assert.ok(old);
  assert.ok(item?.evaluationTime);
  assert.equal(item.history.length % 2, 0);
  assert.deepEqual(item.expectedEvidenceIds, old.expectedEvidenceIds);
  assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready, true);
  assert.equal(sharedCaseReadiness(item,new Date(),'hold').ready, false);
 }
 assert.equal(after.cases.find((item) => item.id === 'S46-01')?.evaluationTime, undefined);
});
