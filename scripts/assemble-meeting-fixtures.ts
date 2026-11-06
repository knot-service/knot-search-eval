import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import full from "../data/synthetic-full-dataset.json";
import { DatasetSchema } from "../lib/schema";

const extras=[
 "사무실 실내 식물의 잎 상태를 살펴봤다. 식물 배치는 그대로 유지하기로 했다.",
 "공용 책장 정리 방법을 논의했다. 책 표지를 앞쪽으로 놓는 방식을 시험하기로 했다.",
 "사내 행사에서 제공할 차 종류를 검토했다. 녹차와 보리차를 준비하는 안을 논의했다.",
 "휴게 공간의 조명 밝기를 살펴봤다. 눈부심이 있는 위치를 다시 확인하기로 했다.",
 "공용 우산 보관함의 위치를 논의했다. 출입구 가까이에 두는 방안을 제안했다.",
 "워크숍에서 사용할 명찰 재질을 비교했다. 종이 명찰을 우선 검토하기로 했다.",
 "사무실 재활용 분리함의 표시를 살펴봤다. 표시를 읽기 쉽게 바꾸는 의견이 나왔다.",
 "사내 사진 공유 방법을 논의했다. 공유할 사진의 범위는 아직 정하지 않았다.",
 "행사장 좌석 배치의 가독성을 논의했다. 통로가 잘 보이게 배치하는 의견을 기록했다.",
 "공용 주방의 머그컵 정리 방식을 논의했다. 사용한 컵은 씻어서 제자리에 두기로 했다.",
 "사내 모임의 음악 음량을 검토했다. 대화가 잘 들리는 수준을 유지하기로 했다.",
 "공용 메모판의 배치 위치를 살펴봤다. 공간 사용을 방해하지 않는 쪽으로 옮기는 안을 제안했다.",
];
const Entry=z.object({key:z.string(),source:z.string(),candidate:z.object({title:z.string().min(1),summary:z.string().nullable(),content:z.string().min(1)}).optional(),review:z.enum(["pending","automatic_pass","automatic_hold","generation_failed"]),reason:z.string().optional()});
async function main(){
 const path=process.argv[2]; if(!path) throw new Error("생성 checkpoint 경로가 필요합니다.");
 const items=z.array(Entry).parse(JSON.parse(await readFile(path,"utf8")));
 const byKey=new Map(items.map((e)=>[e.key,e]));
 function materialize(source:string){
  const key=createHash("sha256").update(source).digest("hex");const found=byKey.get(key);
  if(!found) throw new Error(`생성 결과 누락: ${key.slice(0,12)}`);
  if(!found.candidate) return {title:"합성 회의 기록",summary:source,content:`## 핵심 요약\n${source}`,fixtureStatus:found.review,fixtureSource:source,fixtureReason:found.reason ?? "생성 실패"};
  const candidate = found.candidate;
  const unsupportedCertainty = /확정/.test(`${candidate.title} ${candidate.summary ?? ""} ${candidate.content}`) && !/(확정|결정|합의|정했|하기로)/.test(source);
  const links = /https?:\/\/|mailto:|www\.|!?\[[^\]\n]+\]\s*(?:\(|\[)/i.test(`${candidate.title} ${candidate.summary ?? ""} ${candidate.content}`);
  const emptySection = candidate.content.split(/^##\s+[^\n]+\n/gm).slice(1).some((part) => !part.trim() || /^(없음|해당 없음|내용 없음)[.!。]?$/.test(part.trim()));
  const flagged = unsupportedCertainty || links || emptySection;
  const status = flagged ? "automatic_hold" : found.review;
  const reason = flagged ? "원문에 없는 확정 표현 또는 문서 형식 확인 필요" : found.reason ?? "검수 필요";
  return {...candidate,fixtureStatus:status,fixtureSource:source,fixtureReason:reason};
 }
 const broadSources=[...new Map(full.cases.filter((c)=>/^S(?:0[1-9]|[1-7][0-9])$/.test(c.scenario)).flatMap((c)=>c.documents.filter((d)=>d.accessible !== false && !d.id.includes("-noise-")).map((d)=>[d.content,d] as const))).values()].slice(0,25);
 if(broadSources.length!==25)throw new Error("다량 자료 사례의 원문 수가 부족합니다.");
 const cases=full.cases.map((c)=>{
  const documents=c.documents.map((doc)=>({...doc,...materialize(doc.content)}));
  if(c.id === "S43-01") {
   for(const [i,doc] of broadSources.entries()) documents.push({id:`${c.id}-load-${String(i+1).padStart(2,"0")}`,...materialize(doc.content),workspaceId:"workspace-a",accessible:true});
  }
  if(documents.length){
   const seed=parseInt(createHash("sha256").update(c.id).digest("hex").slice(0,6),16)%extras.length;
   for(let i=0;i<2;i++){
    const source=extras[(seed+i*5)%extras.length];
    documents.push({id:`${c.id}-extra-${i+1}`,...materialize(source),workspaceId:"workspace-a",accessible:true});
   }
  }
  return {...c,documents};
 });
 const dataset=DatasetSchema.parse({id:"knot-meeting-fixtures",name:"회의록 형식 합성 실험 자료 · 검수 초안",version:"2.0",source:"synthetic",cases});
 const documentCount=dataset.cases.reduce((n,c)=>n+c.documents.length,0);
 if(documentCount!==878)throw new Error(`예상 문서 수와 다름: ${documentCount}`);
 await writeFile("data/synthetic-meeting-dataset.json",JSON.stringify(dataset)+"\n");
 console.log(JSON.stringify({cases:dataset.cases.length,documents:documentCount,empty:dataset.cases.filter((c)=>!c.documents.length).length,status:Object.fromEntries(["automatic_pass","automatic_hold","pending","generation_failed"].map((s)=>[s,dataset.cases.flatMap((c)=>c.documents).filter((d)=>d.fixtureStatus===s).length]))}));
}
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:"조립 실패");process.exitCode=1});
