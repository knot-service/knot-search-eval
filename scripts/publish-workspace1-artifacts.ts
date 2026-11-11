import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { z } from "zod";

import { toWorkspace1Dataset } from "../lib/workspace1-dataset";

const ResultHeader = z.object({
  status: z.literal("observed_on_ai_draft"),
  sourceHash: z.string(),
  datasetVersion: z.string(),
  caseCount: z.number().int().positive(),
  generationCalls: z.literal(0),
  createdAt: z.string(),
  metrics: z.record(z.string(), z.unknown()),
});
const Phase1 = ResultHeader.extend({
  indexCounts: z.record(z.string(), z.number()),
  variantCounts: z.record(z.string(), z.number()),
  variantMetrics: z.record(z.string(), z.unknown()),
});

const Phase2 = ResultHeader.extend({
  candidateDepth: z.number(), rrfK: z.number(),
  stageTimes: z.record(z.string(), z.unknown()),
  variantCounts: z.record(z.string(), z.number()),
  variantMetrics: z.record(z.string(), z.unknown()),
});
const Phase3 = ResultHeader.extend({
  reranker: z.string(), rerankerRevision: z.string(), contextBudget: z.number(),
  contextTokenizer: z.string(), rerankMs: z.object({ p50: z.number(), p95: z.number() }),
});

async function main() {
  const [datasetPath, reportPath, phase2Path, phase3Path] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!datasetPath || !reportPath || !url) {
    throw new Error("Pass the dataset and report files with the linked production DATABASE_URL.");
  }
  const target = new URL(url);
  if (!target.hostname.endsWith(".neon.tech") || target.searchParams.get("sslmode") !== "require") {
    throw new Error("Expected the linked Vercel Neon connection over TLS.");
  }
  const draft = toWorkspace1Dataset(JSON.parse(await readFile(datasetPath, "utf8")));
  const report = Phase1.parse(JSON.parse(await readFile(reportPath, "utf8")));
  const phase2 = phase2Path ? Phase2.parse(JSON.parse(await readFile(phase2Path, "utf8"))) : null;
  const phase3 = phase3Path ? Phase3.parse(JSON.parse(await readFile(phase3Path, "utf8"))) : null;
  for (const artifact of [report, phase2, phase3]) {
    if (artifact && (draft.sourceHash !== artifact.sourceHash || draft.version !== artifact.datasetVersion)) {
      throw new Error("The dataset and search quality reports must come from the same version.");
    }
  }

  const database = new Client({ connectionString: url, connectionTimeoutMillis: 6000 });
  await database.connect();
  try {
    await database.query("BEGIN");
    const state = await database.query("SELECT id FROM eval_state WHERE id=1");
    if (state.rowCount !== 1) throw new Error("Expected the existing evaluation database.");
    await database.query(
      `CREATE TABLE IF NOT EXISTS eval_workspace1_artifacts (
         id text PRIMARY KEY,
         version text NOT NULL,
         dataset jsonb NOT NULL,
         phase1 jsonb NOT NULL
       )`,
    );
    await database.query(
      "ALTER TABLE eval_workspace1_artifacts ADD COLUMN IF NOT EXISTS phase2 jsonb, ADD COLUMN IF NOT EXISTS phase3 jsonb",
    );
    await database.query(
      `INSERT INTO eval_workspace1_artifacts (id,version,dataset,phase1,phase2,phase3)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,
       dataset=EXCLUDED.dataset, phase1=EXCLUDED.phase1,
       phase2=COALESCE(EXCLUDED.phase2, CASE WHEN eval_workspace1_artifacts.phase2->>'sourceHash'=EXCLUDED.phase1->>'sourceHash'
         AND eval_workspace1_artifacts.phase2->>'datasetVersion'=EXCLUDED.version THEN eval_workspace1_artifacts.phase2 END),
       phase3=COALESCE(EXCLUDED.phase3, CASE WHEN eval_workspace1_artifacts.phase3->>'sourceHash'=EXCLUDED.phase1->>'sourceHash'
         AND eval_workspace1_artifacts.phase3->>'datasetVersion'=EXCLUDED.version THEN eval_workspace1_artifacts.phase3 END)`,
      [draft.id, draft.version, JSON.stringify(draft), JSON.stringify(report),
       phase2 && JSON.stringify(phase2), phase3 && JSON.stringify(phase3)],
    );
    const readback = await database.query<{ dataset: unknown; phase1: unknown; phase2: unknown; phase3: unknown }>(
      "SELECT dataset,phase1,phase2,phase3 FROM eval_workspace1_artifacts WHERE id=$1",
      [draft.id],
    );
    if (!isDeepStrictEqual(readback.rows[0]?.dataset, draft) ||
        !isDeepStrictEqual(readback.rows[0]?.phase1, report) ||
        (phase2 && !isDeepStrictEqual(readback.rows[0]?.phase2, phase2)) ||
        (phase3 && !isDeepStrictEqual(readback.rows[0]?.phase3, phase3))) {
      throw new Error("Hosted artifact readback differed from the local files.");
    }
    await database.query("COMMIT");
    console.log(`Published ${draft.id}@${draft.version}: ${draft.caseCount} questions, phase 1 ${report.caseCount}, phase 2 ${phase2?.caseCount ?? 0}, phase 3 ${phase3?.caseCount ?? 0}.`);
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  } finally {
    await database.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Publication failed.");
  process.exitCode = 1;
});
