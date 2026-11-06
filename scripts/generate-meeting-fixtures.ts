import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { z } from "zod";
import full from "../data/synthetic-full-dataset.json";

const root="/Users/yongtae/Desktop/knot/backend";
const out=`${root}/resume/search-eval/meeting-fixtures`;
const Candidate=z.object({title:z.string().min(1),summary:z.string().nullable(),content:z.string().min(1)}).strict();
const Judge=z.object({supported:z.boolean(),reason:z.string()});
const Entry=z.object({key:z.string(),source:z.string(),candidate:Candidate.optional(),review:z.enum(["pending","automatic_pass","automatic_hold","generation_failed"]),reason:z.string().optional()});
type Item=z.infer<typeof Entry>;
const sources=[...new Map(full.cases.flatMap((c)=>c.documents.map((d)=>[d.content,{source:d.content,topic:d.content.slice(0,100)}] as const))).values()];
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
for(const source of extras) if(!sources.some(x=>x.source===source)) sources.push({source,topic:source.slice(0,100)});
const main=async()=>{
 await mkdir(out,{recursive:true});
 const system=await readFile(`${root}/src/main/resources/llm/document/generation-system.txt`,"utf8");
 const template=await readFile(`${root}/src/main/resources/llm/document/generation-template.md`,"utf8");
 const schema=JSON.parse(await readFile(`${root}/src/main/resources/llm/document/generation-schema.json`,"utf8"));
 const prompt=system+"\n[Markdown 템플릿]\n"+template;
 const promptHash=createHash("sha256").update(prompt+JSON.stringify(schema)+String(process.env.LLM_MODEL)).digest("hex");
 const path=`${out}/generation-${promptHash.slice(0,12)}.json`;
 let items:Item[]=[];
 try {items=z.array(Entry).parse(JSON.parse(await readFile(path,"utf8")));} catch(e){if(!(e instanceof Error && "code" in e && e.code==="ENOENT")) throw e;}
 const completion=async(messages:ReadonlyArray<{role:string;content:string}>,jsonSchema:unknown,name:string)=>{
   const base=process.env.LLM_BASE_URL; const token=process.env.LLM_API_TOKEN;const model=process.env.LLM_MODEL;
   if(!base || !token || !model) throw new Error("모델 설정 누락");
   const r=await fetch(new URL("/v1/chat/completions",base),{method:"POST",signal:AbortSignal.timeout(180000),headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({model,stream:false,temperature:0.2,top_p:0.9,top_k:20,repeat_penalty:1,max_tokens:4096,messages,response_format:{type:"json_schema",json_schema:{name,strict:true,schema:jsonSchema}},reasoning:"off",chat_template_kwargs:{enable_thinking:false}})});
   if(!r.ok)throw new Error(`모델 HTTP ${r.status}`);
   const data=z.object({choices:z.array(z.object({message:z.object({content:z.string()})})).min(1)}).parse(await r.json());
   return JSON.parse(data.choices[0].message.content);
 };
 let next = 0;
 let saveQueue = Promise.resolve();
 async function worker() {
  for (;;) {
   const index = next++;
   if(index >= sources.length) return;
   const item = sources[index];
   const key=createHash("sha256").update(item.source).digest("hex");
   const previous = items.find((e)=>e.key===key);
   if(previous?.review === "automatic_pass")continue;
   let result:Item={key,source:item.source,review:"generation_failed"};
   try {
     const candidate=Candidate.parse(await completion([{role:"system",content:prompt},{role:"user",content:JSON.stringify({transcriptText:item.source,topic:item.topic})}],schema,"document_generation"));
     if(!candidate.content.startsWith("## 핵심 요약") || /https?:\/\/|mailto:|www\./i.test(`${candidate.title} ${candidate.summary??""} ${candidate.content}`)) throw new Error("형식 검증 실패");
     const sections=[...candidate.content.matchAll(/^##\s+(.+)$/gm)].map((m)=>m[1]);
     const fixed=["결정","보류","미결정","할 일"];
     let previous=-1;let extra=false;
     if(new Set(sections).size!==sections.length)throw new Error("중복 섹션");
     for(const section of sections.slice(1)){const index=fixed.indexOf(section);if(index<0){extra=true;continue}if(extra||index<=previous)throw new Error("섹션 순서 오류");previous=index;}
     const numbers=(s:string)=>s.match(/\d+(?:[.,]\d+)*/g)??[];
     const originalNumbers=new Set(numbers(item.source));
     if(numbers(`${candidate.title} ${candidate.summary??""} ${candidate.content}`).some((n)=>!originalNumbers.has(n))) throw new Error("원문에 없는 숫자");
     result={key,source:item.source,candidate,review:"pending"};
     const verdict=Judge.parse(await completion([{role:"system",content:"당신은 합성 회의 문서의 사실 보존을 검수합니다. 원문에 없는 구체적 결정, 사람, 날짜, 이유, 조건을 문서가 추가하거나 원문의 중요한 조건과 미확정 여부를 바꾸면 supported=false입니다. 원문의 핵심 사실을 생략해도 false입니다. 문체 차이와 요약은 허용합니다. JSON supported, reason만 출력하세요."},{role:"user",content:JSON.stringify({source:item.source,document:candidate})}],{type:"object",properties:{supported:{type:"boolean"},reason:{type:"string"}},required:["supported","reason"],additionalProperties:false},"fixture_review"));
     result={...result,review:verdict.supported?"automatic_pass":"automatic_hold",reason:verdict.reason};
   } catch(e){ result={...result,reason:e instanceof Error ? e.message.slice(0,200):"생성 실패"}; }
   if (previous) {
     await writeFile(`${out}/retry-${key.slice(0,12)}.json`,JSON.stringify({previous,result},null,2),{mode:0o600});
     const oldIndex = items.findIndex((entry)=>entry.key===key);
     items[oldIndex]=result;
   } else items.push(result);
   const snapshot=JSON.stringify(items,null,2);
   saveQueue = saveQueue.then(async()=>{await writeFile(`${path}.tmp`,snapshot,{mode:0o600});await rename(`${path}.tmp`,path);});
   await saveQueue;
   console.log(`${items.length}/${sources.length} ${result.review}`);
  }
 }
 await Promise.all([worker(),worker()]);
 const stats=Object.groupBy(items,(x)=>x.review);
 console.log(JSON.stringify({promptHash,total:sources.length,counts:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v?.length??0])),checkpoint:path}));
};
main().catch((e:unknown)=>{console.error(e instanceof Error?e.message:"생성 작업 실패");process.exitCode=1});
