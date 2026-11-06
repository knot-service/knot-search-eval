import {DatasetSchema,type Dataset,type EvalCase} from './schema';
export const v115Ids=new Set(['S12-01','S12-02','S70-01','S70-02','S70-03','C02-01','C02-02','C02-03','C03-01','C03-02','C03-03','C09-01','C09-02','C09-03']);
export function workspaceV115(source:Dataset):Dataset{
 const cases=source.cases.map(old=>{
  let c:EvalCase={...old};if(!v115Ids.has(c.id))return c;
  if(c.scenario==='S12') c={...c,question:c.id==='S12-02'?'혹시 그럼 로그인 업무 담당자는?':'그럼 로그인 업무 담당자는?',history:[...c.history,{role:'assistant',content:'카드 결제는 11월 출시를 목표로 하지만 정확한 날짜는 미정이에요.'}],setup:'결제 일정에 관한 답변 이후 로그인 업무 담당자로 주제를 전환함',expectedBehavior:'로그인 업무 담당자 수아를 2155 근거로 답하고 이전 결제 담당자와 혼동하지 않는다.',executionHoldReason:undefined};
  if(c.scenario==='S70') c={...c,history:[...c.history,{role:'assistant',content:'문서에는 로그인 세션이 만료되면 재인증하기로 했다고 적혀 있어요.'}],setup:'직전 답변은 로그인 세션 만료 후 재인증이며 모바일 적용은 문서 2162에 미정으로 기록됨',expectedType:'answer',expectedEvidenceIds:['document-2162'],expectedBehavior:'로그인 세션 만료 맥락을 유지하고 모바일 적용은 기록상 미정임을 근거와 함께 설명한다.',executionHoldReason:undefined};
  if(c.scenario==='C02'&&c.id!=='C02-03') c={...c,history:[...c.history,{role:'assistant',content:'추론 지연을 분석한 회의 기록이 있어요.'}],setup:'이전 대화에서 추론 지연 분석을 다룸',expectedBehavior:'기록된 추론 지연 사례의 입력 처리 단계 병목을 2216 근거로 설명하고 다른 요청의 원인까지 단정하지 않는다.',executionHoldReason:undefined};
  if(c.id==='C02-03') c={...c,executionHoldReason:undefined};
  if(c.scenario==='C03') c={...c,history:[...c.history,{role:'assistant',content:'녹음 파일 업로드 처리에 관한 회의 기록이 있어요.'}],setup:'이전 대화가 녹음 파일 업로드 흐름을 가리킴',expectedBehavior:'오타를 해석하고 2217에 기록된 서버의 파일 수신·저장 흐름을 설명한다. 문서에 없는 프로토콜은 추측하지 않는다.',executionHoldReason:undefined};
  if(c.scenario==='C09'&&c.id!=='C09-03') c={...c,history:[...c.history,{role:'assistant',content:'배포 기능 개발 현황에 관한 회의 기록이 있어요.'}],setup:'이전 대화가 배포 기능의 구현 상태를 가리킴',expectedBehavior:'2026년 9월 2일 문서의 설계 완료, 구현 중, 최종 배포 미시작을 구분하고 그 뒤의 현재 사용 가능 여부는 단정하지 않는다.',executionHoldReason:undefined};
  if(c.id==='C09-03') c={...c,executionHoldReason:undefined};
  return c;
 });return DatasetSchema.parse({...source,version:'1.15',cases});
}
