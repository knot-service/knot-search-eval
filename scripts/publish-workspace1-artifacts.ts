import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { z } from "zod";

import { toWorkspace1Dataset } from "../lib/workspace1-dataset";

const Phase1 = z.object({
  status: z.literal("observed_on_ai_draft"),
  sourceHash: z.string(),
  datasetVersion: z.string(),
  caseCount: z.number().int().positive(),
  generationCalls: z.literal(0),
  createdAt: z.string(),
  indexCounts: z.record(z.string(), z.number()),
  metrics: z.record(z.string(), z.unknown()),
  variantCounts: z.record(z.string(), z.number()),
  variantMetrics: z.record(z.string(), z.unknown()),
});

async function main() {
  const [datasetPath, reportPath] = process.argv.slice(2);
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
  if (draft.sourceHash !== report.sourceHash || draft.version !== report.datasetVersion) {
    throw new Error("The evaluation dataset and phase 1 report must come from the same version.");
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
      `INSERT INTO eval_workspace1_artifacts VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,
       dataset=EXCLUDED.dataset, phase1=EXCLUDED.phase1`,
      [draft.id, draft.version, JSON.stringify(draft), JSON.stringify(report)],
    );
    const readback = await database.query<{ dataset: unknown; phase1: unknown }>(
      "SELECT dataset,phase1 FROM eval_workspace1_artifacts WHERE id=$1",
      [draft.id],
    );
    if (!isDeepStrictEqual(readback.rows[0]?.dataset, draft) ||
        !isDeepStrictEqual(readback.rows[0]?.phase1, report)) {
      throw new Error("Hosted artifact readback differed from the local files.");
    }
    await database.query("COMMIT");
    console.log(`Published ${draft.id}@${draft.version}: ${draft.caseCount} questions, ${report.caseCount} measured.`);
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
