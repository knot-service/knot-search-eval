import {DatasetSchema,type Dataset,type EvalCase} from './schema';
export const v113Ids=new Set(['S04-01','S04-02','S05-01','S05-02','S05-03','C09-03']);
export function workspaceV113(source:Dataset):Dataset{
 const all=source.cases.flatMap(c=>c.documents);const find=(id:string)=>{const d=all.find(x=>x.id===id);if(!d)throw Error(`문서 ${id} 없음`);return d};
 const cases=source.cases.map(old=>{
  let c:EvalCase={...old};if(!v113Ids.has(c.id))return c;
  if(c.scenario==='S04') c={...c,question:c.id==='S04-02'?'혹시 1월 14일 로그인 오류 회의에서 수정 담당자는 누구야?':'1월 14일 로그인 오류 회의에서 수정 담당자는 누구야?',setup:'1월 14일 문서 2145에서 로그인 오류 수정 담당자로 민지를 지정함',expectedBehavior:'1월 14일 회의에서 수정 담당자로 민지를 지정했다고 문서 근거와 함께 설명한다. 다른 회의의 오류와 동일한지는 단정하지 않는다.'};
  if(c.scenario==='S05') c={...c,question:c.id==='S05-02'?'혹시 1월 17일 로그인 오류 회의에서 수정 담당자는 누구야?':'1월 17일 로그인 오류 회의에서 수정 담당자는 누구야?',setup:'1월 17일 문서 2146에서는 준호가 오류를 설명했고 수정 담당자는 정하지 않음. 1월 14일 문서 2145의 오류와 동일한지는 불명확함',expectedBehavior:'1월 17일 회의에서는 수정 담당자가 정해지지 않았다고 문서 근거와 함께 답한다. 설명자인 준호나 다른 회의의 민지를 이 회의의 담당자로 추측하지 않는다.',expectedType:'answer',expectedEvidenceIds:['document-2146'],executionHoldReason:undefined};
  if(c.id==='C09-03') c={...c,setup:'직전 답변은 근거를 찾지 못했지만 공통 문서 2222에는 2026년 9월 2일의 배포 기능 개발 현황이 있음',documents:[find('document-2222')],expectedEvidenceIds:['document-2222'],expectedType:'answer',expectedBehavior:'이전 질문의 배포 기능 맥락을 유지한다. 2026년 9월 2일 기록은 설계 완료·구현 중·최종 배포 미시작이라고 설명하고 현재 사용 가능 여부는 그 기록만으로 단정하지 않는다.',executionHoldReason:'이전 검색 실패 후 재검색과 과거 기록의 현재성 검증 준비 중'};
  return c;
 });return DatasetSchema.parse({...source,version:'1.13',cases});
}
