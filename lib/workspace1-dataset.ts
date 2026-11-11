import { z } from "zod";

const Evidence = z.object({
  documentId: z.number(),
  field: z.enum(["body", "summary"]),
  quote: z.string(),
  startOffset: z.number().int(),
  endOffset: z.number().int(),
  meetingId: z.number(),
});
const Wording = z.object({
  id: z.string(),
  variant: z.string(),
  variantLabel: z.string(),
  variantDetail: z.string(),
  question: z.string(),
});
const Scenario = z.object({
  scenario: z.string(),
  category: z.string(),
  expectedType: z.enum(["answer", "not_found", "clarify", "partial"]),
  expectedBehavior: z.string(),
  v130References: z.array(z.string()),
  requiredFacts: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  evidence: z.array(Evidence),
  expectedEvidenceIds: z.array(z.number()),
});
const Header = z.object({
  id: z.literal("knot-workspace-1"),
  workspaceId: z.literal(1),
  source: z.literal("production_snapshot"),
  status: z.literal("ai_draft"),
  version: z.string(),
  sourceHash: z.string(),
  documentsRead: z.number(),
  meetingsRead: z.number(),
  referenceDataset: z.string(),
});
const Expanded = Header.extend({ cases: z.array(Scenario.merge(Wording)).min(1) });
export const Workspace1Dataset = Header.extend({
  caseCount: z.number(),
  scenarios: z.array(Scenario.extend({ variants: z.array(Wording).min(1) })),
});

export function toWorkspace1Dataset(input: unknown): z.infer<typeof Workspace1Dataset> {
  const { cases, ...metadata } = Expanded.parse(input);
  const groups = new Map<string, z.infer<typeof Expanded>["cases"]>();
  for (const item of cases) {
    const group = groups.get(item.scenario) ?? [];
    group.push(item);
    groups.set(item.scenario, group);
  }
  const scenarios = [...groups.values()].map((group) => {
    const baseline = group.find((item) => item.variant === "01");
    if (!baseline) throw new Error("A Workspace 1 scenario is missing its baseline wording.");
    return {
      ...Scenario.parse(baseline),
      variants: group.map((item) => Wording.parse(item)),
    };
  });
  return { ...metadata, caseCount: cases.length, scenarios };
}
