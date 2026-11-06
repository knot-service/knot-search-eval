import {DatasetSchema,type Dataset} from './schema';
export const v128Ids=new Set(['S68-01','S68-02','S68-03']);
export function workspaceV128(source:Dataset):Dataset {
 return DatasetSchema.parse({...source,version:'1.28',cases:source.cases.map(item=>{
  if(!v128Ids.has(item.id))return item;
  const evaluationTime=item.id==='S68-03'?'2026-11-02T01:00:00.000Z':'2026-10-29T01:00:00.000Z';
  return {...item,evaluationTime,executionFixture:'document_after_intake',executionHoldReason:undefined};
 })});
}
