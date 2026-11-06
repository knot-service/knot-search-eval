import {DatasetSchema,type Dataset,type EvalCase} from './schema';
export const v15Ids=new Set(['S50-01','S50-02','S55-01','S55-02','S55-03','S59-01','S59-02','S59-03']);
export function workspaceV15(source:Dataset):Dataset {
 const cases=source.cases.map((old)=>{
  let c:EvalCase={...old};
  if(!v15Ids.has(c.id)) return c;
  if(c.scenario==='S50') c={...c,setup:'서버 접수 시각은 서울 2026-11-02 12:00. 그 시각까지 생성된 문서 중 2184가 가장 최근이며 회의 시각과 문서 생성 시각의 순서가 다름',expectedBehavior:'회의 시작 시각이 아닌 문서 생성 시각을 기준으로 가장 최신인 2184를 안내한다.',executionHoldReason:'질문 접수 시각을 2026-11-02로 고정하는 실행 조건 미구현'};
  if(c.scenario==='S55') c={...c,setup:'서버 접수 시각은 서울 2026-10-06 12:00. 10월 5일에 시작한 회의의 문서가 없고 그 전에 작성된 다른 문서는 있다.',documents:[],expectedEvidenceIds:[],expectedBehavior:'서울 시간 기준 어제인 10월 5일에 시작한 회의의 문서를 확인할 수 없다고 안내하고 다른 날짜 회의를 어제로 제시하지 않는다.',executionHoldReason:'질문 접수 시각을 2026-10-06으로 고정하는 실행 조건 미구현'};
  if(c.id==='S59-01'||c.id==='S59-02') c={...c,question:c.id==='S59-02'?'혹시 배포 일정 조정 회의에서 최종 배포 날짜는 언제야?':'배포 일정 조정 회의에서 최종 배포 날짜는 언제야?',setup:'배포 일정 조정 기록에 이전 제안과 최종 결정이 명시됨',expectedBehavior:'초기 제안 11월 1일은 폐기됐고 11월 3일을 배포일로 확정했다고 구분한다. 문서에 없는 제품이나 연도는 추측하지 않는다.'};
  if(c.id==='S59-03') c={...c,setup:'질문의 출시 대상이 불명확하며 배포 일정 기록이 그 출시와 같은지 명시되지 않음',expectedType:'clarify',expectedEvidenceIds:[],expectedBehavior:'어떤 제품이나 기능의 출시인지 먼저 되묻고, 배포 일정을 질문한 출시일로 단정하지 않는다.'};
  return c;
 });return DatasetSchema.parse({...source,version:'1.5',cases});
}
