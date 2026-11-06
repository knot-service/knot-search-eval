import {DatasetSchema,type Dataset} from './schema';
export const v129Ids=new Set(['S43-01','S43-02','S43-03','S56-01','S56-02','S56-03']);
export function workspaceV129(source:Dataset):Dataset {
 return DatasetSchema.parse({...source,version:'1.29',cases:source.cases.map(item=>{
  if(!v129Ids.has(item.id))return item;
  if(item.scenario==='S56')return {...item,evaluationTime:'2026-06-30T03:00:00.000Z',executionFixture:'limited_context',executionHoldReason:undefined,setup:'서울 2026-06-30 기준. 평가 모드에서 문서 후보를 2191·2192 순으로 지정하고 입력 한도를 6,000자로 설정해 2191만 전달되도록 재현한다. 토큰 한도는 아니다.'};
  return {...item,executionFixture:'limited_context',executionHoldReason:undefined,setup:'평가 모드에서 접근 가능한 자료 후보를 최신순으로 지정하고 입력 한도를 6,000자로 설정한다. 질문에는 기간이나 관심 주제가 없다. 토큰 한도는 아니다.'};
 })});
}
