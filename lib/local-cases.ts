import type { EvalCase } from "./schema";

// These cases were inspected for conditions that can be reproduced by isolated documents alone.
const DOCUMENT_SCENARIOS = new Set([
  "S01", "S02", "S03", "S08", "S12", "S16", "S18", "S19", "S10", "S13", "S14", "S04", "S05", "S06", "S07", "S22", "S23", "S24", "S25", "S26", "S27", "S28", "S29", "S30", "S31", "S34", "S35", "S36", "S42", "S44", "S48", "S49", "S50", "S52", "S53", "S54", "S57", "S58", "S59", "S60", "S61", "S63", "S64", "S65", "S67", "S69", "S70", "S71", "S72", "S73", "S74", "S75", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09",
]);
export type CaseReadiness = { readonly ready: true } | { readonly ready: false; readonly reason: string };
const CLOCK_SCENARIOS = new Set(['S09','S11','S17','S20','S46','S49','S50','S55','S62','S66','S76']);
export function caseReadiness(c: EvalCase, now: Date = new Date(), review?: "correct" | "incorrect" | "hold"): CaseReadiness {
  if (c.executionHoldReason) return { ready: false, reason: c.executionHoldReason };
  if (c.history.length && (c.history.length % 2 !== 0 || c.history.some((item, i) => item.role !== (i % 2 === 0 ? "user" : "assistant")))) return { ready: false, reason: "완전한 이전 대화가 없어 재현 보류" };
  if (!DOCUMENT_SCENARIOS.has(c.scenario) && !(c.evaluationTime && CLOCK_SCENARIOS.has(c.scenario)) && !(c.evaluationTime && ['S37', 'S38'].includes(c.scenario) && c.executionFixture === 'no_document_recording') && !(c.scenario === 'S68' && c.evaluationTime && c.executionFixture === 'document_after_intake') && !(['S43','S56'].includes(c.scenario) && c.executionFixture === 'limited_context') && !(c.scenario === 'S15' && c.executionFixture === 'no_search_observation')) return { ready: false, reason: "시간·권한·장애 등 실행 조건 준비 중" };
  if (review === "incorrect" || review === "hold") return {ready:false,reason:"사람 검수에서 보류된 사례"};
  if (c.documents.some((d) => d.fixtureStatus && d.fixtureStatus !== "automatic_pass") && review !== "correct") return { ready: false, reason: "합성 문서 내용 검수 필요" };
  const inaccessible = c.documents.filter((d) => d.accessible === false || (d.workspaceId && !["workspace-a", "workspace-458"].includes(d.workspaceId)));
  if (inaccessible.some((d) => c.scenario !== "S31" || d.accessible !== false || d.workspaceId !== "workspace-b")) return { ready: false, reason: "문서별 권한 재현 준비 중" };
  const dated = c.documents.some((d) => d.fixtureSource !== "워크스페이스 458" && (d.meetingStartedAt || d.createdAt));
  if (dated && !["S16", "S18"].includes(c.scenario)) return { ready: false, reason: "문서 시각 재현 준비 중" };
  if (["S16", "S18"].includes(c.scenario)) {
    const date = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
    if (date < "2026-10-22" || date > "2026-12-31") return {ready:false,reason:"사례의 연도 기준을 고정할 수 없음"};
  }
  return { ready: true };
}

/** Shared-corpus runs cannot reproduce the old missing-document or restricted-workspace fixtures. */
export function sharedCaseReadiness(c: EvalCase, now: Date = new Date(), review?: "correct" | "incorrect" | "hold"): CaseReadiness {
  const base = caseReadiness(c, now, review);
  if (!base.ready) return base;
  if (c.scenario === "S58" && (!c.expectedEvidenceIds.includes("document-2193") || !c.expectedEvidenceIds.includes("document-2194") || c.history.length < 2)) return { ready: false, reason: "같은 주제의 두 문서와 이전 대화가 확인되지 않았습니다." };
  if (c.scenario === "S71" && !["document-2207", "document-2209", "document-2161"].every((id) => c.documents.some((document) => document.id === id))) return { ready: false, reason: "JWT 근거와 혼동 가능한 세션 기록 확인 필요" };
  if (c.documents.some((d) => d.accessible === false || (d.workspaceId && !["workspace-a", "workspace-458"].includes(d.workspaceId)))) return { ready: false, reason: "공통 공간에서 권한 조건 재현 불가" };
  if (c.expectedType === "partial" && c.executionFixture === "limited_context" && review === "correct") return { ready: true };
  if (c.expectedType === "clarify" && review === "correct") return { ready: true };
  if (c.expectedType === "not_found" && review === "correct") return { ready: true };
  if ((c.expectedType === "conversation" || c.expectedType === "unsupported") && review === "correct") return { ready: true };
  if (c.expectedType !== "answer" || !c.expectedEvidenceIds.length) return { ready: false, reason: "공통 자료에서 기대 결과 재검수 필요" };
  return { ready: true };
}
