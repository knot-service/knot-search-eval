import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRetrievalObservation } from '../lib/retrieval-observation';

test('같은 답변의 분류와 검색 단계만 관측하고 누락은 미확인으로 남긴다', () => {
 const greeting = 'Search latency phase=intent_classification workspaceId=458 answerId=12 elapsedMs=1 outcome=success intent=GREETING_OR_THANKS';
 const retrieval = 'Search latency phase=document_retrieval workspaceId=458 answerId=12 elapsedMs=1 candidates=0 outcome=success';
 assert.equal(parseRetrievalObservation(greeting,12),'skipped');
 assert.equal(parseRetrievalObservation(`${greeting}\n${retrieval}`,12),'performed');
 assert.equal(parseRetrievalObservation(greeting,1),'unknown');
 assert.equal(parseRetrievalObservation('',12),'unknown');
 assert.equal(parseRetrievalObservation(greeting.replace('GREETING_OR_THANKS','MEETING_SEARCH'),12),'unknown');
});
