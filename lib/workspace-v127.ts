import { DatasetSchema, type Dataset } from './schema';
export const v127Ids=new Set(['S64-01','S64-02','S64-03']);
export function workspaceV127(source:Dataset):Dataset {
 return DatasetSchema.parse({...source,version:'1.27',cases:source.cases.map(item=>{
  if(!v127Ids.has(item.id)) return item;
  return {...item,executionFixture:'privacy_observation',executionHoldReason:undefined};
 })});
}
