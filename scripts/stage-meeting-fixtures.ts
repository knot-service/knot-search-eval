import { readFile } from "node:fs/promises";
import { DatasetSchema } from "../lib/schema";
import { stageLocalCase } from "../lib/local-spring";
async function main() {
  const dataset=DatasetSchema.parse(JSON.parse(await readFile("data/synthetic-meeting-dataset.json","utf8")));
  let staged=0; let failures=0;
  for(const c of dataset.cases) {
    try { await stageLocalCase(c); staged++; console.log(`${staged+failures}/${dataset.cases.length} ${c.id} 문서 준비`); }
    catch(e) { failures++; console.error(`${staged+failures}/${dataset.cases.length} ${c.id} 실패: ${e instanceof Error ? e.message : "알 수 없음"}`); }
  }
  console.log(JSON.stringify({staged,failures,total:dataset.cases.length}));
  if(failures) process.exitCode=1;
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:"적재 실패");process.exitCode=1});
