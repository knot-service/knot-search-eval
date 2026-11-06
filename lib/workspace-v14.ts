import {DatasetSchema,type Dataset,type EvalCase} from './schema';
export const v14Ids = new Set(['S52-01','S52-02','S53-01','S53-02','S59-01','S59-02','S59-03','S67-01','S67-02','C07-01','C07-02','C07-03','C04-01','C04-02']);
export function workspaceV14(source: Dataset): Dataset {
 const cases=source.cases.map((original)=>{
  let c:EvalCase={...original};
  if(!v14Ids.has(c.id)) return c;
  if(c.scenario==='S52') c={...c,expectedBehavior:'세션 만료 관련 저장 문서를 찾고 확인된 재인증 방침을 설명한다. 만료 시간이나 모바일 적용을 추정하지 않고 필요하면 관심 조건을 확인한다.'};
  if(c.scenario==='S53') c={...c,expectedBehavior:'반복된 표현을 정리해 인터뷰 관련 문서를 찾는다. 어느 인터뷰인지 특정할 수 없다면 찾은 후보를 안내하거나 대상을 되묻고 단일 문서로 단정하지 않는다.'};
  if(c.scenario==='S59') c={...c,setup:'기록은 배포 일정 정정만 명시하며 질문의 출시와 같은지 불명확함',expectedBehavior:'문서에는 11월 1일 배포 제안이 폐기되고 11월 3일 배포가 확정됐다고 설명하되, 이 배포가 질문의 출시와 같은지 문서만으로 단정하지 않고 필요하면 되묻는다.'};
  if(c.scenario==='S67') c={...c,history:[{role:'user',content:'결제 오류 수정 논의는 어땠어?'},{role:'assistant',content:'결제 오류의 현황과 수정 담당자를 논의한 기록이 있어요.'}],setup:'직전 대화가 결제 오류 수정 업무를 가리킴',expectedBehavior:'문서에서 현황 발표자 준호와 결제 오류 수정 담당자 민지를 구분한다.'};
  if(c.scenario==='C07') c={...c,history:[...c.history,{role:'assistant',content:'회의록에는 세션이 만료되면 다시 인증하는 방침을 확정했다고 적혀 있어요.'}],expectedBehavior:'바로 앞 설명을 쉬운 말로 다시 설명한다. 문서에 없는 만료 시간과 모바일 적용 여부는 추측하지 않는다.',executionHoldReason:'이전 답변의 설명 요청을 재현하는 실행 조건 확인 필요'};
  if(c.scenario==='C04') c={...c,history:[{role:'user',content:'탐색 답변 장애 회고에서 무슨 일이 있었어?'},{role:'assistant',content:'일부 요청에서 탐색 답변이 실패한 장애 회고가 있어요.'}],setup:'직전 대화가 특정 탐색 답변 장애 회고를 가리킴',expectedBehavior:'그 장애 회고에서 관측된 문맥 입력 한도 초과를 해당 사례의 원인으로 설명하고, 모든 장애의 원인이나 없는 오류 코드는 단정하지 않는다.',executionHoldReason:'특정 회고를 지칭하는 후속 질문의 실행 조건 확인 필요'};
  return c;
 });
 return DatasetSchema.parse({...source,version:'1.4',cases});
}
