import { test } from "node:test";
import assert from "node:assert/strict";
import { runFixedVerification } from "../lib/fixed-verification-experiment";
import { applyAction, comparable, emptyState } from "../lib/state";
import sample from "../data/synthetic-dataset.json";

const input = async () => ({hash:"fixture-hash", input:{datasetId:"knot-workspace-458" as const,datasetVersion:"1.30" as const,corpusHash:"corpus",cases:[{id:"S14-01",question:"담당자는?",history:[],documents:[{id:"2152",title:"환불",content:"담당자는 준호"}]}]}});
const supported = {answer:"담당자는 준호입니다",checks:[{claim:"담당자는 준호",evidenceIds:["2152"],verdict:"supported" as const,reason:"문서에 기록"}],missing:[]};
const result = (output: {answer:string;checks:{claim:string;evidenceIds:string[];verdict:"supported" | "unsupported" | "uncertain";reason:string}[];missing:string[]}) => ({output,inputTokens:10,outputTokens:5});

test("A records fixed input, one self-check and human review without claiming search ran", async () => {
  const run = await runFixedVerification("S14-01","A",async () => result(supported),input,"test-model");
  assert.equal(run.status,"completed");
  assert.equal(run.experiment?.stages.find((stage) => stage.id === "search")?.status,"not_applicable");
  assert.equal(run.experiment?.stages.filter((stage) => stage.id === "generation").length,1);
  assert.deepEqual(run.results[0].evidenceIds,["document-2152"]);
  let state = applyAction(emptyState(),{type:"import_dataset",data:{...sample,id:run.datasetId,version:run.datasetVersion}});
  state = applyAction(state,{type:"lock_dataset",id:run.datasetId,version:run.datasetVersion});
  const caseId = state.datasets[0].cases[0].id;
  const adjusted = {...run,results:[{...run.results[0],caseId}]};
  state = applyAction(state,{type:"import_run",data:adjusted});
  state = applyAction(state,{type:"review",datasetId:run.datasetId,datasetVersion:run.datasetVersion,caseId,runId:run.id,stageId:"generation",outcome:"correct",notes:"근거 확인"});
  assert.equal(state.reviews[0].stageId,"generation");
  assert.throws(() => applyAction(state,{type:"review",datasetId:run.datasetId,datasetVersion:run.datasetVersion,caseId,runId:run.id,stageId:"missing",outcome:"correct",notes:""}));
});

test("B records separate comparison, revision and reverification after an unsupported claim", async () => {
  let calls = 0;
  const run = await runFixedVerification("S14-01","B",async () => {
    calls++;
    return result(calls === 2 ? {...supported,checks:[{...supported.checks[0],verdict:"unsupported" as const}]} : supported);
  },input,"test-model");
  assert.equal(run.status,"completed");
  assert.equal(calls,4);
  assert.deepEqual(run.experiment?.stages.slice(3).map((stage) => stage.id),["generation","verification","revision","reverification","final"]);
});

test("unavailable or invalid evidence yields a failed experiment, never a final answer", async () => {
  const run = await runFixedVerification("S14-01","A",async () => result({...supported,checks:[{...supported.checks[0],evidenceIds:["9999"]}]}),input,"test-model");
  assert.equal(run.status,"failed");
  assert.equal(run.results[0].answer,"");
  assert.equal(run.experiment?.stages.find((stage) => stage.id === "generation")?.status,"failed");
  const other = {...run,experiment:run.experiment ? {...run.experiment,inputHash:"different"} : undefined};
  assert.equal(comparable(run,other),false);
});

test("B does not accept a verification of a different answer", async () => {
  let calls = 0;
  const run = await runFixedVerification("S14-01","B",async () => {
    calls++;
    return result(calls === 1 ? supported : {...supported,answer:"다른 답변"});
  },input,"test-model");
  assert.equal(run.status,"failed");
  assert.equal(run.results[0].answer,"");
});

test("does not present a document as answer evidence when its claim is absent from the answer", async () => {
  const twoDocs = async () => {
    const fixture = await input();
    fixture.input.cases[0].documents.push({id:"2158",title:"로그인 유지",content:"논의 중"});
    return fixture;
  };
  const run = await runFixedVerification("S14-01","A",async () => result({
    answer:"담당자는 준호입니다",
    checks:[
      {claim:"담당자는 준호",evidenceIds:["2152"],verdict:"supported",reason:"문서에 기록"},
      {claim:"로그인 유지 시간은 논의 중",evidenceIds:["2158"],verdict:"supported",reason:"문서에 기록"},
    ],
    missing:[],
  }),twoDocs,"test-model");
  assert.equal(run.status,"failed");
  assert.deepEqual(run.results[0].evidenceIds,[]);
});
