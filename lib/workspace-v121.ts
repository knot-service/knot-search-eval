import { DatasetSchema, type Dataset } from './schema';

export const v121Ids = new Set(['S02-01','S02-02','S02-03']);

export function workspaceV121(source:Dataset):Dataset {
 return DatasetSchema.parse({...source,version:'1.21',cases:source.cases.map((item) => {
  if (!v121Ids.has(item.id)) return item;
  return {...item,executionFixture:'transcript_exclusion',executionHoldReason:undefined};
 })});
}
