import {test} from 'node:test';import assert from 'node:assert/strict';import {summarizeDatasetReviews} from '../lib/review-summary';import type {DataState,Review} from '../lib/schema';
test('같은 사례의 최신 검수만 집계하고 실험 검수와 이전 버전은 제외한다',()=>{
 const dataset={id:'set',version:'1.2',cases:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}]} as DataState['datasets'][number];
 const review=(caseId:string,outcome:Review['outcome'],overrides:Partial<Review>={}):Review=>({id:'r',datasetId:'set',datasetVersion:'1.2',caseId,outcome,notes:'',reviewer:'',createdAt:'2026-01-01T00:00:00Z',...overrides});
 const data=[review('a','incorrect'),review('a','correct'),review('a','incorrect',{runId:'run'}),review('b','hold'),review('c','incorrect'),review('d','correct',{datasetVersion:'1.1'}),review('absent','hold')];
 assert.deepEqual(summarizeDatasetReviews(dataset,data),{total:4,correct:1,hold:1,incorrect:1,unreviewed:1});
 assert.deepEqual(summarizeDatasetReviews(undefined,data),{total:0,correct:0,hold:0,incorrect:0,unreviewed:0});
});
test('기록 순서가 뒤섞여도 실제 시각이 최신인 사례 판정을 사용한다',()=>{
 const dataset={id:'set',version:'1.2',cases:[{id:'a'}]} as DataState['datasets'][number];
 const review=(outcome:Review['outcome'],createdAt:string):Review=>({id:createdAt,datasetId:'set',datasetVersion:'1.2',caseId:'a',outcome,notes:'',reviewer:'',createdAt});
 const data=[review('hold','2026-01-02T00:00:00Z'),review('correct','2026-01-01T00:00:00Z')];
 assert.deepEqual(summarizeDatasetReviews(dataset,data),{total:1,correct:0,hold:1,incorrect:0,unreviewed:0});
});
