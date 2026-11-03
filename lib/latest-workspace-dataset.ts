/** Select the newest numeric workspace dataset without changing stored history. */
export function latestWorkspaceDataset<T extends {id:string;version:string}>(datasets: readonly T[]): T | undefined {
 let latest: T | undefined;
 let version: number[] = [];
 for (const dataset of datasets) {
  if (dataset.id !== 'knot-workspace-458' || !/^\d+(?:\.\d+)*$/.test(dataset.version)) continue;
  const parts=dataset.version.split('.').map(Number);
  const length=Math.max(parts.length,version.length);
  let newer=!latest;
  for(let i=0;latest && i<length;i++){
   const difference=(parts[i]??0)-(version[i]??0);
   if(difference!==0){newer=difference>0;break;}
  }
  if(newer){latest=dataset;version=parts;}
 }
 return latest;
}
