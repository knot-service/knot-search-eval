import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatStageJson } from '../lib/format-stage-json';

test('formats and expands nested JSON while leaving the input intact', () => {
  const raw = JSON.stringify({ output: { content: JSON.stringify({ requests: [{ target: '결제' }] }) } });
  const result = formatStageJson(raw);
  assert.equal(result?.expanded, true);
  assert.deepEqual(JSON.parse(result!.formatted), { output: { content: { requests: [{ target: '결제' }] } } });
  assert.equal(typeof JSON.parse(raw).output.content, 'string');
});
test('supports JSON arrays and retains ordinary and malformed text', () => {
  assert.deepEqual(JSON.parse(formatStageJson('[1,2]')!.formatted), [1, 2]);
  assert.equal(formatStageJson('결과 없음'), null);
  assert.equal(formatStageJson('{not json}'), null);
  assert.equal(formatStageJson('{"content":"{bad}"}')?.expanded, false);
});
