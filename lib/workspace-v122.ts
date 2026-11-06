import { DatasetSchema, type Dataset } from './schema';

export const v122Ids = new Set(['S15-01','S15-02','S15-03']);

export function workspaceV122(source:Dataset):Dataset {
 return DatasetSchema.parse({...source,version:'1.22',cases:source.cases.map((item) => {
  if (!v122Ids.has(item.id)) return item;
  const history = item.history.length % 2 === 0 ? item.history : [...item.history,{role:'assistant',content:'문서에는 카드 결제를 먼저 지원하기로 했다고 적혀 있어요.'}];
  return {...item,history,expectedType:'conversation',expectedEvidenceIds:[],executionFixture:'no_search_observation',executionHoldReason:undefined};
 })});
}
