import { DatasetSchema, type Dataset } from './schema';

export const v117Ids = new Set(['C06-01', 'C06-02']);

/** The preceding assistant turn is synthetic and explicitly part of the fixture. */
export function workspaceV117(source: Dataset): Dataset {
 return DatasetSchema.parse({
  ...source,
  version: '1.17',
  cases: source.cases.map((c) => {
   if (!v117Ids.has(c.id)) return c;
   return {
    ...c,
    setup: '직전 질문은 모델 버전이며, assistant의 확인 응답은 실험용 합성 대화다.',
    history: [...c.history, {role:'assistant', content:'모델 버전을 문서에서 확인해 볼게요.'}],
    executionHoldReason: undefined,
   };
  }),
 });
}
