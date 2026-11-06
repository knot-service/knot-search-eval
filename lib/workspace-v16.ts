import {DatasetSchema,type Dataset} from './schema';
export const v16Ids=new Set(['C04-01','C04-02','C07-01','C07-02','C07-03']);
export function workspaceV16(source:Dataset):Dataset {
 const cases=source.cases.map(c=>v16Ids.has(c.id)?{...c,executionHoldReason:undefined}:c);
 return DatasetSchema.parse({...source,version:'1.6',cases});
}
