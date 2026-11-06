import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunReviews } from '../components/RunReviews';
import type { Review } from '../lib/schema';

test('선택한 실행과 사례의 검수 판정과 의견을 모두 표시한다', () => {
  const base: Review = { id: 'one', datasetId: 'set', datasetVersion: '1.30', caseId: 'S66-03', runId: 'run-1', outcome: 'hold', notes: '실행 실패: 근거 검증 오류', reviewer: 'AI 검수', createdAt: '2026-11-02T00:00:00Z' };
  const reviews: Review[] = [base, { ...base, id: 'two', outcome: 'correct', notes: '재검수 의견', createdAt: '2026-11-03T00:00:00Z' }, { ...base, id: 'other', runId: 'run-2', notes: '다른 실행 의견' }];
  const html = renderToStaticMarkup(createElement(RunReviews, { reviews, runId: 'run-1', caseId: 'S66-03' }));
  assert.match(html, /판단 보류/);
  assert.match(html, /실행 실패: 근거 검증 오류/);
  assert.match(html, /재검수 의견/);
  assert.match(html, /AI 검수/);
  assert.doesNotMatch(html, /다른 실행 의견/);
  assert.ok(html.indexOf('재검수 의견') < html.indexOf('실행 실패: 근거 검증 오류'));
});
