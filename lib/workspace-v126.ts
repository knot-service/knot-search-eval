import { DatasetSchema, type Dataset } from './schema';

export const v126Ids = new Set(['S46-01','S46-02']);
const ids = ['document-2180','document-2181','document-2199'];

export function workspaceV126(source: Dataset): Dataset {
  const docs = new Map(source.cases.flatMap((item) => item.documents).map((doc) => [doc.id, doc]));
  const expected = ids.map((id) => {
    const doc = docs.get(id);
    if (!doc) throw new Error(`기대 문서를 찾을 수 없습니다: ${id}`);
    return doc;
  });
  return DatasetSchema.parse({ ...source, version:'1.26', cases:source.cases.map((item) => {
    if (!v126Ids.has(item.id)) return item;
    return {...item, documents:expected, expectedEvidenceIds:ids, evaluationTime:'2026-10-29T03:00:00.000Z',
      setup:'서울 2026-10-29 12:00 접수. 10월 28일 시작하고 접수 이전에 생성된 회의 문서 2180·2181·2199가 있다. 정상 조회 조건이며 입력 한도 실패는 별도 평가한다.',
      expectedBehavior:'서울 시간 기준 10월 28일 시작한 세 회의의 기록을 각각 구분해 요약하고, 다른 날짜 회의를 섞지 않는다. 각 내용은 해당 문서를 근거로 설명한다.', executionHoldReason:undefined};
  })});
}
