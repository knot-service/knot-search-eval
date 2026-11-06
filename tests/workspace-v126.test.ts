import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { v126Ids, workspaceV126 } from '../lib/workspace-v126';

test('어제 회의 정상 조회에서 세 회의를 각각 평가한다', () => {
 const result=workspaceV126(DatasetSchema.parse(raw));
 for(const id of v126Ids) {
  const item=result.cases.find(c=>c.id===id);assert.ok(item);
  assert.deepEqual(item.expectedEvidenceIds,['document-2180','document-2181','document-2199']);
  assert.equal(item.evaluationTime,'2026-10-29T03:00:00.000Z');
  assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);
  assert.equal(sharedCaseReadiness(item,new Date(),'hold').ready,false);
 }
});
