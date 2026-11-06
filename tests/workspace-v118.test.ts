import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { workspaceV118, v118Ids } from '../lib/workspace-v118';

test('세션과 JWT의 관련 기록을 구분해 포함하고 기존 기대 근거를 유지한다', () => {
 const before = DatasetSchema.parse(raw);
 const after = workspaceV118(before);
 for (const id of v118Ids) {
  const old = before.cases.find((item) => item.id === id);
  const item = after.cases.find((candidate) => candidate.id === id);
  assert.ok(old);
  assert.ok(item);
  assert.deepEqual(item.expectedEvidenceIds, old.expectedEvidenceIds);
  assert.ok(item.documents.some((document) => document.id === (item.scenario === 'S19' ? 'document-2209' : 'document-2161')));
  assert.equal(sharedCaseReadiness(item, new Date(), 'correct').ready, true);
 }
});
