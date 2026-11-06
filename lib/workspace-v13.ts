import { DatasetSchema, type Dataset, type EvalCase } from './schema';

type Doc = EvalCase['documents'][number];
export const revisedIds = new Set(['S03-01','S03-02','S03-03','S04-03','S39-01','S39-02','S39-03','S50-03']);

/** Build a new snapshot; never change the source dataset or previous runs. */
export function workspaceV13(source: Dataset, docs: Map<string, Doc>, hash: string): Dataset {
  const second = docs.get('document-2175');
  if (!second) throw new Error('부분 결과의 두 번째 회의가 없습니다.');
  const cases = source.cases.map((original) => {
    let c: EvalCase = {...original, documents: original.documents.map((d) => docs.get(d.id) ?? d)};
    if (c.scenario === 'S03') c = {...c, executionHoldReason:undefined, setup:'10월 20일 목표를 이후 점검 회의가 다시 확인함', expectedBehavior:'두 기록이 같은 11월 목표를 설명한다고 답하고, 확정된 출시일은 없다고 구분한다.'};
    if (c.id === 'S04-03') c = {...c, question:'로그인 화면의 스크린리더 오류 수정 담당자는 누구야?', setup:'공통 문서에 해당 스크린리더 오류의 담당자 기록이 없음', documents:[], expectedEvidenceIds:[], executionHoldReason:undefined};
    if (c.scenario === 'S39') c = {...c, question:'이번 달 출시 후보 검토 회의 두 건의 결정을 요약해 줘.', setup:'질문 기준 시각은 서울 2026-04-20. 4월 11일 문서는 확인하고 4월 14일 문서 조회는 일시 장애와 재시도 실패로 확인하지 못함.', documents:[...c.documents, second], expectedEvidenceIds:['document-2174'], expectedBehavior:'확인된 4월 11일 회의의 출시 후보 검토 시작만 답하고, 4월 14일 회의는 조회 실패로 확인하지 못했다고 구분한다. 후보 검토 일정은 미정이다.', executionHoldReason:'기준 시각 고정과 두 번째 문서 조회 실패·재시도 실패 주입 미구현'};
    if (c.id === 'S50-03') c = {...c, question:'쿠버네티스 배포 설정 관련 문서 중 가장 최근 문서 보여줘.', setup:'공통 문서에 쿠버네티스 배포 설정 문서가 없음', documents:[], expectedEvidenceIds:[], executionHoldReason:'주제 조건이 있는 최신 문서 조회 실행 검증 필요'};
    return c;
  });
  return DatasetSchema.parse({...source, version:'1.3', corpusHash:hash, cases});
}
