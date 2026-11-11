"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Workspace1Dataset } from "../lib/workspace1-dataset";
import { EvaluationCases, type EvaluationCase } from "./EvaluationCases";

export function Workspace1EvaluationDraft() {
  const [draft, setDraft] = useState<z.infer<typeof Workspace1Dataset> | null>(null);
  const [error, setError] = useState("");
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

  const cases = useMemo<EvaluationCase[]>(() => draft?.scenarios.flatMap((scenario) => {
    const evidence = {
      requiredFacts: scenario.requiredFacts,
      forbiddenClaims: scenario.forbiddenClaims,
      references: scenario.v130References,
      evidence: scenario.evidence,
    };
    return scenario.variants.map((wording) => ({
      id: wording.id,
      scenario: scenario.scenario,
      category: scenario.category,
      question: wording.question,
      variant: wording.variantLabel,
      variantDetail: wording.variantDetail,
      history: scenario.history,
      documents: [],
      expectedBehavior: scenario.expectedBehavior,
      expectedType: scenario.expectedType,
      expectedEvidenceIds: scenario.expectedEvidenceIds.map(String),
      draft: evidence,
    }));
  }) ?? [], [draft]);

  if (error) return <p role="alert">{error}</p>;
  if (!draft) return <p role="status">Workspace 1 평가셋을 불러오는 중입니다.</p>;

  return (
    <EvaluationCases
      cases={cases}
      name="Workspace 1 · 운영 문서 평가셋"
      version={draft.version}
      source={`문서 ${draft.documentsRead}개 · 회의 ${draft.meetingsRead}개`}
      status="AI 초안"
    />
  );
}
