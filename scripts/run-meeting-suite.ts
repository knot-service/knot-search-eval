import { readFile, appendFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { DatasetSchema } from "../lib/schema";
import { caseReadiness } from "../lib/local-cases";
const base="http://127.0.0.1:3000";
const out="/Users/yongtae/Desktop/knot/backend/resume/search-eval/meeting-fixtures";
async function main(){
 const password=process.env.ADMIN_PASSWORD;
 if(!password)throw new Error("평가 어드민 로그인이 필요합니다.");
 const dataset=DatasetSchema.parse(JSON.parse(await readFile("data/synthetic-meeting-dataset.json","utf8")));
 const selected=dataset.cases.filter((c)=>caseReadiness(c).ready);
 const login=await fetch(`${base}/api/login`,{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({password})});
 if(!login.ok)throw new Error("평가 어드민 로그인 실패");
 const cookie=login.headers.getSetCookie().map((x)=>x.split(";")[0]).join("; ");
 await mkdir(out,{recursive:true});
 const log=`${out}/suite-${new Date().toISOString().replace(/[:.]/g,"-")}.jsonl`;
 let completed=0;let failed=0;
 for(const [index,c] of selected.entries()){
  let status="request_failed"; let duration:number|null=null;
  try {
   const res=await fetch(`${base}/api/local-experiment`,{method:"POST",headers:{origin:base,cookie,"content-type":"application/json"},body:JSON.stringify({caseId:c.id,dataset:"meetings"}),signal:AbortSignal.timeout(150_000)});
   if(res.ok){const data=z.object({runs:z.array(z.object({results:z.array(z.object({caseId:z.string(),status:z.string(),latencyMs:z.number().nullable()}))}))}).parse(await res.json());const item=data.runs.at(-1)?.results[0];if(item?.caseId===c.id){status=item.status;duration=item.latencyMs;}}
   else status=`http_${res.status}`;
  } catch { status="transport_failed"; }
  if(status==="completed")completed++;else failed++;
  await appendFile(log,JSON.stringify({caseId:c.id,status,duration})+"\n",{mode:0o600});
  console.log(`${index+1}/${selected.length} ${c.id} ${status}`);
 }
 console.log(JSON.stringify({total:dataset.cases.length,attempted:selected.length,completed,failed,pending:dataset.cases.length-selected.length,log}));
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:"실험 실패");process.exitCode=1});
