import {DatasetSchema,type Dataset} from './schema';
const scenarios=new Set(['S13','S27','S42','S44','S61']);
export const v114Ids=new Set([...scenarios].flatMap(s=>[1,2,3].map(n=>`${s}-0${n}`)));
export function workspaceV114(source:Dataset):Dataset{
 const cases=source.cases.map(c=>v114Ids.has(c.id)?{...c,executionHoldReason:undefined}:c);
 return DatasetSchema.parse({...source,version:'1.14',cases});
}
