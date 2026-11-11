import { Fragment } from "react";
import { z } from "zod";
import styles from "./HybridSearchLab.module.css";

const Count = z.object({ matched: z.number(), total: z.number() });
const Stage = z.object({
  replayCases: z.number(),
  spanCases: z.number(),
  spans: Count,
  allMeetingsInContext: Count,
  allExpectedCited: Count,
  exactCitations: Count,
  supportedClaims: Count,
  lookup: z.object({ requests: z.number(), generationCalls: z.number() }),
});
const TrackedCase = z.object({
  requests: z.number(),
  inContext: z.number(),
  modelCited: z.number(),
  verified: z.number(),
});
const TrackedPair = z.object({ before: TrackedCase, after: TrackedCase });
const PassageTokens = z.object({ total: z.number(), offTopic: z.number() });
const CountComparison = z.object({ before: Count, after: Count });
const CitationComparison = z.object({
  workspace: z.number(), expectedCited: CountComparison, exactCitations: CountComparison,
});
const RecoveryTrial = z.object({ name: z.string(), included: z.number(), gained: z.number(), lost: z.number() });
const SupplementReport = z.object({
  misses: z.array(z.object({ reason: z.string(), count: z.number() })),
  variants: z.array(RecoveryTrial),
  live: z.array(CitationComparison),
  summary: z.string(),
  citationSummary: z.string(),
});
const RepresentativeReport = z.object({
  variants: z.array(RecoveryTrial.extend({ fullSlotRecovery: z.number() }).transform(
    ({ fullSlotRecovery, ...variant }) => ({ ...variant, targetRecovered: fullSlotRecovery }),
  )),
  meetings: z.array(z.object({ workspace: z.number(), coverage: CountComparison })),
  live: z.array(CitationComparison),
  summary: z.string(),
  citationSummary: z.string(),
});
const SupportingDocumentReport = RepresentativeReport.extend({
  variants: z.array(RecoveryTrial.extend({ targetRecovered: z.number() })),
});
const BudgetTable = z.object({
  columns: z.array(z.number()).min(2),
  rows: z.array(z.object({ label: z.string(), values: z.array(z.string()) })),
}).refine(({ columns, rows }) => rows.every(({ values }) => values.length === columns.length));
const TokenBudgetReport = z.object({
  search: BudgetTable,
  live: BudgetTable,
  sample: z.string(),
  conclusion: z.string(),
});
const Report = z.object({
  supplement: SupplementReport.optional(),
  representative: RepresentativeReport.optional(),
  supportingDocuments: SupportingDocumentReport.optional(),
  supportingSelection: SupportingDocumentReport.optional(),
  protectedSupport: SupportingDocumentReport.optional(),
  remainingEvidence: SupportingDocumentReport.extend({ misses: SupplementReport.shape.misses }).optional(),
  sameDocumentEvidence: SupportingDocumentReport.extend({ misses: SupplementReport.shape.misses }).optional(),
  tokenBudgets: TokenBudgetReport.optional(),
  evidenceStages: z.array(z.object({
    stage: z.number(), setting: z.string(), included: z.number(),
    gained: z.number().nullable(), lost: z.number().nullable(),
  })).optional(),
  workspaces: z.array(z.object({
    workspaceId: z.union([z.literal(1), z.literal(458)]),
    before: Stage,
    after: Stage,
  })),
  s18: z.object({
    sequential: TrackedPair, sustained: TrackedPair,
    passageTokens: z.object({ before: PassageTokens, after: PassageTokens }),
  }),
});
const labels = { 1: "Workspace 1 · 운영 문서 평가셋 초안", 458: "Workspace 458 · v1.30" };
const fraction = (matched: number, total: number) => `${matched}/${total}`;
const compare = (before: z.infer<typeof Count>, after: z.infer<typeof Count>) =>
  `${fraction(before.matched, before.total)} → ${fraction(after.matched, after.total)}`;
const stages = [
  ["spans", "기대 근거 구절 포함"],
  ["allMeetingsInContext", "종합 문맥에 기대 회의 모두 포함"],
  ["allExpectedCited", "답변에 기대 문서 모두 인용"],
  ["exactCitations", "원문과 일치한 인용"],
  ["supportedClaims", "인용이 전체를 뒷받침한 주장"],
] as const;
const trackedStages = [
  ["inContext", "Qwen 문맥에 기대 문서 포함"],
  ["modelCited", "Qwen이 기대 문서 인용"],
  ["verified", "최종 답변에 기대 문서 인용"],
] as const;

export function SearchQualityReport({ result }: { readonly result: unknown }) {
  const parsed = Report.safeParse(result);
  if (!parsed.success) return <p role="alert">정확도 1차 결과 형식을 확인해 주세요.</p>;
  const {
    s18, evidenceStages, supplement, representative, supportingDocuments, supportingSelection,
    protectedSupport, remainingEvidence, tokenBudgets, sameDocumentEvidence,
  } = parsed.data;

  return (
    <section className={styles.content} aria-label="정확도 1차 전후 비교">
      <div>
        <h2>근거 구절과 인용 정확도</h2>
        <p>비슷한 리랭킹 점수에서는 본문을 우선하고, 검색된 청크에 먼저 토큰을 배분했습니다. 관련도 차이가 큰 후보에는 짧은 구절을 남겨 다른 회의의 근거도 확인할 수 있게 했습니다.</p>
        <ul>
          {sameDocumentEvidence && <li><a href="#same-document-evidence-heading">4,096토큰 · 같은 문서의 추가 근거</a></li>}
          {tokenBudgets && <li><a href="#token-budget-heading">문맥 토큰 예산과 Qwen 최종 인용</a></li>}
          {evidenceStages && <li><a href="#evidence-stages-heading">기대 근거 구절 개선 · 0~5단계 결과</a></li>}
          {supplement && <li><a href="#supplement-heading">빈 문맥 슬롯 · 겹침 감점 실험</a></li>}
          {representative && <li><a href="#representative-heading">회의별 대표와 문맥 범위 실험</a></li>}
          {supportingDocuments && <li><a href="#supporting-document-heading">같은 회의의 보조 근거 실험</a></li>}
          {remainingEvidence && <li><a href="#remaining-evidence-heading">남은 108구절 · 누락 단계와 문맥 확장</a></li>}
          {protectedSupport && <li><a href="#protected-support-heading">기존 근거를 보존한 보조 문서 개선</a></li>}
          {supportingSelection && <li><a href="#supporting-selection-heading">보조 문서 선택 개선</a></li>}
        </ul>
      </div>
      {sameDocumentEvidence && <TargetedRecoveryComparison report={sameDocumentEvidence} targetCount={35}
        headingId="same-document-evidence-heading" title="4,096토큰 · 같은 문서의 추가 근거" misses={sameDocumentEvidence.misses} />}
      {tokenBudgets && (
        <section className={`panel ${styles.metricCard}`} aria-labelledby="token-budget-heading">
          <h3 id="token-budget-heading" className={styles.evidenceHeading}>문맥 토큰 예산과 Qwen 최종 인용</h3>
          <p>{tokenBudgets.conclusion}</p>
          <BudgetComparison label="검색·문맥 재생" table={tokenBudgets.search} />
          <p className={styles.runHeading}>{tokenBudgets.sample}</p>
          <BudgetComparison label="Spring·Qwen 실응답" table={tokenBudgets.live} />
        </section>
      )}
      {remainingEvidence && <TargetedRecoveryComparison report={remainingEvidence} targetCount={108}
        headingId="remaining-evidence-heading" title="남은 108구절 · 누락 단계와 문맥 확장" misses={remainingEvidence.misses} />}
      {protectedSupport && <TargetedRecoveryComparison report={protectedSupport} targetCount={38}
        headingId="protected-support-heading" title="기존 근거를 보존한 보조 문서 개선" />}
      {supportingSelection && <TargetedRecoveryComparison report={supportingSelection} targetCount={49}
        headingId="supporting-selection-heading" title="보조 문서 선택 개선" />}
      {supportingDocuments && <TargetedRecoveryComparison report={supportingDocuments} targetCount={85}
        headingId="supporting-document-heading" title="같은 회의의 보조 근거 실험" />}
      {representative && <TargetedRecoveryComparison report={representative} targetCount={62}
        headingId="representative-heading" title="회의별 대표와 문맥 범위 실험" />}
      {supplement && <SupplementComparison report={supplement} />}
      <div className={styles.corpora}>
        {parsed.data.workspaces.map(({ workspaceId, before, after }) => (
          <section className={`panel ${styles.metricCard}`} key={workspaceId}>
            <h3>{labels[workspaceId]}</h3>
            <p className={styles.runHeading}>검색 재생 {before.replayCases}건 · 구절 검증 {before.spanCases}문항 · 기존 → 개선</p>
            <dl className={styles.metrics}>
              {stages.map(([key, label]) => (
                <div key={key} className={styles.metricRow}>
                  <dt>{label}</dt><dd>{compare(before[key], after[key])}</dd>
                </div>
              ))}
              <div className={styles.metricRow}>
                <dt>문서 찾기 생성 LLM</dt>
                <dd>{before.lookup.generationCalls}회 → {after.lookup.generationCalls}회<br />각 {after.lookup.requests}건</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <section className={`panel ${styles.metricCard}`}>
        <h3>Workspace 458 · S18-01</h3>
        <p className={styles.runHeading}>
          배포·폴더 구조 두 문서가 차지한 토큰은 {s18.passageTokens.before.offTopic}/{s18.passageTokens.before.total}에서 {s18.passageTokens.after.offTopic}/{s18.passageTokens.after.total}로 줄었습니다.
        </p>
        <div className={styles.corpora}>
          {([["sequential", "단독 요청"], ["sustained", "지속 부하"]] as const).map(([key, label]) => {
            const { before, after } = s18[key];
            return (
              <section key={key}>
                <h4 className={styles.runHeading}>{label}</h4>
                <dl className={styles.metrics}>
                  {trackedStages.map(([metric, title]) => (
                    <div key={metric} className={styles.metricRow}>
                      <dt>{title}</dt>
                      <dd>{fraction(before[metric], before.requests)} → {fraction(after[metric], after.requests)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
        <p>이전 부하 실험에서 인용이 빠진 6건의 Qwen 원응답은 저장되지 않았습니다. 이번 재실행에서는 Qwen이 낸 인용과 최종 인용을 각각 확인했습니다.</p>
      </section>
      <p>Workspace 1은 기존 기대 구절 전체를, Workspace 458은 v1.30 기대 문서에 근거 구절을 표시한 고정 5문항을 사용했습니다. 주장에 대한 인용의 뒷받침 여부는 각 워크스페이스에서 실제 생성한 5개 답변을 검수했습니다.</p>
      <p>인용 복사 지시를 바꾼 후보는 Workspace 1의 개별 복사 오류를 줄였지만, 기대 문서를 모두 인용한 답변이 2/5건에서 1/5건으로 줄어 채택을 보류했습니다.</p>
      {evidenceStages && (
        <section className={`panel ${styles.metricCard}`} aria-labelledby="evidence-stages-heading">
          <h3 id="evidence-stages-heading" className={styles.evidenceHeading}>기대 근거 구절 개선 · 0~5단계</h3>
          <p className={styles.runHeading}>Spring 검색 260문항에서 Workspace 1은 295/526 → 376/526개, Workspace 458은 7/7 → 7/7개였습니다. Workspace 1의 기존 구절은 모두 남았고 81개가 추가됐습니다.</p>
          <table className={`${styles.timingTable} ${styles.evidenceTable}`} aria-label="Workspace 1의 단계별 기대 근거 구절 포함 수">
            <thead>
              <tr>
                <th scope="col">단계</th><th scope="col">실험 설정</th><th scope="col">포함</th>
                <th scope="col">회복</th><th scope="col">누락</th>
              </tr>
            </thead>
            <tbody>
              {evidenceStages.map(({ stage, setting, included, gained, lost }) => (
                <tr key={setting}>
                  <td>{stage}</td><th scope="row">{setting}</th><td>{included}/526</td>
                  <td>{gained ?? "—"}</td><td>{lost ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>회복·누락은 각 실험의 비교 기준 대비 수치입니다. RRF 출력은 20개, 관련도가 낮은 구절의 상한은 96토큰으로 유지했습니다. 1,536에서 2,048토큰으로 늘리면 3구절이 추가됐습니다.</p>
          <dl className={styles.metrics}>
            <div className={styles.metricRow}><dt>기대 회의 전체 포함 · Workspace 1</dt><dd>131/140 → 135/140</dd></div>
            <div className={styles.metricRow}><dt>기대 회의 전체 포함 · Workspace 458</dt><dd>6/8 → 6/8</dd></div>
            <div className={styles.metricRow}><dt>기대 문서 전체 인용 · Workspace 1</dt><dd>2/5 → 2/5</dd></div>
            <div className={styles.metricRow}><dt>기대 문서 전체 인용 · Workspace 458</dt><dd>5/5 → 5/5</dd></div>
            <div className={styles.metricRow}><dt>문서 찾기 4건 생성·분류 호출</dt><dd>각 0회 → 0회</dd></div>
          </dl>
          <p>Workspace 458의 S18-01은 Qwen이 복사한 회의 시각 한 줄을 걷어낸 뒤 나머지를 원문과 대조하도록 수정했습니다. 실제 재실행에서 문서 #2158이 최종 답변에 남았습니다.</p>
        </section>
      )}
    </section>
  );
}

function BudgetComparison({ label, table }: {
  readonly label: string;
  readonly table: z.infer<typeof BudgetTable>;
}) {
  return (
    <table className={`${styles.timingTable} ${styles.recoveryTable}`} aria-label={label}>
      <thead>
        <tr>
          <th scope="col">{label}</th>
          {table.columns.map((budget) => <th scope="col" key={budget}>{budget.toLocaleString("ko-KR")}</th>)}
        </tr>
      </thead>
      <tbody>
        {table.rows.map(({ label, values }) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {values.map((value, index) => <td key={table.columns[index]}>{value}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TargetedRecoveryComparison({ report, targetCount, headingId, title, misses }: {
  readonly report: z.infer<typeof SupportingDocumentReport>;
  readonly targetCount: number;
  readonly misses?: z.infer<typeof SupplementReport.shape.misses>;
  readonly headingId: string;
  readonly title: string;
}) {
  return (
    <section className={`panel ${styles.metricCard}`} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.evidenceHeading}>{title}</h3>
      <p className={styles.runHeading}>{report.summary}</p>
      {misses && <dl className={styles.metrics}>
        {misses.map(({ reason, count }) => (
          <div key={reason} className={styles.metricRow}><dt>{reason}</dt><dd>{count}개</dd></div>
        ))}
      </dl>}
      <table className={`${styles.timingTable} ${styles.recoveryTable}`} aria-label={title}>
        <thead>
          <tr>
            <th scope="col">설정</th><th scope="col">포함</th><th scope="col">회복</th>
            <th scope="col">누락</th><th scope="col">{targetCount}개 중<br />회복</th>
          </tr>
        </thead>
        <tbody>
          {report.variants.map(({ name, included, gained, lost, targetRecovered }) => (
            <tr key={name}>
              <th scope="row">{name}</th><td>{included}/526</td><td>{gained}</td>
              <td>{lost}</td><td>{targetRecovered}/{targetCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className={styles.metrics}>
        {report.meetings.map(({ workspace, coverage }) => (
          <div className={styles.metricRow} key={workspace}>
            <dt>Workspace {workspace} · 기대 회의 모두 포함</dt>
            <dd>{compare(coverage.before, coverage.after)}</dd>
          </div>
        ))}
        <CitationRows rows={report.live} />
      </dl>
      <p>{report.citationSummary}</p>
    </section>
  );
}

function SupplementComparison({ report }: { readonly report: z.infer<typeof SupplementReport> }) {
  return (
    <section className={`panel ${styles.metricCard}`} aria-labelledby="supplement-heading">
      <h3 id="supplement-heading" className={styles.evidenceHeading}>빈 문맥 슬롯 · 겹침 감점 실험</h3>
      <p className={styles.runHeading}>{report.summary}</p>
      <dl className={styles.metrics}>
        {report.misses.map(({ reason, count }) => (
          <div key={reason} className={styles.metricRow}><dt>{reason}</dt><dd>{count}개</dd></div>
        ))}
      </dl>
      <table className={styles.timingTable} aria-label="빈 슬롯 규칙별 근거 구절 비교">
        <thead>
          <tr><th scope="col">설정</th><th scope="col">포함</th><th scope="col">회복</th><th scope="col">누락</th></tr>
        </thead>
        <tbody>
          {report.variants.map(({ name, included, gained, lost }) => (
            <tr key={name}>
              <th scope="row">{name}</th><td>{included}/526</td><td>{gained}</td><td>{lost}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className={styles.metrics}>
        <CitationRows rows={report.live} />
      </dl>
      <p>{report.citationSummary}</p>
    </section>
  );
}

function CitationRows({ rows }: { readonly rows: z.infer<typeof CitationComparison>[] }) {
  return rows.map(({ workspace, expectedCited, exactCitations }) => (
    <Fragment key={workspace}>
      <div className={styles.metricRow}>
        <dt>Workspace {workspace} · 기대 문서 모두 인용</dt>
        <dd>{compare(expectedCited.before, expectedCited.after)}</dd>
      </div>
      <div className={styles.metricRow}>
        <dt>Workspace {workspace} · 원문과 일치한 인용</dt>
        <dd>{compare(exactCitations.before, exactCitations.after)}</dd>
      </div>
    </Fragment>
  ));
}
