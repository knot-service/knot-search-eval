import {test} from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';
import {correctedWorkspaceDataset} from '../lib/workspace-corrections';
import {workspaceV14,v14Ids} from '../lib/workspace-v14';

test('질문과 이전 대화의 대상을 명확하게 하되 부재 변형과 기존 버전은 보존한다',()=>{
 const base=correctedWorkspaceDataset(DatasetSchema.parse(raw));
 const result=workspaceV14(base);
 assert.equal(result.version,'1.4'); assert.equal(result.cases.length,base.cases.length);
 assert.equal(result.cases.filter((c,i)=>JSON.stringify(c)!==JSON.stringify(base.cases[i])).length,v14Ids.size);
 assert.equal(base.cases.find(c=>c.id==='C07-01')?.history.length,1);
 assert.equal(result.cases.find(c=>c.id==='C07-01')?.history.at(-1)?.role,'assistant');
 assert.equal(result.cases.find(c=>c.id==='S67-01')?.history.length,2);
 assert.deepEqual(result.cases.find(c=>c.id==='S67-03'),base.cases.find(c=>c.id==='S67-03'));
 assert.ok(result.cases.find(c=>c.id==='C04-01')?.executionHoldReason);
});
