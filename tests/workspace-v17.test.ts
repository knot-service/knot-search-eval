import {test} from 'node:test';import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';import {correctedWorkspaceDataset} from '../lib/workspace-corrections';import {workspaceV17,v17Ids} from '../lib/workspace-v17';
test('사용자 정정과 대상을 모르는 발화를 사실 검색과 구별한다',()=>{
 const old=correctedWorkspaceDataset(DatasetSchema.parse(raw)),next=workspaceV17(old);
 assert.equal(next.cases.filter((c,i)=>JSON.stringify(c)!==JSON.stringify(old.cases[i])).length,v17Ids.size);
 for(const id of ['C01-01','C08-03']){const c=next.cases.find(x=>x.id===id);assert.equal(c?.expectedType,'conversation');assert.equal(c?.history.length,2);assert.deepEqual(c?.expectedEvidenceIds,[]);}
 assert.equal(next.cases.find(c=>c.id==='S67-03')?.expectedType,'clarify');
 assert.match(next.cases.find(c=>c.id==='S52-03')?.question??'',/스마트워치/);
});
