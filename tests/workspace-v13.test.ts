import {test} from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';
import {correctedWorkspaceDataset} from '../lib/workspace-corrections';
import {workspaceV13} from '../lib/workspace-v13';

test('새 문서와 모순 없는 질문을 새 버전에 반영하고 기존 이력을 바꾸지 않는다',()=>{
 const old=correctedWorkspaceDataset(DatasetSchema.parse(raw));
 const all=old.cases.flatMap(c=>c.documents);
 const changed=all.find(d=>d.id==='document-2142');
 const second=all.find(d=>d.id==='document-2175');
 assert.ok(changed); assert.ok(second);
 const docs=new Map([[changed.id,{...changed,content:'수정된 합성 문서'}],[second.id,second]]);
 const result=workspaceV13(old,docs,'new-hash');
 assert.equal(result.version,'1.3'); assert.equal(result.cases.length,255);
 assert.notEqual(old.cases.find(c=>c.id==='S03-01')?.documents[1].content,'수정된 합성 문서');
 assert.equal(result.cases.find(c=>c.id==='S03-01')?.documents[1].content,'수정된 합성 문서');
 assert.equal(result.cases.find(c=>c.id==='S04-03')?.expectedType,'not_found');
 const partial=result.cases.find(c=>c.id==='S39-01');
 assert.deepEqual(partial?.documents.map(d=>d.id),['document-2174','document-2175']);
 assert.ok(partial?.executionHoldReason);
 assert.equal(result.cases.find(c=>c.id==='S50-03')?.expectedEvidenceIds.length,0);
});
