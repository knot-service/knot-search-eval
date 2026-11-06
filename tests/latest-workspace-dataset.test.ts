import {test} from 'node:test';
import assert from 'node:assert/strict';
import {latestWorkspaceDataset} from '../lib/latest-workspace-dataset';
test('워크스페이스 최신 평가셋을 숫자 버전으로 찾는다',()=>{
 const data=[{id:'knot-workspace-458',version:'1.9'},{id:'other',version:'99.0'},{id:'knot-workspace-458',version:'1.10'},{id:'knot-workspace-458',version:'draft'}];
 assert.equal(latestWorkspaceDataset(data)?.version,'1.10');
 assert.equal(latestWorkspaceDataset([]),undefined);
});
