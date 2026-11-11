"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { EvalCase, Review } from "../lib/schema";

export const caseLabels = {
  answer: "문서 답변",
  not_found: "확인 불가",
  clarify: "되묻기",
  deny: "접근 제한",
  partial: "부분 결과",
  recovery: "장애 복구",
  conversation: "일반 대화",
  unsupported: "지원 범위 밖",
  correct: "적합",
  incorrect: "부적합",
  hold: "판단 보류",
};

export type EvaluationCase = Pick<EvalCase,
  "id" | "scenario" | "category" | "question" | "setup" | "variant" |
  "history" | "documents" | "expectedBehavior" | "expectedEvidenceIds" | "expectedType"
> & {
  variantDetail?: string;
  draft?: {
    requiredFacts: readonly string[];
    forbiddenClaims: readonly string[];
    references: readonly string[];
    evidence: readonly {
      documentId: number;
      meetingId: number;
      field: "body" | "summary";
      quote: string;
      startOffset: number;
    }[];
  };
};

type ReviewControls = {
  latest: ReadonlyMap<string, Review>;
  history: readonly Review[];
  busy: boolean;
  submit: (caseId: string, outcome: Review["outcome"], notes: string) => Promise<boolean>;
};

const pageSize = 20;
const reviewOutcomes = ["correct", "incorrect", "hold"] as const;

export function EvaluationCases({
  cases, name, version, source, status, controls, overview, review,
}: {
  cases: readonly EvaluationCase[];
  name: string;
  version: string;
  source: string;
  status: string;
  controls?: ReactNode;
  overview?: ReactNode;
  review?: ReviewControls;
}) {
  const [query, setQuery] = useState("");
  const [variant, setVariant] = useState("");
  const [selected, setSelected] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const detail = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const variants = useMemo(
    () => [...new Set(cases.flatMap((item) => item.variant ? [item.variant] : []))],
    [cases],
  );
  const search = query.trim().toLowerCase();
  const matching = useMemo(() => cases.filter((item) =>
    (!variant || item.variant === variant) &&
    [item.id, item.scenario, item.category, item.question, ...item.expectedEvidenceIds]
      .some((value) => value.toLowerCase().includes(search)),
  ), [cases, search, variant]);
  const groups = useMemo(() => {
    const byScenario = new Map<string, EvaluationCase[]>();
    for (const item of matching) {
      const group = byScenario.get(item.scenario);
      if (group) group.push(item);
      else byScenario.set(item.scenario, [item]);
    }
    return [...byScenario];
  }, [matching]);
  const focus = matching.find((item) => item.id === selected) ?? matching[0];

  return (
    <section className="evaluation-cases" aria-label={name}>
      <div className="panel evaluation-metadata">
        <div>
          <h2>{name}</h2>
          <p>{source} · 시나리오 {new Set(cases.map((item) => item.scenario)).size.toLocaleString("ko-KR")}개 · 사례 {cases.length.toLocaleString("ko-KR")}개</p>
        </div>
        <div className="evaluation-tags">
          <span className="badge">v{version}</span>
          <span className="badge neutral">{status}</span>
          {controls}
        </div>
      </div>
      {overview}
      <div className="toolbar evaluation-filters">
        <div className="search">
          <Search size={16} aria-hidden />
          <input
            aria-label="사례 검색"
            type="search"
            placeholder="질문, 시나리오 또는 문서 ID"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(pageSize);
            }}
          />
        </div>
        <select
          aria-label="표현 유형"
          value={variant}
          onChange={(event) => {
            setVariant(event.target.value);
            setLimit(pageSize);
          }}
        >
          <option value="">전체 표현</option>
          {variants.map((label) => <option key={label}>{label}</option>)}
        </select>
        <span className="muted evaluation-count" role="status">
          시나리오 {groups.length.toLocaleString("ko-KR")}개 · 사례 {matching.length.toLocaleString("ko-KR")}개
        </span>
      </div>
      <div className="case-layout">
        <section className="panel case-list">
          <div className="panel-head">
            <div>
              <h2>평가 사례</h2>
              <p>시나리오를 펼쳐 질문 표현을 선택하세요.</p>
            </div>
          </div>
          {groups.slice(0, limit).map(([scenario, items]) => (
            <details className="case-group scenario-group" key={scenario}>
              <summary>
                <span className="case-id">{scenario}</span>
                <strong>{items[0].question}</strong>
                <span>{items.length}개</span>
              </summary>
              <div className="group-meta">{items[0].category}</div>
              {items.map((item) => {
                const decision = review?.latest.get(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`case-row ${focus?.id === item.id ? "selected" : ""}`}
                    aria-pressed={focus?.id === item.id}
                    aria-controls={detailId}
                    onClick={() => {
                      setSelected(item.id);
                      if (window.matchMedia("(max-width: 850px)").matches) detail.current?.focus();
                    }}
                  >
                    <span className="case-id">{item.id}</span>
                    <span className="row-main">
                      <strong>{item.question}</strong>
                      <small>{item.variant || item.category} · {caseLabels[item.expectedType]}</small>
                    </span>
                    <span className={`badge ${decision ? "" : "neutral"}`}>
                      {decision ? caseLabels[decision.outcome] : "미검수"}
                    </span>
                  </button>
                );
              })}
            </details>
          ))}
          {!groups.length && <div className="empty">검색 결과가 없어요.</div>}
          {groups.length > limit && (
            <div className="evaluation-pagination">
              <button className="outline" type="button" onClick={() => setLimit((count) => count + pageSize)}>
                시나리오 더 보기
              </button>
            </div>
          )}
        </section>
        {focus && (
          <div className="evaluation-detail" id={detailId} tabIndex={-1} ref={detail}>
            <CaseDetail key={focus.id} item={focus} review={review} />
          </div>
        )}
      </div>
    </section>
  );
}

function CaseDetail({ item, review }: { item: EvaluationCase; review?: ReviewControls }) {
  const [notes, setNotes] = useState("");
  const notesId = useId();
  const draft = item.draft;
  const decision = review?.latest.get(item.id);
  const reviewCount = review?.history.filter((entry) => entry.caseId === item.id).length ?? 0;
  const evidenceCount = draft?.evidence.length ?? item.documents.length;

  return (
    <section className="panel detail" aria-label="사례 상세">
      <div className="panel-head">
        <div>
          <div className="case-id">{item.id} · {item.scenario}</div>
          <h2>사례 상세</h2>
        </div>
        <span className="badge">{caseLabels[item.expectedType]}</span>
      </div>
      <div className="detail-block">
        <h3>질문{item.variant && ` · ${item.variant}`}</h3>
        <p className="question">{item.question}</p>
        {item.variantDetail && <p className="muted">{item.variantDetail}</p>}
      </div>
      {item.setup && (
        <div className="detail-block">
          <h3>상황과 전제</h3>
          <p>{item.setup}</p>
        </div>
      )}
      {item.history.length > 0 && (
        <div className="detail-block">
          <h3>이전 대화</h3>
          {item.history.map((turn, index) => (
            <p key={index} className="history">
              <span>{turn.role === "user" ? "사용자" : "답변"}</span> {turn.content}
            </p>
          ))}
        </div>
      )}
      <div className="detail-block">
        <h3>기대 동작</h3>
        <p>{item.expectedBehavior}</p>
        {draft && draft.requiredFacts.length > 0 && <p><strong>포함할 사실</strong> {draft.requiredFacts.join(" · ")}</p>}
        {draft && draft.forbiddenClaims.length > 0 && <p><strong>단정 금지</strong> {draft.forbiddenClaims.join(" · ")}</p>}
        {draft && draft.references.length > 0 && <p className="muted">v1.30 참조 {draft.references.join(", ")}</p>}
      </div>
      <div className="detail-block">
        <h3>{draft ? "근거 인용" : "참고 문서"} · {evidenceCount}개</h3>
        {draft ? (
          draft.evidence.map((entry) => (
            <blockquote className="document" key={`${entry.documentId}:${entry.field}:${entry.startOffset}`}>
              <strong>문서 #{entry.documentId} · {entry.field === "body" ? "본문" : "요약"}</strong>
              <small>회의 #{entry.meetingId}</small>
              <p>{entry.quote}</p>
            </blockquote>
          ))
        ) : item.documents.length ? (
          item.documents.map((d) => (
            <div className="document" key={d.id}>
              <strong>{d.title}</strong>
              <small>{d.id}{d.id.includes("-extra-") ? " · 관련 없는 문서" : ""}{d.fixtureStatus ? (d.fixtureStatus === "automatic_pass" ? " · 생성 모델의 자동 검토 통과, 사람 검수 전" : " · 내용 검수 필요") : ""}</small>
              {d.summary && <small>요약: {d.summary}</small>}
              {d.fixtureSource && <small>합성 원문 기준: {d.fixtureSource}</small>}
              {d.fixtureReason && <small>자동 검토: {d.fixtureReason}</small>}
              <small>
                {d.workspaceId && `Workspace: ${d.workspaceId} · `}
                {d.accessible === false ? "접근 불가" : "접근 가능"}
                {d.meetingStartedAt && ` · 회의 시작: ${d.meetingStartedAt}`}
                {d.createdAt && ` · 생성: ${d.createdAt}`}
              </small>
              <p>{d.content}</p>
            </div>
          ))
        ) : (
          <p className="muted">연결된 근거 후보가 없어요. 워크스페이스의 다른 문서도 확인해야 해요.</p>
        )}
        {draft && !evidenceCount && <p className="muted">연결된 근거 인용이 없어요.</p>}
        <p className="muted evidence">
          {decision?.outcome === "correct" ? "검수된 기대 근거" : "기대 근거 후보"} · {item.expectedEvidenceIds.join(", ") || "없음"}
        </p>
      </div>
      <div className="detail-block">
        {review ? (
          <>
            <label htmlFor={notesId}>사람 검수</label>
            <textarea
              id={notesId}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="판단 근거를 기록해 주세요 (합성 내용만)"
            />
            <div className="review-actions">
              {reviewOutcomes.map((outcome) => (
                <button
                  key={outcome}
                  className="outline"
                  type="button"
                  disabled={review.busy}
                  onClick={async () => {
                    if (await review.submit(item.id, outcome, notes)) setNotes("");
                  }}
                >
                  {caseLabels[outcome]}
                </button>
              ))}
            </div>
            <p className="muted">
              {decision ? `검수 이력 ${reviewCount}건 · 최근 ${caseLabels[decision.outcome]}` : "아직 검수하지 않았어요."}
            </p>
          </>
        ) : (
          <>
            <h3>사람 검수</h3>
            <p className="muted">인용 구절은 원문과 대조했어요. 질문과 판정 기준은 검수가 필요해요.</p>
          </>
        )}
      </div>
    </section>
  );
}
