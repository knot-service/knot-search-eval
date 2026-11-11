"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import styles from "./HybridSearchLab.module.css";

const Times = z.object({ p50: z.number(), p95: z.number() });
const Metrics = z.object({
  documentRecallAt10: z.number(),
  ndcgAt5: z.number(),
  evidenceSpanRecallAt10: z.number().nullable(),
  queryEmbeddingMs: Times,
  searchMs: Times,
});
const ModeMetrics = z.object({ document: Metrics, fixed: Metrics, sections: Metrics });
const Report = z.object({
  status: z.literal("observed_on_ai_draft"),
  caseCount: z.number(),
  datasetVersion: z.string(),
  generationCalls: z.number(),
  indexCounts: z.object({ document: z.number(), fixed: z.number(), sections: z.number() }),
  metrics: ModeMetrics,
  variantCounts: z.record(z.string(), z.number()),
  variantMetrics: z.record(z.string(), ModeMetrics),
});

const modes = [
  { id: "document", label: "문서 단위" },
  { id: "fixed", label: "고정 길이 Child" },
  { id: "sections", label: "Markdown 섹션 Child" },
] as const;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const time = (value: z.infer<typeof Times>) => `${value.p50.toFixed(2)} / ${value.p95.toFixed(2)} ms`;

export function Workspace1Phase1() {
  const [report, setReport] = useState<z.infer<typeof Report> | null>(null);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState("all");
  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/hybrid-search?kind=phase1", { signal: request.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(body).error);
        return Report.parse(body);
      })
      .then((result) => { if (!request.signal.aborted) setReport(result); })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "결과를 읽지 못했습니다.");
      });
    return () => request.abort();
  }, []);

  if (error) return <p role="status">{error}</p>;
  if (!report) return <p role="status">1차 청킹 비교 결과를 불러오는 중입니다.</p>;

  const metrics = report.variantMetrics[variant] ?? report.metrics;
  const count = report.variantCounts[variant] ?? report.caseCount;
  return (
    <section className={styles.content} aria-label="Workspace 1 청킹 비교">
      <p>Workspace 1 · v{report.datasetVersion} · AI 초안 {count.toLocaleString("ko-KR")}문항 · 생성 호출 {report.generationCalls}회</p>
      <label className={styles.picker}>
        표현 유형별 성능
        <select value={variant} onChange={(event) => setVariant(event.target.value)}>
          <option value="all">전체 표현</option>
          {Object.keys(report.variantMetrics).map((label) => <option key={label}>{label}</option>)}
        </select>
      </label>
      <div className={styles.grid}>
        {modes.map(({ id, label }) => {
          const metric = metrics[id];
          return (
            <section className={`panel ${styles.metricCard}`} key={id}>
              <h2>{label}</h2>
              <p className={styles.recall}><strong>{percent(metric.documentRecallAt10)}</strong> 문서 Recall@10</p>
              <dl className={styles.metrics}>
                <dt>벡터 수</dt><dd>{report.indexCounts[id].toLocaleString("ko-KR")}</dd>
                <dt>문서 nDCG@5</dt><dd>{metric.ndcgAt5.toFixed(3)}</dd>
                {metric.evidenceSpanRecallAt10 !== null && <>
                  <dt>근거 구절 Recall@10</dt><dd>{percent(metric.evidenceSpanRecallAt10)}</dd>
                </>}
                <dt>질문 임베딩 p50/p95</dt><dd>{time(metric.queryEmbeddingMs)}</dd>
                <dt>검색 p50/p95</dt><dd>{time(metric.searchMs)}</dd>
              </dl>
            </section>
          );
        })}
      </div>
    </section>
  );
}
