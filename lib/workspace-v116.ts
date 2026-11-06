import {DatasetSchema,type Dataset} from './schema';
export const v116Ids=new Set(['S23-03','S26-01','S26-02','S26-03','S67-03','S12-03','S50-03','S35-01','S35-02','S35-03','C01-01','C01-02','C01-03','C06-03','C08-01','C08-02','C08-03','C05-01','C05-02','C05-03','C04-03']);
export function workspaceV116(source:Dataset):Dataset{
 return DatasetSchema.parse({...source,version:'1.16',cases:source.cases.map(c=>v116Ids.has(c.id)?{...c,executionHoldReason:undefined}:c)});
}
