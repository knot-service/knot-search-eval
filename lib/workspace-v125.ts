import { DatasetSchema, type Dataset } from './schema';

export const v125Ids = new Set(['S37-01','S37-02','S37-03','S38-01','S38-02','S38-03','S62-03']);

export function workspaceV125(source: Dataset): Dataset {
  return DatasetSchema.parse({ ...source, version:'1.25', cases:source.cases.map((item) => {
    if (!v125Ids.has(item.id)) return item;
    return { ...item, evaluationTime:item.scenario === 'S62' ? '2026-10-29T03:00:00.000Z' : '2026-11-02T03:00:00.000Z', executionFixture:'no_document_recording', executionHoldReason:undefined };
  })});
}
