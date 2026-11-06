import { DatasetSchema, type Dataset } from './schema';

const october29 = ['S62-01','S62-02'];
const november02 = ['S20-01','S20-02','S20-03','S66-01','S66-02','S66-03','S76-01','S76-02'];
export const v123Ids = new Set([...october29,...november02]);

export function workspaceV123(source:Dataset):Dataset {
 return DatasetSchema.parse({...source,version:'1.23',cases:source.cases.map((item) => {
  if (!v123Ids.has(item.id)) return item;
  const evaluationTime = october29.includes(item.id) ? '2026-10-29T03:00:00.000Z' : '2026-11-02T03:00:00.000Z';
  return {...item,evaluationTime,executionHoldReason:undefined};
 })});
}
