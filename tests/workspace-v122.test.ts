import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import { DatasetSchema } from '../lib/schema';
import { sharedCaseReadiness } from '../lib/local-cases';
import { workspaceV122, v122Ids } from '../lib/workspace-v122';

test('감사와 종료 발화는 검색 단계 관측을 포함해 실행한다', () => {
 const before = DatasetSchema.parse(raw);
 const after = workspaceV122(before);
 for (const id of v122Ids) {
  const item = after.cases.find((candidate) => candidate.id === id);
  assert.ok(item);
  assert.equal(item.executionFixture,'no_search_observation');
  assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);
  assert.equal(sharedCaseReadiness(item,new Date(),'hold').ready,false);
 }
});
