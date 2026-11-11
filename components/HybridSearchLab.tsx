"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import styles from "./HybridSearchLab.module.css";
import { Workspace1EvaluationDraft } from "./Workspace1EvaluationDraft";
import { Workspace1Phase1 } from "./Workspace1Phase1";
import { Workspace1SearchQuality } from "./Workspace1SearchQuality";
import { SpringSearchReport } from "./SpringSearchReport";

const modes = [
  { id: "keyword", label: "키워드" },
  { id: "vector", label: "벡터" },
  { id: "hybrid", label: "하이브리드" },
] as const;
const tabs = [
  { id: "comparison", label: "검색 방식 비교" },
  { id: "lookup", label: "문서 찾기" },
  { id: "synthesis", label: "회의 종합" },
  { id: "corpus", label: "워크스페이스" },
  { id: "dataset", label: "평가셋 초안" },
  { id: "phase1", label: "1차 청킹 비교" },
  { id: "phase2", label: "2차 하이브리드" },
  { id: "phase3", label: "3차 리랭킹" },
  { id: "phase4", label: "4차 Spring 경로" },
  { id: "phase5", label: "5차 근거·출처" },
  { id: "phase6", label: "6차 혼합 부하" },
  { id: "quality1", label: "정확도 1차" },
] as const;
type Tab = (typeof tabs)[number]["id"];
type Kind = "comparison" | "lookup" | "synthesis";

const Candidate = z.object({
  id: z.number(), title: z.string(), recordedAt: z.string(), score: z.number(),
});
const Ranking = z.object({ ms: z.number(), hits: z.array(Candidate) });
const Metric = z.object({
  recallAt10: z.number(), allEvidenceAt10: z.number(), p50Ms: z.number(), p95Ms: z.number(),
});
const Run = z.object({
  id: z.string(),
  durationMs: z.number(),
  generationCalls: z.number(),
  firstContentMs: z.number().nullable(),
  generationMs: z.number().nullable(),
  generationModel: z.string().nullable(),
  missingMeetingIds: z.array(z.number()),
  metrics: z.object({ keyword: Metric, vector: Metric, hybrid: Metric }).nullable(),
  claims: z.array(z.object({ text: z.string(), documentIds: z.array(z.number()) })),
  rows: z.array(z.object({
    case: z.object({ id: z.string(), question: z.string(), expectedIds: z.array(z.number()) }),
    modes: z.object({ keyword: Ranking, vector: Ranking, hybrid: Ranking }),
  })),
});

const details: Readonly<Record<Kind, string>> = {
  comparison: "Workspace 458의 합성 문서로 세 검색 방식의 후보 순위와 속도를 비교합니다.",
  lookup: "“지난번 배포 회의 찾아줘”",
  synthesis: "“최근 세 번의 회의에서 배포 전략이 어떻게 바뀌었어?”",
};

const ms = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 3 })} ms`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

async function load(kind: Kind, method: "GET" | "POST", signal?: AbortSignal) {
  const response = await fetch(`/api/hybrid-search?kind=${kind}`, { method, signal });
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(z.object({ error: z.string() }).parse(data).error);
  }
  return Run.nullable().parse(data);
}

export function HybridSearchLab({ localAccess }: { readonly localAccess: boolean }) {
  const [tab, setTab] = useState<Tab>(localAccess ? "comparison" : "dataset");
  const visibleTabs = tabs.filter(({ id }) => localAccess || id === "dataset" || id.startsWith("phase"));
  return (
    <section aria-label="하이브리드 검색 실험">
      <div className="heading">
        <div>
          <h1>하이브리드 검색 실험</h1>
          <p>운영 복사본·합성 문서 · 2026.11.11</p>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="하이브리드 검색 실험 유형">
        {visibleTabs.map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "corpus" && <CorpusPanel />}
      {tab === "dataset" && <Workspace1EvaluationDraft />}
      {tab === "phase1" && <Workspace1Phase1 />}
      {(tab === "phase2" || tab === "phase3") && <Workspace1SearchQuality key={tab} stage={tab} />}
      {(tab === "phase4" || tab === "phase5" || tab === "phase6" || tab === "quality1") && (
        <SpringSearchReport key={tab} stage={tab} />
      )}
      {(tab === "comparison" || tab === "lookup" || tab === "synthesis") && <RunPanel key={tab} kind={tab} />}
    </section>
  );
}

function RunPanel({ kind }: { readonly kind: Kind }) {
  const [run, setRun] = useState<z.infer<typeof Run> | null>(null);
  const [status, setStatus] = useState<"loading" | "running" | "idle">("loading");
  const [error, setError] = useState("");
  const [selectedCase, setSelectedCase] = useState("");
  const row = run?.rows.find(({ case: item }) => item.id === selectedCase) ?? run?.rows[0];

  useEffect(() => {
    const request = new AbortController();
    void load(kind, "GET", request.signal)
      .then((result) => { if (!request.signal.aborted) setRun(result); })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "결과를 읽지 못했습니다.");
      })
      .finally(() => { if (!request.signal.aborted) setStatus("idle"); });
    return () => request.abort();
  }, [kind]);

  async function execute() {
    setStatus("running");
    setError("");
    try {
      setRun(await load(kind, "POST"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "실험 실행에 실패했습니다.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className={styles.content}>
      <div className={`panel ${styles.controls}`}>
        <p>{details[kind]}</p>
        <button className="primary" type="button" disabled={status !== "idle"} onClick={() => void execute()}>
          {status === "running" ? "실험 실행 중…" : "실험 실행"}
        </button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div role="status">
        {status === "loading" && <p>마지막 실험 결과를 불러오는 중입니다.</p>}
        {status === "running" && <p>검색을 실행하고 있습니다.</p>}
        {status === "idle" && !run && !error && <p>실험을 실행하면 여기에 결과가 표시됩니다.</p>}
      </div>
      {run && (
        <>
          <div className={styles.summary}>
            <span><strong>{run.rows.length}</strong>개 질문</span>
            <span>생성 모델 호출 <strong>{run.generationCalls}회</strong></span>
            <span>전체 <strong>{ms(run.durationMs)}</strong></span>
            {run.firstContentMs !== null && <span>첫 모델 응답 <strong>{ms(run.firstContentMs)}</strong></span>}
            {run.generationMs !== null && <span>생성 완료 <strong>{ms(run.generationMs)}</strong></span>}
            {run.generationModel && <span>{run.generationModel}</span>}
          </div>
          {run.metrics && (
            <div className={styles.grid}>
              {modes.map(({ id, label }) => {
                const metric = run.metrics?.[id];
                if (!metric) return null;
                return (
                  <section className={`panel ${styles.metricCard}`} key={id} aria-label={label}>
                    <h2>{label}</h2>
                    <p className={styles.recall}><strong>{percent(metric.recallAt10)}</strong> Recall@10</p>
                    <dl className={styles.metrics}>
                      <dt>기대 근거 모두 포함</dt><dd>{percent(metric.allEvidenceAt10)}</dd>
                      <dt>검색 p50</dt><dd>{ms(metric.p50Ms)}</dd>
                      <dt>검색 p95</dt><dd>{ms(metric.p95Ms)}</dd>
                    </dl>
                  </section>
                );
              })}
            </div>
          )}
          {run.claims.length > 0 && (
            <section className={`panel ${styles.answer}`}>
              <h2>회의 종합 답변</h2>
              {run.missingMeetingIds.length > 0 && <p role="status">인용이 빠진 회의 {run.missingMeetingIds.join(", ")}</p>}
              <ol>
                {run.claims.map((claim, index) => (
                  <li key={index}>
                    <p>{claim.text}</p>
                    <small>출처 {claim.documentIds.map((id) =>
                      row?.modes.hybrid.hits.find((hit) => hit.id === id)?.title ?? String(id),
                    ).join(" · ")}</small>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {row && (
            <>
              {run.rows.length > 1 && (
                <label className={styles.picker}>
                  비교할 질문
                  <select value={row.case.id} onChange={(event) => setSelectedCase(event.target.value)}>
                    {run.rows.map(({ case: item }) => (
                      <option key={item.id} value={item.id}>{item.id} · {item.question}</option>
                    ))}
                  </select>
                </label>
              )}
              <p>기대 근거 {row.case.expectedIds.map((id) => `#${id}`).join(", ")}</p>
              <div className={kind === "comparison" ? styles.grid : undefined}>
                {modes.filter(({ id }) => kind === "comparison" || id === "hybrid").map(({ id, label }) => (
                  <section key={id} className={`panel ${styles.candidates}`}>
                    <h2>
                      {kind === "lookup" ? "찾은 문서" : `${label} 후보`}
                      <small>{ms(row.modes[id].ms)}</small>
                    </h2>
                    {row.modes[id].hits.length === 0 && <p>검색 후보가 없습니다.</p>}
                    <ol>
                      {row.modes[id].hits.map((hit, index) => (
                        <li key={hit.id}>
                          <span className={styles.rank} aria-hidden="true">{index + 1}</span>
                          <div>
                            <strong>{hit.title}</strong>
                            <small>#{hit.id} · {date.format(new Date(hit.recordedAt))}</small>
                            {row.case.expectedIds.includes(hit.id) && <span className={styles.expected}>기대 근거</span>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}


const Corpora = z.array(z.object({
  workspaceId: z.number(),
  source: z.enum(["synthetic", "production_snapshot"]),
  documentCount: z.number(),
  meetingCount: z.number(),
  minCharacters: z.number(),
  meanCharacters: z.number(),
  maxCharacters: z.number(),
}));

function CorpusPanel() {
  const [corpora, setCorpora] = useState<z.infer<typeof Corpora>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/hybrid-search?kind=corpus", { signal: request.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(body).error);
        return Corpora.parse(body);
      })
      .then((data) => { if (!request.signal.aborted) setCorpora(data); })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "집계를 읽지 못했습니다.");
      });
    return () => request.abort();
  }, []);
  return (
    <div className={styles.content}>
      <p>현재 검색 방식 비교와 두 예제 실행에는 합성 Workspace 458을 사용합니다.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {corpora.length === 0 && !error && <p role="status">워크스페이스를 불러오는 중입니다.</p>}
      <div className={styles.corpora}>
        {corpora.map((corpus) => (
          <section className={`panel ${styles.metricCard}`} key={corpus.workspaceId}>
            <h2>Workspace {corpus.workspaceId} · {corpus.source === "synthetic" ? "합성 문서" : "운영 복사본"}</h2>
            <dl className={styles.metrics}>
              <dt>문서</dt><dd>{corpus.documentCount}개</dd>
              <dt>회의</dt><dd>{corpus.meetingCount}개</dd>
              <dt>본문 평균</dt><dd>{Math.round(corpus.meanCharacters).toLocaleString("ko-KR")}자</dd>
              <dt>본문 최대</dt><dd>{corpus.maxCharacters.toLocaleString("ko-KR")}자</dd>
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
