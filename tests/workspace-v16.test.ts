import {test} from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';
import {correctedWorkspaceDataset} from '../lib/workspace-corrections';
import {workspaceV14} from '../lib/workspace-v14';
import {workspaceV15} from '../lib/workspace-v15';
import {workspaceV16,v16Ids} from '../lib/workspace-v16';
import {sharedCaseReadiness} from '../lib/local-cases';
test('이전 대화가 완성된 검수 적합 사례만 공통 실험에 허용한다',()=>{
 const old=workspaceV15(workspaceV14(correctedWorkspaceDataset(DatasetSchema.parse(raw))));
 const next=workspaceV16(old);assert.equal(next.version,'1.6');
 for(const id of v16Ids){const c=next.cases.find(x=>x.id===id);assert.ok(c);assert.equal(c.history.length%2,0);assert.equal(sharedCaseReadiness(c,new Date(),'correct').ready,true);assert.equal(sharedCaseReadiness(c,new Date(),'hold').ready,false);}
 const blocked=next.cases.find(c=>c.id==='C04-03');assert.ok(blocked);assert.equal(sharedCaseReadiness(blocked,new Date(),'correct').ready,false);
});
