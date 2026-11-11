"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { LabSearchResult } from "../lib/lab-search";
import styles from "./HybridSearchLab.module.css";

const corpus = {
  1: { label: "Workspace 1 · 게시된 평가 근거", example: "회의실 예약" },
  458: { label: "Workspace 458 · v1.30 합성 문서", example: "배포 전략" },
};
const fields = { body: "본문", summary: "요약", title: "제목" };
const meetingDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

export function LabSearchPanel() {
  const [workspace, setWorkspace] = useState<1 | 458>(458);
  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState<{ question: string; result: z.infer<typeof LabSearchResult> }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length < 2 || pending) return;
    setPending(true);
    setSearch(undefined);
    setError("");
    try {
      const response = await fetch("/api/hybrid-search?kind=search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, question }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).safeParse(payload);
        setError(failure.success ? failure.data.error : "검색에 실패했습니다. 다시 시도해 주세요.");
      } else {
        setSearch({ question: question.trim(), result: LabSearchResult.parse(payload) });
      }
    } catch {
      setError("검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.content} aria-labelledby="manual-search-heading">
      <form className={`panel ${styles.controls} ${styles.manualSearch}`} onSubmit={submit}>
        <div>
          <h2 id="manual-search-heading">직접 검색</h2>
          <p id="manual-search-description">Lab에 게시된 자료를 키워드로 찾아 원문 구절을 확인합니다.</p>
        </div>
        <label className={styles.picker}>
          워크스페이스
          <select value={workspace} disabled={pending} onChange={(event) => {
            setWorkspace(event.target.value === "1" ? 1 : 458);
            setSearch(undefined);
            setError("");
          }}>
            <option value={1}>{corpus[1].label}</option>
            <option value={458}>{corpus[458].label}</option>
          </select>
        </label>
        <div className={styles.searchInputRow}>
          <label className={styles.picker}>
            검색어
            <input value={question} onChange={(event) => setQuestion(event.target.value)}
              aria-describedby="manual-search-description" disabled={pending}
              placeholder={corpus[workspace].example} minLength={2} maxLength={240} required />
          </label>
          <button type="submit" className="primary" disabled={pending || question.trim().length < 2}>검색</button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {pending && "검색 중입니다."}
        {search && (
          <>“{search.question}” · {corpus[search.result.workspace].label} {search.result.documentsSearched}건 중 결과 {search.result.hits.length}건</>
        )}
      </div>
      {search && (search.result.hits.length ? (
        <ol className={styles.searchResults}>
          {search.result.hits.map((hit) => (
            <li key={hit.documentId} className={`panel ${styles.candidates}`}>
              <h3>{hit.title}</h3>
              <p className={styles.runHeading}>#{hit.documentId} · {fields[hit.field]}
                {hit.recordedAt && ` · ${meetingDate.format(new Date(hit.recordedAt))}`}</p>
              <blockquote>{hit.excerpt}</blockquote>
            </li>
          ))}
        </ol>
      ) : <p>일치하는 구절이 없습니다. 회의 제목이나 핵심 용어로 검색해 보세요.</p>)}
    </section>
  );
}
