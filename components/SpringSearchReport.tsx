"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import styles from "./HybridSearchLab.module.css";

const routeLabels = {
  DOCUMENT_FIND: "문서 찾기",
  MEETING_QUESTION: "회의 내용 질문",
  MULTI_MEETING_SYNTHESIS: "여러 회의 종합",
};
const Route = z.enum(["DOCUMENT_FIND", "MEETING_QUESTION", "MULTI_MEETING_SYNTHESIS"]);
const Workspace = z.union([z.literal(1), z.literal(458)]);
const Phase4 = z.object({
  workspaces: z.array(z.object({
    workspaceId: Workspace, cases: z.number(), routeMatches: z.number(), documentRecall: z.number(),
    live: z.array(z.object({
      route: Route, generationCalls: z.number(), firstMs: z.number(), completedMs: z.number(),
    })),
  })),
});
const Phase5 = z.object({
  workspaces: z.array(z.object({
    workspaceId: Workspace, cases: z.number(), synthesisCases: z.number(), allMeetingsBefore: z.number(),
    allMeetingsAfter: z.number(), citationMatches: z.number(), citationCount: z.number(),
    supportedClaims: z.number(), claimCount: z.number(), rerankP95Ms: z.number(), contextP95Ms: z.number(),
    sseCompleted: z.number(), lookupCalls: z.number(), lookupCount: z.number(), allCitedMeetings: z.number(),
    liveSynthesisCases: z.number(),
  })),
});
const Tail = z.object({ samples: z.number(), p95: z.number().nullable(), p99: z.number().nullable() });
const Phase6 = z.object({
  warmupRequests: z.number(), wavesPerLevel: z.number(), workerConcurrency: z.number(),
  streamConcurrency: z.number(), pollIntervalMs: z.number(), requests: z.number(), completed: z.number(),
  routeMatches: z.number(), lookupRequests: z.number(), lookupGenerationCalls: z.number(),
  lookupClassificationCalls: z.number(),
  levels: z.array(z.object({
    concurrency: z.number(), routes: z.array(z.object({
      route: Route, requests: z.number(), firstMs: Tail, completedMs: Tail, generationCalls: z.number(),
      workerQueueP95Ms: z.number(), workerRetrievalP95Ms: z.number(),
    })),
  })).min(1),
  quality: z.array(z.object({
    workspaceId: Workspace, contextComparisons: z.number(), contextRegressions: z.number(),
    contextImprovements: z.number(), exactCitations: z.number(), citationCount: z.number(),
    semanticClaims: z.number(), supportedClaims: z.number(), pairedSynthesis: z.number(),
    allCitedMeetingsBefore: z.number(), allCitedMeetingsAfter: z.number(),
  })),
});
const number = (value: number) => value.toLocaleString("ko-KR");
const ratio = (actual: number, total: number) => `${number(actual)} / ${number(total)}건`;
const percent = (value: number) => `${(100 * value).toFixed(1)}%`;
const millis = (value: number) => `${value.toFixed(2)} ms`;
const seconds = (value: number) => `${(value / 1000).toFixed(3)}초`;
const corpus = { 1: "Workspace 1 · AI 초안", 458: "Workspace 458 · v1.30" };
const repo = "https://github.com/knot-service/knot-search-hybrid-eval";

export function SpringSearchReport({ stage }: { readonly stage: "phase4" | "phase5" | "phase6" }) {
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    void fetch(`/api/hybrid-search?kind=${stage}`, { signal: request.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Spring 실험 결과를 읽지 못했습니다.");
        return response.json() as Promise<unknown>;
      })
      .then((report) => { if (!request.signal.aborted) setResult(report); })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "결과를 읽지 못했습니다.");
      });
    return () => request.abort();
  }, [stage]);

  if (error) return <p role="alert">{error}</p>;
  if (result === undefined) return <p role="status">Spring 실험 결과를 불러오는 중입니다.</p>;

  if (stage === "phase4") {
    const report = Phase4.safeParse(result);
    if (!report.success) return <p role="alert">4차 결과 형식을 확인해 주세요.</p>;
    return (
      <section className={styles.content} aria-label="4차 Spring 경로 실측">
        <div>
          <h2>Spring Worker에서 세 검색 경로 연결</h2>
          <p>권한·날짜 필터와 하이브리드 검색을 연결하고, 각 워크스페이스에서 세 경로를 실제 SSE로 실행했습니다.</p>
        </div>
        <div className={styles.corpora}>
          {report.data.workspaces.map((workspace) => (
            <section className={`panel ${styles.metricCard}`} key={workspace.workspaceId}>
              <h3>{corpus[workspace.workspaceId]}</h3>
              <dl className={styles.metrics}>
                <dt>라우팅 일치</dt><dd>{ratio(workspace.routeMatches, workspace.cases)}</dd>
                <dt>기대 문서 재현율</dt><dd>{percent(workspace.documentRecall)}</dd>
              </dl>
              <h4 className={styles.runHeading}>첫 SSE / 전체 완료 · 경로별 1건</h4>
              <dl className={styles.metrics}>
                {workspace.live.map((row) => (
                  <div className={styles.metricRow} key={row.route}>
                    <dt>{routeLabels[row.route]} · 생성 {row.generationCalls}회</dt>
                    <dd>{seconds(row.firstMs)} / {seconds(row.completedMs)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p>라우팅은 규칙을 조정한 평가셋에서 재측정했습니다. <a href={`${repo}/commit/a7bd8f39`}>4차 코드와 실측 기록</a></p>
      </section>
    );
  }

  if (stage === "phase6") {
    const report = Phase6.safeParse(result);
    if (!report.success) return <p role="alert">6차 결과 형식을 확인해 주세요.</p>;
    return <MixedLoadReport report={report.data} />;
  }

  const report = Phase5.safeParse(result);
  if (!report.success) return <p role="alert">5차 결과 형식을 확인해 주세요.</p>;
  return (
    <section className={styles.content} aria-label="5차 근거와 출처 실측">
      <div>
        <h2>리랭킹·Parent 문맥과 주장별 출처</h2>
        <p>내용 질문과 회의 종합의 문맥을 E5 기준 1,024토큰으로 제한하고, 답변의 인용 구절을 원문과 대조했습니다.</p>
      </div>
      <div className={styles.corpora}>
        {report.data.workspaces.map((workspace) => (
          <section className={`panel ${styles.metricCard}`} key={workspace.workspaceId}>
            <h3>{corpus[workspace.workspaceId]}</h3>
            <p className={styles.runHeading}>검색 재생 {workspace.cases}건 · 실제 SSE {workspace.sseCompleted}건 완료</p>
            <dl className={styles.metrics}>
              <dt>기대 회의 모두 포함 (4차 → 5차)</dt>
              <dd>{workspace.allMeetingsBefore} → {ratio(workspace.allMeetingsAfter, workspace.synthesisCases)}</dd>
              <dt>기대 회의를 모두 인용한 종합 답변</dt>
              <dd>{ratio(workspace.allCitedMeetings, workspace.liveSynthesisCases)}</dd>
              <dt>원문과 일치한 인용</dt><dd>{ratio(workspace.citationMatches, workspace.citationCount)}</dd>
              <dt>인용이 전체 내용을 지지한 주장</dt><dd>{ratio(workspace.supportedClaims, workspace.claimCount)}</dd>
              <dt>문서 찾기 생성 호출</dt><dd>{workspace.lookupCalls}회 / {workspace.lookupCount}건</dd>
              <dt>리랭킹 / 문맥 조립 p95</dt><dd>{millis(workspace.rerankP95Ms)} / {millis(workspace.contextP95Ms)}</dd>
            </dl>
          </section>
        ))}
      </div>
      <p>4차 문서 후보와 5차의 제한된 생성 문맥을 비교했습니다. 주장별 의미 검수는 실제 답변 표본을 사용했습니다. <a href={`${repo}/commit/4d081216`}>5차 코드와 실측 기록</a></p>
    </section>
  );
}

function MixedLoadReport({ report }: { readonly report: z.infer<typeof Phase6> }) {
  const [concurrency, setConcurrency] = useState<number>();
  const level = report.levels.find((item) => item.concurrency === concurrency) ?? report.levels.at(-1)!;
  const latency = (value: number | null) => value === null ? "표본 없음" : seconds(value);
  return (
    <section className={styles.content} aria-label="6차 혼합 동시 부하 실측">
      <div>
        <h2>세 검색 경로의 혼합 동시 부하</h2>
        <p>Workspace 1·458의 질문을 섞어 같은 Spring Worker와 실제 Qwen에서 실행했습니다.</p>
      </div>
      <dl className={`panel ${styles.metricCard} ${styles.loadSummary}`}>
        <div><dt>SSE 완료</dt><dd>{ratio(report.completed, report.requests)}</dd></div>
        <div><dt>라우팅 일치</dt><dd>{ratio(report.routeMatches, report.requests)}</dd></div>
        <div><dt>문서 찾기 생성 호출</dt><dd>{report.lookupGenerationCalls}회 / {report.lookupRequests}건</dd></div>
      </dl>
      <div className={styles.controls}>
        <p>Worker 슬롯 {report.workerConcurrency}개 · SSE 슬롯 {report.streamConcurrency}개 · 단계별 {report.wavesPerLevel}회 반복</p>
        <label className={styles.picker}>
          동시 요청 수
          <select value={level.concurrency} onChange={(event) => setConcurrency(Number(event.target.value))}>
            {report.levels.map((item) => <option value={item.concurrency} key={item.concurrency}>동시 {item.concurrency}건</option>)}
          </select>
        </label>
      </div>
      <div className={styles.grid}>
        {level.routes.map((row) => (
          <section className={`panel ${styles.metricCard}`} key={row.route}>
            <h3>{routeLabels[row.route]}</h3>
            <p className={styles.runHeading}>첫 SSE {row.firstMs.samples}건 · 완료 {ratio(row.completedMs.samples, row.requests)}</p>
            <dl className={styles.metrics}>
              <dt>첫 SSE p95</dt><dd>{latency(row.firstMs.p95)}</dd>
              <dt>첫 SSE p99</dt><dd>{latency(row.firstMs.p99)}</dd>
              <dt>전체 완료 p95</dt><dd>{latency(row.completedMs.p95)}</dd>
              <dt>전체 완료 p99</dt><dd>{latency(row.completedMs.p99)}</dd>
              <dt>Worker 대기 p95</dt><dd>{seconds(row.workerQueueP95Ms)}</dd>
              <dt>후보 검색 p95</dt><dd>{seconds(row.workerRetrievalP95Ms)}</dd>
              <dt>생성 호출 합계</dt><dd>{row.generationCalls}회</dd>
            </dl>
          </section>
        ))}
      </div>
      <p>HTTP 전송부터 비어 있지 않은 첫 답변과 완료 이벤트를 측정했습니다. 이 표본에서 p99는 관측 최댓값입니다. 예열 {report.warmupRequests}건은 집계에서 제외했습니다.</p>
      <h2>근거 품질 회귀</h2>
      <div className={styles.corpora}>
        {report.quality.map((workspace) => (
          <section className={`panel ${styles.metricCard}`} key={workspace.workspaceId}>
            <h3>{corpus[workspace.workspaceId]}</h3>
            <dl className={styles.metrics}>
              <dt>5차보다 기대 회의가 줄어든 검색 문맥</dt><dd>{ratio(workspace.contextRegressions, workspace.contextComparisons)}</dd>
              <dt>원문·저장 출처와 일치한 인용</dt><dd>{ratio(workspace.exactCitations, workspace.citationCount)}</dd>
              <dt>인용이 전체 내용을 지지한 주장</dt><dd>{ratio(workspace.supportedClaims, workspace.semanticClaims)}</dd>
              <dt>기대 회의를 모두 인용한 종합 (5차 → 6차)</dt>
              <dd>{workspace.allCitedMeetingsBefore} → {ratio(workspace.allCitedMeetingsAfter, workspace.pairedSynthesis)}</dd>
            </dl>
          </section>
        ))}
      </div>
      <p>문서 찾기의 분류 모델 호출도 {report.lookupClassificationCalls}회였습니다. 의미 검수는 동시 {report.levels.at(-1)!.concurrency}건에서 사례별 첫 완료 답변을 사용했습니다. <a href={`${repo}/tree/codex/hybrid-search-phase6/experiments/hybrid-search`}>6차 코드와 재실행 방법</a></p>
    </section>
  );
}
