"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Workspace1Dataset } from "../lib/workspace1-dataset";
import styles from "./HybridSearchLab.module.css";

const outcomes = {
  answer: "문서 답변", not_found: "확인 불가", clarify: "되묻기", partial: "부분 답변",
};

export function Workspace1EvaluationDraft() {
  const [draft, setDraft] = useState<z.infer<typeof Workspace1Dataset> | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [variant, setVariant] = useState("all");
  const [visible, setVisible] = useState(20);

  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/hybrid-search?kind=dataset", { signal: request.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(body).error);
        return Workspace1Dataset.parse(body);
      })
      .then((result) => { if (!request.signal.aborted) setDraft(result); })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "평가셋을 읽지 못했습니다.");
      });
    return () => request.abort();
  }, []);

  if (error) return <p role="status">{error}</p>;
  if (!draft) return <p role="status">Workspace 1 평가셋을 불러오는 중입니다.</p>;

  const variants = new Map(draft.scenarios.flatMap((item) =>
    item.variants.map((wording) => [wording.variant, wording.variantLabel] as const),
  ));
  const search = query.trim().toLowerCase();
  const matching = draft.scenarios.filter((item) => [
    item.scenario, item.category,
    ...item.variants.filter((wording) => variant === "all" || wording.variant === variant).map((wording) => wording.question),
    ...item.expectedEvidenceIds.map(String),
  ].some((value) => value.toLowerCase().includes(search)));

  return (
    <section className={styles.content} aria-label="Workspace 1 평가셋 초안">
      <div className={`panel ${styles.metricCard}`}>
        <h2>Workspace 1 평가셋 · AI 초안</h2>
        <p>v{draft.version} · 문서 {draft.documentsRead}개 · 회의 {draft.meetingsRead}개 · 시나리오 {draft.scenarios.length}개 · 질문 {draft.caseCount.toLocaleString("ko-KR")}개</p>
        <p>인용 구절은 원문과 대조했습니다. 질문과 판정 기준은 검수가 필요합니다.</p>
      </div>
      <div className={styles.draftFilters}>
        <label className={styles.picker}>
          시나리오 검색
          <input type="search" value={query} placeholder="질문, 유형 또는 문서 ID" onChange={(event) => {
            setQuery(event.target.value);
            setVisible(20);
          }} />
        </label>
        <label className={styles.picker}>
          표현 유형
          <select value={variant} onChange={(event) => {
            setVariant(event.target.value);
            setVisible(20);
          }}>
            <option value="all">전체 유형</option>
            {[...variants].map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <p role="status">{matching.length}개 시나리오</p>
      {matching.slice(0, visible).map((item) => {
        const wording = item.variants.find((entry) => entry.variant === variant) ?? item.variants[0];
        return (
          <details className={`panel ${styles.draftCase}`} key={item.scenario}>
            <summary>
              <span className={styles.draftMeta}>{item.scenario} · {item.category} · {outcomes[item.expectedType]}</span>
              <strong>{wording.question}</strong>
            </summary>
            <div className={styles.draftBody}>
              <dl className={styles.wordings}>
                {item.variants.map((entry) => (
                  <div key={entry.id} className={entry.variant === variant ? styles.selectedWording : undefined}>
                    <dt>{entry.variantLabel}<small>{entry.variantDetail}</small></dt>
                    <dd>{entry.question}</dd>
                  </div>
                ))}
              </dl>
              {item.history.length > 0 && <p><strong>앞선 대화</strong> {item.history.map((turn) => turn.content).join(" / ")}</p>}
              <p><strong>기대 행동</strong> {item.expectedBehavior}</p>
              {item.requiredFacts.length > 0 && <p><strong>포함할 사실</strong> {item.requiredFacts.join(" · ")}</p>}
              {item.forbiddenClaims.length > 0 && <p><strong>단정하면 안 되는 내용</strong> {item.forbiddenClaims.join(" · ")}</p>}
              <p className={styles.draftMeta}>v1.30 참조 {item.v130References.join(", ")}</p>
              {item.evidence.map((entry, index) => (
                <blockquote className={styles.quote} key={index}>
                  <strong>문서 #{entry.documentId} · {entry.field === "body" ? "본문" : "요약"}</strong>
                  <p>{entry.quote}</p>
                </blockquote>
              ))}
            </div>
          </details>
        );
      })}
      {matching.length > visible && <button className="primary" type="button" onClick={() => setVisible((count) => count + 20)}>더 보기</button>}
    </section>
  );
}
