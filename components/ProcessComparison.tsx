"use client";

import { Activity, Check, ChevronDown, Circle, Clock3, Minus, X } from "lucide-react";
import type { DataState, Review, Run } from "../lib/schema";
import { Badge } from "./ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

type Stage = NonNullable<Run["experiment"]>["stages"][number];
type Reviews = DataState["reviews"];
type BadgeVariant = "success" | "danger" | "warning" | "muted" | "info";

const statusInfo: Record<Stage["status"], { label: string; variant: BadgeVariant }> = {
  completed: { label: "실행됨", variant: "success" },
  failed: { label: "실패", variant: "danger" },
  not_applicable: { label: "해당 없음", variant: "muted" },
  not_run: { label: "미실행", variant: "warning" },
};
const qualityInfo: Record<Review["outcome"], { label: string; variant: BadgeVariant }> = {
  correct: { label: "적합", variant: "success" },
  incorrect: { label: "부적합", variant: "danger" },
  hold: { label: "판단 보류", variant: "warning" },
};
const modelStages = new Set(["generation", "verification", "revision", "reverification"]);

function latestReview(reviews: Reviews, run: Run, stageId?: string) {
  if (run.results.length !== 1) return undefined;
  return reviews.filter((review) => review.runId === run.id && review.caseId === run.results[0].caseId && review.stageId === stageId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function duration(ms: number | null) {
  return ms === null ? "시간 미수집" : `${ms.toLocaleString("ko-KR")} ms`;
}

function runName(run: Run, index: number) {
  return run.experiment ? `실행 ${index + 1} · 검증 ${run.experiment.variant}` : `실행 ${index + 1} · 기존 실행`;
}

function quality(review: Review | undefined, status?: Stage["status"]) {
  if (status === "not_applicable") return { label: "품질 해당 없음", variant: "muted" as const };
  if (status === "not_run") return { label: "품질 미평가", variant: "muted" as const };
  return review ? qualityInfo[review.outcome] : { label: "품질 미검수", variant: "muted" as const };
}

function Metric({ title, icon: Icon, values }: { title: string; icon: typeof Clock3; values: { name: string; value: string; detail?: string }[] }) {
  return <div className="tw:rounded-xl tw:border tw:border-solid tw:border-slate-200 tw:bg-slate-50/70 tw:p-4">
    <div className="tw:mb-3 tw:flex tw:items-center tw:gap-2 tw:text-xs tw:font-semibold tw:text-slate-500"><Icon size={15} aria-hidden="true" />{title}</div>
    <div className="tw:grid tw:grid-cols-2 tw:gap-3">
      {values.map((value) => <div key={value.name} className="tw:min-w-0"><div className="tw:text-xs tw:text-slate-500">{value.name}</div><div className="tw:mt-1 tw:break-words tw:text-lg tw:font-bold tw:tracking-tight tw:text-slate-900">{value.value}</div>{value.detail && <div className="tw:mt-1 tw:break-words tw:text-xs tw:text-slate-500">{value.detail}</div>}</div>)}
    </div>
  </div>;
}

function TimelineStep({ stage, review, index, last }: { stage: Stage; review: Review | undefined; index: number; last: boolean }) {
  const info = statusInfo[stage.status];
  const assessment = quality(review, stage.status);
  const Icon = stage.status === "completed" ? Check : stage.status === "failed" ? X : stage.status === "not_run" ? Minus : Circle;
  return <li className="tw:relative tw:list-none tw:pb-5 tw:last:pb-0">
    {!last && <span aria-hidden="true" className="tw:absolute tw:top-7 tw:bottom-0 tw:left-[13px] tw:w-px tw:bg-slate-200" />}
    <div className="tw:flex tw:items-start tw:gap-3">
      <span className={`tw:relative tw:z-10 tw:flex tw:size-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full ${stage.status === "completed" ? "tw:bg-emerald-50 tw:text-emerald-700" : stage.status === "failed" ? "tw:bg-red-50 tw:text-red-700" : "tw:bg-slate-100 tw:text-slate-500"}`}><Icon size={14} aria-hidden="true" /></span>
      <div className="tw:min-w-0 tw:flex-1">
        <Collapsible>
          <CollapsibleTrigger className="process-step-trigger tw:group tw:flex tw:w-full tw:items-start tw:justify-between tw:gap-2 tw:rounded-md tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:focus-visible:outline-2 tw:focus-visible:outline-offset-4 tw:focus-visible:outline-indigo-600">
            <span><span className="tw:block tw:text-[11px] tw:font-semibold tw:tracking-wide tw:text-slate-400">STEP {String(index + 1).padStart(2, "0")}</span><span className="tw:mt-1 tw:block tw:text-sm tw:font-semibold tw:text-slate-900">{stage.label}</span></span>
            <span className="tw:flex tw:shrink-0 tw:items-center tw:gap-1 tw:text-xs tw:text-slate-500">상세 <ChevronDown size={15} className="tw:transition-transform tw:group-data-[state=open]:rotate-180" aria-hidden="true" /></span>
          </CollapsibleTrigger>
          <div className="tw:mt-2 tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
            <Badge variant={info.variant}>{info.label}</Badge>
            <Badge variant={stage.durationMs === null ? "muted" : "info"}><Clock3 size={12} aria-hidden="true" />{duration(stage.durationMs)}</Badge>
            <Badge variant={assessment.variant}>{assessment.label}</Badge>
          </div>
          {review && <div className="tw:mt-1.5 tw:break-words tw:text-xs tw:text-slate-500">{review.reviewer}</div>}
          <CollapsibleContent className="tw:mt-3 tw:overflow-hidden tw:rounded-lg tw:bg-slate-50 tw:p-3 tw:text-xs tw:text-slate-600">
            <div className="tw:font-semibold tw:text-slate-700">단계 결과</div>
            <pre className="tw:mt-2 tw:max-h-64 tw:overflow-auto tw:whitespace-pre-wrap tw:break-words tw:font-sans tw:leading-relaxed">{stage.result || "기록된 결과 없음"}</pre>
            <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-x-4 tw:gap-y-1 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200 tw:pt-3"><span>입력 토큰: {stage.inputTokens === null ? "미수집" : stage.inputTokens.toLocaleString("ko-KR")}</span><span>출력 토큰: {stage.outputTokens === null ? "미수집" : stage.outputTokens.toLocaleString("ko-KR")}</span></div>
            {review && <div className="tw:mt-3 tw:break-words"><strong>검수 · {review.reviewer}</strong><p>{review.notes || "검수 의견 없음"}</p></div>}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  </li>;
}

export function ProcessComparison({ runs, reviews }: { runs: [Run, Run]; reviews: Reviews }) {
  const values = runs.map((run, index) => ({ run, name: runName(run, index) }));
  return <section aria-labelledby="process-comparison-title" className="panel tw:my-5">
    <div className="tw:border-0 tw:border-b tw:border-solid tw:border-slate-100 tw:px-5 tw:py-5 tw:sm:px-6">
      <div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3"><div><div className="tw:mb-1 tw:text-[11px] tw:font-semibold tw:tracking-[0.12em] tw:text-indigo-600">PROCESS COMPARISON</div><h2 id="process-comparison-title" className="tw:text-lg tw:font-bold tw:text-slate-900">단계별 실행 비교</h2><p className="tw:mt-1 tw:text-xs tw:text-slate-500">실제 기록된 단계와 검수 결과를 비교해요.</p></div><Badge variant="info"><Activity size={12} aria-hidden="true" />실행 기록</Badge></div>
      <div className="tw:mt-5 tw:grid tw:grid-cols-1 tw:gap-3 tw:lg:grid-cols-3">
        <Metric title="총 소요 시간" icon={Clock3} values={values.map(({run,name}) => ({name, value:run.results.length === 1 ? duration(run.results[0].latencyMs) : "시간 미수집", detail:run.results.length === 1 ? "사례 응답 시간" : "단일 사례가 아니에요"}))} />
        <Metric title="기록된 모델 호출" icon={Activity} values={values.map(({run,name}) => ({name, value:run.experiment?.stages.some(stage => modelStages.has(stage.id)) ? `${run.experiment.stages.filter(stage => modelStages.has(stage.id) && (stage.status === "completed" || stage.status === "failed")).length}회` : "미수집", detail:run.experiment?.stages.some(stage => modelStages.has(stage.id)) ? "실행·실패 단계 기준" : undefined}))} />
        <Metric title="최종 검수" icon={Check} values={values.map(({run,name}) => { const review = latestReview(reviews,run); return {name,value:review ? qualityInfo[review.outcome].label : "미검수",detail:review?.reviewer}; })} />
      </div>
    </div>
    <div className="tw:grid tw:grid-cols-1 tw:gap-px tw:bg-slate-200 tw:lg:grid-cols-2">
      {values.map(({run,name}) => <section key={run.id} aria-label={`${name} 실행 순서`} className="tw:min-w-0 tw:bg-white tw:px-5 tw:py-5 tw:sm:px-6"><div className="tw:mb-5 tw:flex tw:items-start tw:justify-between tw:gap-3"><div><h3 className="tw:m-0 tw:text-base tw:font-bold tw:text-slate-900">{name}</h3><div className="tw:mt-1 tw:break-all tw:text-xs tw:text-slate-500">{run.experiment?.promptVersion ?? "단계 기록 없음"}</div></div><Badge variant={run.status === "completed" ? "success" : "danger"}>{run.status === "completed" ? "실행 완료" : run.status === "failed" ? "실행 실패" : "실행 취소"}</Badge></div>{run.experiment ? <ol className="tw:m-0 tw:p-0">{run.experiment.stages.map((stage,index,stages) => <TimelineStep key={stage.id} stage={stage} index={index} last={index === stages.length - 1} review={latestReview(reviews,run,stage.id)} />)}</ol> : <p className="tw:text-sm tw:text-slate-500">이 실행에는 단계별 기록이 없어요.</p>}</section>)}
    </div>
  </section>;
}
