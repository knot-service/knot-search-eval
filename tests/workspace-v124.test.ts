import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { v124Ids, workspaceV124 } from '../lib/workspace-v124';

test('결재와 결제 구분 사례는 기존 질문과 판단 기준을 유지하며 검수한 경우 실행할 수 있다', () => {
  const source = DatasetSchema.parse(raw);
  const result = workspaceV124(source);
  for (const id of v124Ids) {
    const old = source.cases.find((item) => item.id === id);
    const item = result.cases.find((candidate) => candidate.id === id);
    assert.ok(old);
    assert.ok(item);
    assert.equal(item.question, old.question);
    assert.equal(item.expectedBehavior, old.expectedBehavior);
    assert.deepEqual(item.expectedEvidenceIds, old.expectedEvidenceIds);
    assert.equal(sharedCaseReadiness(item, new Date(), 'correct').ready, true);
    assert.equal(sharedCaseReadiness(item, new Date(), 'hold').ready, false);
  }
});
