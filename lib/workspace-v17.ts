import {DatasetSchema,type Dataset,type EvalCase} from './schema';
export const v17Ids=new Set(['C01-01','C01-02','C01-03','C08-01','C08-02','C08-03','S67-03','S04-03','S50-03','S52-03','S53-03']);
export function workspaceV17(source:Dataset):Dataset {
 const cases=source.cases.map(old=>{
  let c:EvalCase={...old};if(!v17Ids.has(c.id)) return c;
  if(c.scenario==='C01') c={...c,history:[{role:'user',content:'우리 프로젝트의 Spring Boot 버전은?'},{role:'assistant',content:'Knot의 Spring Boot 버전이 3이라고 알고 있어요.'}],setup:'직전 답변에서 Knot의 Spring Boot 버전을 말했고 사용자가 4라고 정정함',documents:[],expectedEvidenceIds:[],expectedType:'conversation',expectedBehavior:'4가 Knot의 Spring Boot 버전에 대한 사용자 정정임을 이해하고 정정을 받아들인다. 사용자 발언만으로 실제 버전이 검증됐다고 주장하지 않는다.',executionHoldReason:'사용자 정정에 대한 대화 응답의 실행 지원 준비 중'};
  if(c.scenario==='C08') c={...c,history:[{role:'user',content:'회의 날짜와 문서 생성일 차이가 뭐야?'},{role:'assistant',content:'회의가 시작한 시각과 문서가 생성된 시각은 다를 수 있어요.'}],setup:'두 날짜의 차이를 논의한 뒤 사용자가 생성일 전달을 제안함',documents:[],expectedEvidenceIds:[],expectedType:'conversation',expectedBehavior:'문서 생성 시각도 함께 전달하자는 제안을 이해하고, 어느 단계에 전달할지 명확하지 않으면 확인한다. 제안이 이미 구현되거나 확정됐다고 주장하지 않는다.',executionHoldReason:'변경 제안에 대한 대화 응답의 실행 지원 준비 중'};
  if(c.id==='S67-03') c={...c,setup:'이전 대화가 없어 이 일이 무엇을 가리키는지 알 수 없음',expectedType:'clarify',expectedEvidenceIds:[],expectedBehavior:'어떤 업무의 담당자를 묻는지 되묻고 특정 회의나 사람을 추측하지 않는다.',executionHoldReason:'대상 미상의 되묻기 실행 지원 준비 중'};
  if(c.id==='S04-03') c={...c,setup:'스크린리더 관련 로그인 오류의 담당자가 공통 문서에서 확인되지 않음',expectedBehavior:'스크린리더 오류 수정 담당자는 저장 문서에서 확인할 수 없다고 안내한다. 일반 로그인 오류나 버튼 접근성 담당자를 해당 업무 담당자로 단정하지 않는다.'};
  if(c.id==='S50-03') c={...c,setup:'공통 문서에 쿠버네티스 배포 설정 관련 회의 기록이 없음',expectedBehavior:'해당 주제의 문서를 확인할 수 없다고 안내한다. 일반 컨테이너 저장 공간 논의를 쿠버네티스 배포 설정으로 단정하지 않는다.'};
  if(c.id==='S52-03') c={...c,question:'스마트워치에서 세션이 만료되면 재인증하기로 했어?',setup:'공통 문서에 스마트워치 재인증 방침이 없음',expectedBehavior:'스마트워치에 적용할 재인증 방침은 저장 문서에서 확인할 수 없다고 안내한다. 일반 세션 방침을 해당 기기에 적용한다고 단정하지 않는다.',executionHoldReason:undefined};
  if(c.id==='S53-03') c={...c,question:'XR 헤드셋 인터뷰 문서 찾아줘, 인터뷰 그 인터뷰 문서 좀 찾아줘.',setup:'공통 문서에 XR 헤드셋 인터뷰 기록이 없음',expectedBehavior:'반복 표현을 정리하고 XR 헤드셋이라는 조건을 유지한다. 해당 인터뷰 문서를 확인할 수 없다고 안내한다.',executionHoldReason:undefined};
  return c;
 });return DatasetSchema.parse({...source,version:'1.7',cases});
}
