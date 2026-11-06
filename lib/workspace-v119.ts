import { DatasetSchema, type Dataset } from './schema';

const october29 = ['S09-01','S09-02','S09-03','S17-01','S17-02','S17-03','S46-03'];
const november02 = ['S11-01','S11-02','S11-03','S49-01','S49-02','S49-03','S50-01','S50-02','S76-03'];
const october06 = ['S55-01','S55-02','S55-03'];
export const v119Ids = new Set([...october29,...november02,...october06]);

export function workspaceV119(source: Dataset): Dataset {
 return DatasetSchema.parse({...source,version:'1.19',cases:source.cases.map((item) => {
  if (!v119Ids.has(item.id)) return item;
  let evaluationTime = '2026-11-02T03:00:00.000Z';
  if (october29.includes(item.id)) evaluationTime = '2026-10-29T03:00:00.000Z';
  if (october06.includes(item.id)) evaluationTime = '2026-10-06T03:00:00.000Z';
  let history = item.history;
  if (item.scenario === 'S11' && history.length % 2 !== 0) history = [...history,{role:'assistant',content:'1. 배포 안정성 및 절차 개선 논의(10월 1일), 2. 자동 배포 전환 및 일정(11월 1일)이 있어요.'}];
  return {...item,history,evaluationTime,executionHoldReason:undefined};
 })});
}
