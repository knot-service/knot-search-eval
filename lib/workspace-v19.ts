import {DatasetSchema,type Dataset,type EvalCase} from './schema';
export const v19Ids=new Set(['S01-03','S06-03','S08-03','S12-03','S14-03','S22-03','S65-03','S73-03']);
export function workspaceV19(source:Dataset):Dataset{
 const cases=source.cases.map(old=>{
  let c:EvalCase={...old};if(!v19Ids.has(c.id))return c;
  if(c.id==='S01-03') c={...c,question:'결제 기능 회의에서 가상화폐 결제는 어떻게 하기로 결정했어?',setup:'공통 문서에는 결제 기능 관련 기록은 있지만 가상화폐 결제 결정 기록은 없음',expectedBehavior:'가상화폐 결제 결정은 문서에서 확인할 수 없다고 안내한다. 카드 결제 결정을 가상화폐 결정으로 바꾸어 말하지 않는다.',executionHoldReason:undefined};
  if(c.id==='S06-03') c={...c,question:'쿠버네티스 배포는 언제까지 하기로 했어?',setup:'공통 문서에 쿠버네티스 배포 일정 기록은 없음',expectedBehavior:'쿠버네티스 배포 완료 일정은 확인할 수 없다고 안내하고, 일반 배포 기록의 날짜를 적용하지 않는다.',executionHoldReason:undefined};
  if(c.id==='S08-03') c={...c,history:[{role:'user',content:'정기 결제 기능은 어떻게 하기로 했어?'},{role:'assistant',content:'정기 결제에 관한 결정은 확인하지 못했어요.'}],setup:'이전 대화의 대상은 정기 결제이며 그 담당자 기록은 없음',expectedBehavior:'이전 대화의 정기 결제 맥락을 유지하고 담당자를 확인할 수 없다고 안내한다. 다른 결제 업무 담당자를 정기 결제 담당자로 단정하지 않는다.',executionHoldReason:undefined};
  if(c.id==='S12-03') c={...c,history:[{role:'user',content:'결제 일정은?'},{role:'assistant',content:'결제 일정에 관한 기록을 찾아볼게요.'}],question:'그럼 지문 로그인 담당자는?',setup:'기존 결제 주제에서 지문 로그인 담당자로 주제를 전환하며, 해당 담당자 기록은 없음',expectedBehavior:'주제 변경을 반영해 지문 로그인 담당자를 확인할 수 없다고 안내한다. 결제 업무 담당자를 이어 쓰지 않는다.',executionHoldReason:'주제 전환 후속 질문의 실행 조건 준비 중'};
  if(c.id==='S14-03') c={...c,question:'아니, 정기 결제 환불 담당자 말한 거야.',setup:'이전 답변의 결제 담당자에서 정기 결제 환불 담당자로 대상을 정정함. 해당 담당자 기록은 없음',expectedBehavior:'사용자가 대상을 정정한 것을 반영해 정기 결제 환불 담당자를 확인할 수 없다고 안내한다. 기존 결제 담당자를 그대로 답하지 않는다.',executionHoldReason:undefined};
  if(c.id==='S22-03') c={...c,question:'손가락으로 로그인해서 오래 쓰다 풀리는 문제는 어떻게 하기로 했어?',setup:'질문의 손가락 인증은 지문 로그인 방식이지만 공통 문서에 해당 방식 정책은 없음',expectedBehavior:'일반 로그인이나 세션 재인증 방침을 지문 로그인 정책으로 단정하지 않고, 해당 방식의 정책은 확인할 수 없다고 안내한다.',executionHoldReason:undefined};
  if(c.id==='S65-03') c={...c,question:'정기 결제 자동 환불 결정이 뭐야?',setup:'다른 결제 취소 및 환불 문서는 있지만 정기 결제 자동 환불 결정 기록은 없음',expectedBehavior:'정기 결제 자동 환불 결정을 확인할 수 없다고 안내한다. 일반 환불이나 결제 취소 논의를 해당 결정으로 바꾸지 않는다.',executionHoldReason:undefined};
  if(c.id==='S73-03') c={...c,question:'지문로그인 자동로그아웃정첵 어떻게 됐어?',setup:'자동 로그아웃 문서는 있지만 지문 로그인에 관한 기록은 없음',expectedBehavior:'오타를 해석하면서 지문 로그인 조건을 유지한다. 그 조건에 맞는 정책을 문서에서 확인할 수 없다고 안내한다.',executionHoldReason:undefined};
  return c;
 });return DatasetSchema.parse({...source,version:'1.9',cases});
}
