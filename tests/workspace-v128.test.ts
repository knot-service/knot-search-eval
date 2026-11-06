import {test} from 'node:test';
import assert from 'node:assert/strict';
import raw from '../data/workspace-458-dataset.json';
import {DatasetSchema} from '../lib/schema';
import {sharedCaseReadiness} from '../lib/local-cases';
import {workspaceV128,v128Ids} from '../lib/workspace-v128';
test('문서 생성 시점 사례는 정해진 시각과 실제 생성 실행 조건을 연결한다',()=>{
 const source=DatasetSchema.parse(raw),next=workspaceV128(source);
 for(const id of v128Ids){const item=next.cases.find(c=>c.id===id);assert.ok(item);assert.equal(item.executionFixture,'document_after_intake');assert.ok(item.evaluationTime);assert.equal(sharedCaseReadiness(item,new Date(),'correct').ready,true);assert.equal(sharedCaseReadiness(item,new Date(),'hold').ready,false);}
});
