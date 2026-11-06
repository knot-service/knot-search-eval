import { DatasetSchema, type Dataset } from './schema';

export const v120Ids = new Set(['S24-01','S24-02','S24-03','S30-01','S30-02','S30-03','S57-01','S57-02','S57-03']);

export function workspaceV120(source:Dataset):Dataset {
 return DatasetSchema.parse({...source,version:'1.20',cases:source.cases.map((item) => {
  if (!v120Ids.has(item.id)) return item;
  return {...item,executionFixture:'transcript_exclusion',executionHoldReason:undefined};
 })});
}
