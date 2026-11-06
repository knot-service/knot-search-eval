import { DatasetSchema, type Dataset } from './schema';

export const v124Ids = new Set(['S74-01', 'S74-02', 'S74-03']);

export function workspaceV124(source: Dataset): Dataset {
  return DatasetSchema.parse({
    ...source,
    version: '1.24',
    cases: source.cases.map((item) => {
      if (!v124Ids.has(item.id)) return item;
      return {
        ...item,
        setup: `${item.setup}; 내부 결재 문서 2211과 카드 결제 승인 문서 2212가 모두 접근 가능함`,
        executionHoldReason: undefined,
      };
    }),
  });
}
