import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { workspaceV117, v117Ids } from '../lib/workspace-v117';

test('버전 정정 발화 앞의 합성 대화를 완성하고 기대 근거와 원본을 보존한다', () => {
 const original = DatasetSchema.parse(raw);
 const updated = workspaceV117(original);
 for (const id of v117Ids) {
  const before = original.cases.find((item) => item.id === id);
  const after = updated.cases.find((item) => item.id === id);
  assert.ok(before);
  assert.ok(after);
  assert.equal(before.history.length, 1);
  assert.equal(after.history.length, 2);
  assert.equal(after.history[1]?.role, 'assistant');
  assert.deepEqual(after.expectedEvidenceIds, before.expectedEvidenceIds);
  assert.equal(sharedCaseReadiness(after, new Date(), 'correct').ready, true);
  assert.equal(sharedCaseReadiness(after, new Date(), 'hold').ready, false);
 }
});
