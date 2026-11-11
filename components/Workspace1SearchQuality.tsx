"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import styles from "./HybridSearchLab.module.css";

const Times = z.object({ p50: z.number(), p95: z.number() });
const Header = z.object({
  datasetVersion: z.string(),
  caseCount: z.number(),
  generationCalls: z.number(),
});
const HybridMetric = z.object({
  documentRecallAt10: z.number(), ndcgAt5: z.number(), evidenceSpanRecallAt10: z.number(),
  distinctDocumentsInTop10: z.number(), searchMs: Times,
});
const HybridModes = z.object({
  keyword: HybridMetric, vector: HybridMetric, rrf: HybridMetric, rrf_diversified: HybridMetric,
});
const Hybrid = Header.extend({
  metrics: HybridModes, variantMetrics: z.record(z.string(), HybridModes),
  variantCounts: z.record(z.string(), z.number()),
  stageTimes: z.object({
    embeddingMs: Times, vectorSearchMs: Times, keywordSearchMs: Times, fusionMs: Times, diversityMs: Times,
  }),
});
const RerankMetric = z.object({
  ndcgAt5: z.number(), evidenceAt5: z.number(), evidenceInContext: z.number(),
  contextTokens: z.number(), contextMs: Times,
});
const Rerank = Header.extend({
  contextBudget: z.number(), rerankMs: Times,
  metrics: z.object({ baseline: RerankMetric, reranked: RerankMetric, expanded: RerankMetric }),
});
const modes = [
  { id: "keyword", label: "키워드" },
  { id: "vector", label: "벡터" },
  { id: "rrf", label: "RRF 하이브리드" },
  { id: "rrf_diversified", label: "RRF · 문서 다양성 적용" },
] as const;
const stages = [
  { id: "embeddingMs", label: "질문 임베딩" }, { id: "vectorSearchMs", label: "벡터 검색" },
  { id: "keywordSearchMs", label: "키워드 검색" }, { id: "fusionMs", label: "RRF 결합" },
  { id: "diversityMs", label: "문서 다양성 적용" },
] as const;
const contexts = [
  { id: "baseline", label: "RRF 기준선" }, { id: "reranked", label: "리랭킹" },
  { id: "expanded", label: "리랭킹 + Parent 확장" },
] as const;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const time = (value: z.infer<typeof Times>) => `${value.p50.toFixed(2)} / ${value.p95.toFixed(2)} ms`;

export function Workspace1SearchQuality({ stage }: { readonly stage: "phase2" | "phase3" }) {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState("all");
  useEffect(() => {
    const request = new AbortController();
    void fetch(`/api/hybrid-search?kind=${stage}`, { signal: request.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(body).error);
        return body;
      })
      .then((body) => { if (!request.signal.aborted) setResult(body); })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "결과를 읽지 못했습니다.");
      });
    return () => request.abort();
  }, [stage]);

  if (error) return <p role="status">{error}</p>;
  if (!result) return <p role="status">검색 품질 결과를 불러오는 중입니다.</p>;

  if (stage === "phase2") {
    const parsed = Hybrid.safeParse(result);
    if (!parsed.success) return <p role="alert">2차 결과 형식을 확인해 주세요.</p>;
    const report = parsed.data;
    const metrics = report.variantMetrics[variant] ?? report.metrics;
    const count = report.variantCounts[variant] ?? report.caseCount;
    return (
      <section className={styles.content} aria-label="Workspace 1 하이브리드 비교">
        <p>Workspace 1 · v{report.datasetVersion} · AI 초안 {count.toLocaleString("ko-KR")}문항 · 생성 호출 {report.generationCalls}회</p>
        <label className={styles.picker}>
          표현 유형별 성능
          <select value={variant} onChange={(event) => setVariant(event.target.value)}>
            <option value="all">전체 표현</option>
            {Object.keys(report.variantMetrics).map((label) => <option key={label}>{label}</option>)}
          </select>
        </label>
        <div className={styles.corpora}>
          {modes.map(({ id, label }) => (
            <section className={`panel ${styles.metricCard}`} key={id}>
              <h2>{label}</h2>
              <p className={styles.recall}><strong>{percent(metrics[id].documentRecallAt10)}</strong> 문서 Recall@10</p>
              <dl className={styles.metrics}>
                <dt>문서 nDCG@5</dt><dd>{metrics[id].ndcgAt5.toFixed(3)}</dd>
                <dt>근거 구절 Recall@10</dt><dd>{percent(metrics[id].evidenceSpanRecallAt10)}</dd>
                <dt>상위 10개 청크의 평균 문서 수</dt><dd>{metrics[id].distinctDocumentsInTop10.toFixed(2)}</dd>
                <dt>검색 경로 p50/p95</dt><dd>{time(metrics[id].searchMs)}</dd>
              </dl>
            </section>
          ))}
        </div>
        <section className={`panel ${styles.metricCard}`}>
          <h2>전체 문항의 단계별 p50/p95</h2>
          <dl className={styles.metrics}>
            {stages.map(({ id, label }) => <div className={styles.metricRow} key={id}><dt>{label}</dt><dd>{time(report.stageTimes[id])}</dd></div>)}
          </dl>
        </section>
      </section>
    );
  }

  const parsed = Rerank.safeParse(result);
  if (!parsed.success) return <p role="alert">3차 결과 형식을 확인해 주세요.</p>;
  const report = parsed.data;
  return (
    <section className={styles.content} aria-label="Workspace 1 리랭킹 비교">
      <p>Workspace 1 · AI 초안 {report.caseCount}문항 표본 · 문맥 최대 {report.contextBudget.toLocaleString("ko-KR")}토큰 · 생성 호출 {report.generationCalls}회</p>
      <p>CPU 리랭킹 p50/p95 <strong>{time(report.rerankMs)}</strong></p>
      <div className={styles.grid}>
        {contexts.map(({ id, label }) => (
          <section className={`panel ${styles.metricCard}`} key={id}>
            <h2>{label}</h2>
            <p className={styles.recall}><strong>{percent(report.metrics[id].evidenceInContext)}</strong> 문맥의 기대 근거 포함률</p>
            <dl className={styles.metrics}>
              <dt>문서 nDCG@5</dt><dd>{report.metrics[id].ndcgAt5.toFixed(3)}</dd>
              <dt>근거 구절 Recall@5</dt><dd>{percent(report.metrics[id].evidenceAt5)}</dd>
              <dt>평균 문맥 토큰</dt><dd>{Math.round(report.metrics[id].contextTokens)}</dd>
              <dt>문맥 구성 p50/p95</dt><dd>{time(report.metrics[id].contextMs)}</dd>
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}
