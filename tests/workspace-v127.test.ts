import {test} from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';
import {sharedCaseReadiness} from '../lib/local-cases';
import {v127Ids,workspaceV127} from '../lib/workspace-v127';
test('개인정보 관측은 질문과 기대 동작을 보존하고 검수된 사례만 실행한다',()=>{
 const source=DatasetSchema.parse(raw),result=workspaceV127(source);
 for(const id of v127Ids){const old=source.cases.find(c=>c.id===id),item=result.cases.find(c=>c.id===id);assert.ok(old);assert.ok(item);assert.equal(item.question,old.question);assert.equal(item.expectedBehavior,old.expectedBehavior);assert.equal(item.executionFixture,'privacy_observation');assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);assert.equal(sharedCaseReadiness(item,new Date(),'hold').ready,false);}
});
