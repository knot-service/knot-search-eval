import {test} from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';
import {correctedWorkspaceDataset} from '../lib/workspace-corrections';
import {workspaceV15,v15Ids} from '../lib/workspace-v15';
test('시각이 필요한 사례는 시점을 명시하고 질문 모호성을 분리한다',()=>{
 const old=correctedWorkspaceDataset(DatasetSchema.parse(raw));const next=workspaceV15(old);
 assert.equal(next.cases.filter((c,i)=>JSON.stringify(c)!==JSON.stringify(old.cases[i])).length,v15Ids.size);
 const empty=next.cases.find(c=>c.id==='S55-01');assert.equal(empty?.expectedType,'not_found');assert.ok(empty?.executionHoldReason);assert.equal(empty?.documents.length,0);
 const clear=next.cases.find(c=>c.id==='S59-01');assert.equal(clear?.expectedType,'answer');assert.match(clear?.question??'',/배포/);
 const ambiguous=next.cases.find(c=>c.id==='S59-03');assert.equal(ambiguous?.expectedType,'clarify');assert.deepEqual(ambiguous?.expectedEvidenceIds,[]);
 assert.equal(old.version,'1.2');assert.equal(next.version,'1.5');
});
