import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivacyLog } from '../lib/privacy-observation';

test('합성 연락처 또는 해당 답변의 이름 노출을 탐지한다', () => {
 const phase='workspaceId=458 answerId=12 phase=intent_classification outcome=success';
 assert.equal(parsePrivacyLog(`${phase}\n전화 010-0000-0000`,12),'exposed');
 assert.equal(parsePrivacyLog(`${phase} user=민지`,12),'exposed');
 assert.equal(parsePrivacyLog(phase,12),'not_observed');
 assert.equal(parsePrivacyLog(phase,13),'unknown');
});
