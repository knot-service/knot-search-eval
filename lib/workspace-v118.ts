import { DatasetSchema, type Dataset } from './schema';

export const v118Ids = new Set(['S19-01', 'S19-02', 'S19-03', 'S71-01', 'S71-02', 'S71-03']);

/** Preserve the separate session and JWT records as potential sources of confusion. */
export function workspaceV118(source: Dataset): Dataset {
 const documents = source.cases.flatMap((item) => item.documents);
 return DatasetSchema.parse({
  ...source,
  version: '1.18',
  cases: source.cases.map((item) => {
   if (!v118Ids.has(item.id)) return item;
   const additionalId = item.scenario === 'S19' ? 'document-2209' : 'document-2161';
   const additional = documents.find((document) => document.id === additionalId);
   if (!additional) throw new Error(`공통 문서 ${additionalId}를 찾을 수 없습니다.`);
   return {
    ...item,
    documents: item.documents.some((document) => document.id === additionalId) ? item.documents : [...item.documents, additional],
    setup: `${item.setup ?? ''} 다른 종류의 세션 또는 JWT 기록도 공통 공간에 존재한다.`,
    executionHoldReason: undefined,
   };
  }),
 });
}
