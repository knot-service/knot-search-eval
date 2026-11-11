import { z } from "zod";
import type { Workspace1Dataset } from "./workspace1-dataset";

export const LabSearchQuery = z.object({
  workspace: z.union([z.literal(1), z.literal(458)]),
  question: z.string().trim().min(2).max(240),
});

export const LabSearchResult = z.object({
  workspace: LabSearchQuery.shape.workspace,
  documentsSearched: z.number(),
  hits: z.array(z.object({
    documentId: z.string(),
    title: z.string(),
    recordedAt: z.string().nullable(),
    field: z.enum(["body", "summary", "title"]),
    excerpt: z.string(),
  })),
});

type SearchHit = z.infer<typeof LabSearchResult>["hits"][number];
type SearchDocument = Omit<SearchHit, "excerpt" | "field"> & {
  passages: ReadonlyArray<Pick<SearchHit, "field" | "excerpt">>;
};

const SyntheticDocuments = z.array(z.object({
  documents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string().nullish(),
    content: z.string(),
    workspaceId: z.union([z.number(), z.string()]),
    accessible: z.boolean(),
    meetingStartedAt: z.string().nullish(),
  })),
}));

export function syntheticCorpus(input: unknown): SearchDocument[] {
  const documents = new Map<string, SearchDocument>();
  const withheld = new Set<string>();
  for (const { documents: entries } of SyntheticDocuments.parse(input)) {
    for (const entry of entries) {
      if (!entry.accessible || !["458", "workspace-458"].includes(String(entry.workspaceId))) {
        withheld.add(entry.id);
        continue;
      }
      documents.set(entry.id, {
        documentId: entry.id.replace(/^document-/, ""),
        title: entry.title,
        recordedAt: entry.meetingStartedAt ?? null,
        passages: [
          { field: "summary", excerpt: entry.summary ?? "" },
          ...entry.content.split(/\n+/).filter(Boolean).map((excerpt) => ({ field: "body" as const, excerpt })),
        ],
      });
    }
  }
  return [...documents].flatMap(([id, document]) => withheld.has(id) ? [] : [document]);
}

export function publishedEvidenceCorpus(dataset: z.infer<typeof Workspace1Dataset>): SearchDocument[] {
  const grouped = new Map<string, SearchDocument["passages"][number][]>();
  for (const { evidence } of dataset.scenarios) {
    for (const { documentId, field, quote } of evidence) {
      const id = String(documentId);
      const group = grouped.get(id) ?? [];
      if (!group.some(({ field: type, excerpt }) => type === field && excerpt === quote)) {
        group.push({ field, excerpt: quote });
        grouped.set(id, group);
      }
    }
  }
  return [...grouped].map(([documentId, passages]) => ({
    documentId, title: `문서 #${documentId}`, recordedAt: null, passages,
  }));
}

const words = (input: string) => input.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const ignored = new Set(["어떤", "뭐야", "뭐였어", "찾아", "찾아줘", "알려줘", "정리해", "했어", "있어", "좀"]);

function searchTerms(input: string) {
  return new Set(words(input).filter((word) => word.length >= 2 && !ignored.has(word)));
}

function hangulPairs(word: string) {
  if (!/^[가-힣]+$/.test(word)) return [];
  return Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2));
}

export function searchLabDocuments(documents: readonly SearchDocument[], question: string): SearchHit[] {
  const terms = [...searchTerms(question)];
  const postings = documents.map((doc) => ({
    doc, title: words(doc.title).join(" "), text: words(doc.passages.map(({ excerpt }) => excerpt).join(" ")).join(" "),
  }));
  const weights = terms.map((term) =>
    1 + Math.log((postings.length + 1) / (1 + postings.filter(({ title, text }) =>
      title.includes(term) || text.includes(term)).length)),
  );
  const score = (text: string) => terms.reduce((total, term, index) => {
    if (text.includes(term)) return total + weights[index];
    const pairs = hangulPairs(term);
    const matches = pairs.filter((pair) => text.includes(pair)).length;
    return total + (matches >= 2 ? 0.35 * weights[index] * matches / pairs.length : 0);
  }, 0);

  return postings.flatMap(({ doc, title }) => {
    const { passages, ...metadata } = doc;
    const ranked = passages.map((passage) => ({ passage, score: score(words(passage.excerpt).join(" ")) }))
      .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
    const rank = 2 * score(title) + (ranked[0]?.score ?? 0);
    if (rank <= 0) return [];
    return [{
      rank,
      hit: { ...metadata, ...(ranked[0]?.passage ?? { field: "title" as const, excerpt: doc.title }) },
    }];
  }).sort((a, b) => b.rank - a.rank || a.hit.documentId.localeCompare(b.hit.documentId, "en", { numeric: true }))
    .slice(0, 10).map(({ hit }) => hit);
}
