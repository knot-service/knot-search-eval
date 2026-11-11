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
const MixedLoad = z.object({
  warmupRequests: z.number(), wavesPerLevel: z.number(), workerConcurrency: z.number(),
  lookupConcurrency: z.number().default(0), streamConcurrency: z.number(), pollIntervalMs: z.number(), requests: z.number(), completed: z.number(),
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
    contextImprovements: z.number(), sharedComparisons: z.number().default(0),
    sharedRegressions: z.number().default(0), exactCitations: z.number(), citationCount: z.number(),
    semanticClaims: z.number(), supportedClaims: z.number(), pairedSynthesis: z.number(),
    allCitedMeetingsBefore: z.number(), allCitedMeetingsAfter: z.number(),
  })),
});
const QwenStages = z.object({
  firstSse: Tail, completedSse: Tail, workerQueue: Tail, retrieval: Tail,
  rerank: Tail, qwenFirstContent: Tail, qwenStreamTail: Tail,
});
const QwenRun = z.object({
  requests: z.number(), completed: z.number(), routeMatches: z.number(), lookupRequests: z.number(),
  lookupGenerationCalls: z.number(), lookupClassificationCalls: z.number(),
  levels: z.array(z.object({
    concurrency: z.number(), routes: z.array(z.object({
      route: Route, stages: QwenStages,
      firstSseTail: z.array(z.object({
        percentile: z.enum(["p95", "p99"]), firstSse: z.number().nullable(), workerQueue: z.number().nullable(),
        retrieval: z.number().nullable(), rerank: z.number().nullable(), qwenFirstContent: z.number().nullable(),
        qwenStreamTail: z.number().nullable(),
      })),
    })),
  })),
  quality: z.array(z.object({
    workspaceId: Workspace, meetingContextRegressions: z.number(), exactCitations: z.number(), citationCount: z.number(),
    noClaimAnswers: z.number(), completedAnswers: z.number(),
    pairedSynthesis: z.number(), allCitedMeetingsAfter: z.number(),
    semanticClaims: z.number().optional(), supportedClaims: z.number().optional(),
  })),
});
const QwenComparison = z.object({
  shared: QwenRun, split: QwenRun,
  contextComparisons: z.array(z.object({ workspaceId: Workspace, requests: z.number() })),
});
const GenerationRun = QwenRun.extend({
  workerMatches: z.number(),
  quality: z.array(QwenRun.shape.quality.element.extend({
    generated: z.number(), allExpectedMeetingsCited: z.number(),
    missingCases: z.array(z.object({ caseId: z.string(), requests: z.number() })),
    trackedCase: z.object({
      requests: z.number(), allExpectedDocumentsInContext: z.number(),
      allExpectedDocumentsCited: z.number(), noCitations: z.number(),
    }),
  })),
});
const GenerationComparison = QwenComparison.extend({ shared: GenerationRun, split: GenerationRun });
const Phase6 = MixedLoad.extend({ split: MixedLoad, qwenReplay: QwenComparison, generationReplay: GenerationComparison });
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
  const after = report.split;
  const splitLevel = after.levels.find((item) => item.concurrency === level.concurrency);
  const latency = (value: number | null | undefined) => value == null ? "표본 없음" : seconds(value);
  const compare = (before: number | null, next: number | null | undefined) => (
    <>{latency(before)} <span className={styles.comparisonArrow}>→</span> <strong>{latency(next)}</strong></>
  );

  return (
    <section className={styles.content} aria-label="6차 혼합 동시 부하 실측">
      <div>
        <h2>문서 찾기 Worker 분리 전후</h2>
        <p>Workspace 1·458의 같은 질문을 동시 3·6건으로 반복했습니다. 각 값은 공용 Worker → 분리 Worker 순서입니다.</p>
      </div>
      <dl className={`panel ${styles.metricCard} ${styles.loadSummary}`}>
        <div><dt>분리 후 SSE 완료</dt><dd>{ratio(after.completed, after.requests)}</dd></div>
        <div><dt>분리 후 라우팅 일치</dt><dd>{ratio(after.routeMatches, after.requests)}</dd></div>
        <div><dt>문서 찾기 생성 호출</dt><dd>{report.lookupGenerationCalls} → {after.lookupGenerationCalls}회</dd></div>
      </dl>
      <div className={styles.controls}>
        <p>공용 슬롯 {report.workerConcurrency}개 → 생성 {after.workerConcurrency}개 + 문서 찾기 {after.lookupConcurrency}개<br />
          SSE 슬롯 {after.streamConcurrency}개 · 조건당 {after.wavesPerLevel}회 반복</p>
        <label className={styles.picker}>
          동시 요청 수
          <select value={level.concurrency} onChange={(event) => setConcurrency(Number(event.target.value))}>
            {report.levels.map((item) => <option value={item.concurrency} key={item.concurrency}>동시 {item.concurrency}건</option>)}
          </select>
        </label>
      </div>
      <div className={styles.grid}>
        {level.routes.map((row) => {
          const split = splitLevel?.routes.find((item) => item.route === row.route);
          return (
            <section className={`panel ${styles.metricCard}`} key={row.route}>
              <h3>{routeLabels[row.route]}</h3>
              <p className={styles.runHeading}>완료 {row.completedMs.samples}/{row.requests} → {split ? ratio(split.completedMs.samples, split.requests) : "표본 없음"}</p>
              <dl className={`${styles.metrics} ${styles.comparisonMetrics}`}>
                <dt>첫 SSE p95</dt><dd>{compare(row.firstMs.p95, split?.firstMs.p95)}</dd>
                <dt>첫 SSE p99</dt><dd>{compare(row.firstMs.p99, split?.firstMs.p99)}</dd>
                <dt>전체 완료 p95</dt><dd>{compare(row.completedMs.p95, split?.completedMs.p95)}</dd>
                <dt>전체 완료 p99</dt><dd>{compare(row.completedMs.p99, split?.completedMs.p99)}</dd>
                <dt>Worker 대기 p95</dt><dd>{compare(row.workerQueueP95Ms, split?.workerQueueP95Ms)}</dd>
                <dt>후보 검색 p95</dt><dd>{compare(row.workerRetrievalP95Ms, split?.workerRetrievalP95Ms)}</dd>
                <dt>생성 호출 합계</dt><dd>{row.generationCalls} → {split?.generationCalls ?? "—"}회</dd>
              </dl>
            </section>
          );
        })}
      </div>
      <p>HTTP 전송부터 비어 있지 않은 첫 답변과 완료 이벤트를 측정했습니다. 경로별 표본이 12·24건이므로 이 표의 p99는 관측 최댓값입니다. 예열은 제외했습니다.</p>
      <GenerationSplitReport comparison={report.generationReplay} concurrency={level.concurrency} />
      <QwenReplayReport comparison={report.qwenReplay} concurrency={level.concurrency} />
      <h2>근거 품질 회귀</h2>
      <div className={styles.corpora}>
        {after.quality.map((workspace) => {
          const before = report.quality.find((item) => item.workspaceId === workspace.workspaceId);
          return (
            <section className={`panel ${styles.metricCard}`} key={workspace.workspaceId}>
              <h3>{corpus[workspace.workspaceId]}</h3>
              <dl className={`${styles.metrics} ${styles.comparisonMetrics}`}>
                <dt>분리 후 기대 회의가 줄어든 검색 문맥</dt>
                <dd>{ratio(workspace.sharedRegressions, workspace.sharedComparisons)}</dd>
                <dt>원문·저장 출처와 일치한 인용</dt>
                <dd>{before && `${before.exactCitations}/${before.citationCount} → `}{ratio(workspace.exactCitations, workspace.citationCount)}</dd>
                <dt>인용이 전체를 지지한 주장</dt>
                <dd>{before && `${before.supportedClaims}/${before.semanticClaims} → `}{ratio(workspace.supportedClaims, workspace.semanticClaims)}</dd>
                <dt>기대 회의를 모두 인용한 종합</dt>
                <dd>{before && `${before.allCitedMeetingsAfter}/${before.pairedSynthesis} → `}{ratio(workspace.allCitedMeetingsAfter, workspace.pairedSynthesis)}</dd>
              </dl>
            </section>
          );
        })}
      </div>
      <p>분리 후 문서 찾기 {after.lookupRequests}건의 분류·생성 모델 호출은 각각 {after.lookupClassificationCalls}회와 {after.lookupGenerationCalls}회였습니다. <a href={`${repo}/tree/codex/hybrid-search-lookup-worker/experiments/hybrid-search`}>Worker 분리 코드와 재실행 방법</a></p>
    </section>
  );
}

const workerRows = [["workerQueue", "Worker 대기"], ["firstSse", "첫 SSE"], ["completedSse", "전체 완료"]] as const;

function GenerationSplitReport({ comparison, concurrency }: {
  readonly comparison: z.infer<typeof GenerationComparison>;
  readonly concurrency: number;
}) {
  const { shared, split } = comparison;
  const before = shared.levels.find((level) => level.concurrency === concurrency);
  const after = split.levels.find((level) => level.concurrency === concurrency);
  const previous = shared.quality.find((row) => row.workspaceId === 458);
  const quality = split.quality.find((row) => row.workspaceId === 458);
  if (!before || !after || !previous || !quality) return null;

  const time = (ms: number | null | undefined) => ms == null ? "—" : (ms / 1000).toFixed(3);
  const pair = (left: number | null | undefined, right: number | null | undefined) => (
    <>{time(left)} <span className={styles.comparisonArrow}>→</span> <strong>{time(right)}</strong></>
  );
  const coverage = previous.trackedCase;
  const next = quality.trackedCase;
  const contextChecks = comparison.contextComparisons.find((row) => row.workspaceId === 458)?.requests ?? 0;
  const missingCases = (row: typeof quality) => row.missingCases.map(({ caseId, requests }) => `${caseId} ${requests}건`).join(" · ") || "없음";

  return (
    <section className={`panel ${styles.metricCard} ${styles.qwenReport}`} aria-label="생성 Worker 경로 분리 전후">
      <h2>생성 Worker 경로 분리 전후</h2>
      <p>생성 공용 슬롯 2개 → 내용 질문 1개 + 회의 종합 1개. 문서 찾기 슬롯 1개를 유지했습니다.</p>
      <p>동시 {concurrency}건 · 공용 생성 → 경로별 생성, 단위 초</p>
      <table className={styles.timingTable} aria-label="경로별 생성 Worker 지연 비교">
        <thead><tr><th scope="col">측정 구간</th><th scope="col">p95</th><th scope="col">p99</th></tr></thead>
        {after.routes.map((row) => {
          const baseline = before.routes.find((item) => item.route === row.route);
          return (
            <tbody key={row.route}>
              <tr><th scope="rowgroup" colSpan={3}>{routeLabels[row.route]} · 각 {row.stages.firstSse.samples}건</th></tr>
              {workerRows.map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{pair(baseline?.stages[key].p95, row.stages[key].p95)}</td>
                  <td>{pair(baseline?.stages[key].p99, row.stages[key].p99)}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      <p>SSE 완료 {shared.completed}/{shared.requests} → {split.completed}/{split.requests}건 · 지정 슬롯 처리 {shared.workerMatches} → {split.workerMatches}건</p>
      <p>문서 찾기 {shared.lookupRequests} → {split.lookupRequests}건 · 생성 {shared.lookupGenerationCalls} → {split.lookupGenerationCalls}회 · 분류 {shared.lookupClassificationCalls} → {split.lookupClassificationCalls}회</p>
      <h3>Workspace 458 최종 인용</h3>
      <dl className={`${styles.metrics} ${styles.comparisonMetrics}`}>
        <dt>분리 후 기대 회의가 줄어든 문맥</dt><dd>{ratio(quality.meetingContextRegressions, contextChecks)}</dd>
        <dt>기대 회의를 모두 인용한 생성 답변</dt><dd>{previous.allExpectedMeetingsCited}/{previous.generated} → {quality.allExpectedMeetingsCited}/{quality.generated}건</dd>
        <dt>원문·저장 출처와 일치한 인용</dt><dd>{previous.exactCitations}/{previous.citationCount} → {quality.exactCitations}/{quality.citationCount}개</dd>
        <dt>S18-01 · 기대 문서가 검색 문맥에 있음</dt><dd>{coverage.allExpectedDocumentsInContext}/{coverage.requests} → {next.allExpectedDocumentsInContext}/{next.requests}건</dd>
        <dt>S18-01 · 기대 문서를 최종 인용</dt><dd>{coverage.allExpectedDocumentsCited}/{coverage.requests} → {next.allExpectedDocumentsCited}/{next.requests}건</dd>
        <dt>S18-01 · 최종 인용 없음</dt><dd>{coverage.noCitations}/{coverage.requests} → {next.noCitations}/{next.requests}건</dd>
      </dl>
      <p>기대 회의 인용 누락 사례 {missingCases(previous)} → {missingCases(quality)}</p>
      <p>S18-01은 앞선 실험에서 검색 문맥에 기대 문서가 있었지만 인용이 빠졌던 사례입니다. <a href={`${repo}/tree/codex/hybrid-search-lookup-worker/experiments/hybrid-search`}>생성 Worker 분리 코드와 재실행 방법</a></p>
    </section>
  );
}

const qwenRows = [
  ["firstSse", "첫 SSE"], ["completedSse", "전체 완료"], ["workerQueue", "Worker 대기"],
  ["retrieval", "검색 전체"], ["rerank", "리랭킹"], ["qwenFirstContent", "Qwen 첫 내용 대기"],
  ["qwenStreamTail", "Qwen 이후 생성"],
] as const;

function QwenReplayReport({ comparison, concurrency }: {
  readonly comparison: z.infer<typeof QwenComparison>;
  readonly concurrency: number;
}) {
  const { shared, split } = comparison;
  const find = (run: z.infer<typeof QwenRun>) => run.levels.find((level) => level.concurrency === concurrency)
    ?.routes.find((route) => route.route === "MEETING_QUESTION");
  const before = find(shared);
  const after = find(split);
  if (!before || !after) return null;

  const time = (ms: number | null | undefined) => ms == null ? "—" : (ms / 1000).toFixed(3);
  const pair = (left: number | null | undefined, right: number | null | undefined) => (
    <>{time(left)} <span className={styles.comparisonArrow}>→</span> <strong>{time(right)}</strong></>
  );

  return (
    <section className={`panel ${styles.metricCard} ${styles.qwenReport}`} aria-label="회의 내용 질문 지연 재실측">
      <h2>회의 내용 질문 지연 재실측</h2>
      <p>같은 질문을 두 Worker 설정으로 다시 실행했습니다. 동시 {concurrency}건 · 각 {after.stages.firstSse.samples}건 · 공용 → 분리, 단위 초</p>
      <table className={styles.timingTable} aria-label="내용 질문 지연 구간별 비교">
        <thead><tr><th scope="col">측정 구간</th><th scope="col">p95</th><th scope="col">p99</th></tr></thead>
        <tbody>{qwenRows.map(([key, label]) => (
          <tr key={key}>
            <th scope="row">{label}</th>
            <td>{pair(before.stages[key].p95, after.stages[key].p95)}</td>
            <td>{pair(before.stages[key].p99, after.stages[key].p99)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p>{concurrency === 3
        ? <>동시 3건에서 가장 느린 요청끼리 비교하면 Qwen 첫 내용 대기가 {pair(before.firstSseTail[0]?.qwenFirstContent, after.firstSseTail[0]?.qwenFirstContent)}초로 늘었습니다. 해당 요청의 리랭킹과 Worker 대기는 줄었습니다.</>
        : "동시 6건에서 기존에 관찰한 지연 증가는 재현되지 않았습니다. 이번 첫 SSE p95 요청에서 가장 긴 구간은 두 설정 모두 Worker 대기였습니다."}</p>
      <p>리랭킹은 검색 전체에 포함됩니다. Qwen 첫 내용 대기에는 네트워크, 서버 대기, 입력 처리가 함께 들어갑니다. 이후 생성은 첫 모델 내용부터 Qwen 스트림 종료까지입니다.</p>
      <details>
        <summary>첫 SSE p95·p99에 해당하는 요청의 실제 구간</summary>
        {after.firstSseTail.map((row) => {
          const previous = before.firstSseTail.find((item) => item.percentile === row.percentile);
          return (
            <dl className={styles.metrics} key={row.percentile} aria-label={`첫 SSE ${row.percentile} 요청`}>
              <dt>첫 SSE {row.percentile}</dt><dd>{pair(previous?.firstSse, row.firstSse)}</dd>
              <dt>Worker 대기</dt><dd>{pair(previous?.workerQueue, row.workerQueue)}</dd>
              <dt>검색 전체</dt><dd>{pair(previous?.retrieval, row.retrieval)}</dd>
              <dt>Qwen 첫 내용 대기</dt><dd>{pair(previous?.qwenFirstContent, row.qwenFirstContent)}</dd>
              <dt>Qwen 이후 생성</dt><dd>{pair(previous?.qwenStreamTail, row.qwenStreamTail)}</dd>
            </dl>
          );
        })}
      </details>
      <h3>같은 재실행의 경로·근거 검증</h3>
      <p>SSE 완료 {shared.completed}/{shared.requests} → {split.completed}/{split.requests}건 · 라우팅 일치 {shared.routeMatches} → {split.routeMatches}건</p>
      <p>문서 찾기 {shared.lookupRequests} → {split.lookupRequests}건 · 생성 {shared.lookupGenerationCalls} → {split.lookupGenerationCalls}회 · 분류 {shared.lookupClassificationCalls} → {split.lookupClassificationCalls}회</p>
      <div className={styles.corpora}>
        {split.quality.map((row) => {
          const previous = shared.quality.find((item) => item.workspaceId === row.workspaceId);
          const samples = comparison.contextComparisons.find((item) => item.workspaceId === row.workspaceId)?.requests ?? 0;
          if (!previous) return null;
          return (
            <section key={row.workspaceId}>
              <h3>{corpus[row.workspaceId]}</h3>
              <dl className={styles.metrics}>
                <dt>분리 후 기대 회의가 줄어든 문맥</dt><dd>{ratio(row.meetingContextRegressions, samples)}</dd>
                <dt>원문·저장 출처 일치 인용</dt><dd>{previous.exactCitations}/{previous.citationCount} → {row.exactCitations}/{row.citationCount}개</dd>
                <dt>근거 부족 안내로 끝난 생성 답변</dt><dd>{previous.noClaimAnswers}/{previous.completedAnswers} → {row.noClaimAnswers}/{row.completedAnswers}건</dd>
                <dt>기대 회의를 모두 인용한 종합</dt><dd>{previous.allCitedMeetingsAfter}/{previous.pairedSynthesis} → {row.allCitedMeetingsAfter}/{row.pairedSynthesis}건</dd>
                {previous.semanticClaims !== undefined && row.semanticClaims !== undefined && <>
                  <dt>인용이 전체를 지지한 주장</dt><dd>{previous.supportedClaims}/{previous.semanticClaims} → {row.supportedClaims}/{row.semanticClaims}개</dd>
                </>}
              </dl>
            </section>
          );
        })}
      </div>
    </section>
  );
}
