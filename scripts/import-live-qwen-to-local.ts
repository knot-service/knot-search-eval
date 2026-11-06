import { Pool } from "pg";
import { loadEnvConfig } from "@next/env";
import rawPublication from "../data/live-qwen-http-sse-2026-11-06.json";
import { applyAction, emptyState } from "../lib/state";
import { DatasetSchema, RunSchema, type DataState } from "../lib/schema";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function main() {
  loadEnvConfig(process.cwd());
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("로컬 DATABASE_URL이 없습니다.");

  const target = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "55440" || target.pathname !== "/knot_eval")
    throw new Error("이 가져오기는 로컬 127.0.0.1:55440/knot_eval에서만 허용됩니다.");

  const dataset = DatasetSchema.parse(rawPublication.dataset);
  const runs = rawPublication.runs.map((item) => RunSchema.parse(item));
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS eval_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL)");
    await client.query("INSERT INTO eval_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING", [JSON.stringify(emptyState())]);
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM eval_state WHERE id=1 FOR UPDATE");
    let state = result.rows[0].data as DataState;
    const existingDataset = state.datasets.find((item) => item.id === dataset.id && item.version === dataset.version);

    if (existingDataset) {
      const expected = applyAction(emptyState(), { type: "import_dataset", data: dataset }).datasets[0];
      if (existingDataset.contentHash !== expected.contentHash)
        throw new Error("같은 평가셋 ID/버전의 로컬 내용이 artifact와 다릅니다.");
      if (!existingDataset.locked)
        state = applyAction(state, { type: "lock_dataset", id: dataset.id, version: dataset.version });
    } else {
      state = applyAction(state, { type: "import_dataset", data: dataset });
      state = applyAction(state, { type: "lock_dataset", id: dataset.id, version: dataset.version });
    }

    let imported = 0;
    for (const run of runs) {
      const existingRun = state.runs.find((item) => item.id === run.id);
      if (existingRun) {
        if (stable(existingRun) !== stable(run))
          throw new Error(`동일 ID 실험 ${run.id}의 로컬 내용이 artifact와 다릅니다.`);
        continue;
      }
      state = applyAction(state, { type: "import_run", data: run });
      imported += 1;
    }

    await client.query("UPDATE eval_state SET data=$1::jsonb WHERE id=1", [JSON.stringify(state)]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ target: "local knot_eval", datasetId: dataset.id, datasetVersion: dataset.version, totalRuns: runs.length, newlyImportedRuns: imported }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "로컬 artifact 가져오기에 실패했습니다.");
  process.exitCode = 1;
});
