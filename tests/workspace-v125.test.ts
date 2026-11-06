import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { v125Ids, workspaceV125 } from '../lib/workspace-v125';

test('문서 없는 녹음 사례는 동일한 기대 동작과 격리된 실행 조건을 보존한다', () => {
  const source = DatasetSchema.parse(raw);
  const result = workspaceV125(source);
  for (const id of v125Ids) {
    const before = source.cases.find((item) => item.id === id);
    const item = result.cases.find((candidate) => candidate.id === id);
    assert.ok(before);
    assert.ok(item);
    assert.equal(item.question, before.question);
    assert.equal(item.expectedBehavior, before.expectedBehavior);
    assert.equal(item.executionFixture, 'no_document_recording');
    assert.ok(item.evaluationTime);
    assert.equal(sharedCaseReadiness(item, new Date(), 'correct').ready, true);
    assert.equal(sharedCaseReadiness(item, new Date(), 'hold').ready, false);
  }
});
