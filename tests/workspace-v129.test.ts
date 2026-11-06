import {test} from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';
import {sharedCaseReadiness} from '../lib/local-cases';
import {workspaceV129,v129Ids} from '../lib/workspace-v129';
test('자료량 평가가 원래 질문·기대 동작을 유지하고 문자 한도를 명시한다',()=>{
 const old=DatasetSchema.parse(raw),next=workspaceV129(old);
 for(const id of v129Ids){const before=old.cases.find(c=>c.id===id),item=next.cases.find(c=>c.id===id);assert.ok(before);assert.ok(item);assert.equal(item.question,before.question);assert.equal(item.expectedBehavior,before.expectedBehavior);assert.ok(item.setup);assert.match(item.setup,/6,000자/);assert.match(item.setup,/토큰 한도는 아니다/);assert.equal(item.executionFixture,'limited_context');assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);assert.equal(sharedCaseReadiness(item,new Date(),'hold').ready,false);}
});
