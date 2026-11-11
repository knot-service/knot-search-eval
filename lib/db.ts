import { Pool } from "pg";
import { createHmac } from "node:crypto";
import { emptyState, applyAction } from "./state";
import {
  mergePublishedExperiments,
  stripPublishedExperiments,
  isPublishedExperimentDataset,
} from "./published-experiments";
import type { DataState } from "./schema";
let pool: Pool | undefined;
function connection() {
  if (!process.env.DATABASE_URL)
    throw new Error("평가 데이터 저장소가 연결되지 않았습니다.");
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }));
}
async function initialize() {
  const p = connection();
  await p.query(
    "CREATE TABLE IF NOT EXISTS eval_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL)",
  );
  await p.query(
    "INSERT INTO eval_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING",
    [JSON.stringify(emptyState())],
  );
  return p;
}
export async function checkLoginLimit(address: string): Promise<boolean> {
  const p = connection();
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing secret");
  const key = createHmac("sha256", secret).update(address).digest("hex");
  await p.query(
    "CREATE TABLE IF NOT EXISTS eval_login_attempts (key text PRIMARY KEY, attempts integer NOT NULL, started_at timestamptz NOT NULL)",
  );
  const r = await p.query(
    `INSERT INTO eval_login_attempts (key,attempts,started_at) VALUES ($1,1,NOW()) ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN eval_login_attempts.started_at < NOW() - interval '15 minutes' THEN 1 ELSE eval_login_attempts.attempts+1 END, started_at=CASE WHEN eval_login_attempts.started_at < NOW() - interval '15 minutes' THEN NOW() ELSE eval_login_attempts.started_at END RETURNING attempts`,
    [key],
  );
  return r.rows[0].attempts <= 10;
}
export async function readState(): Promise<DataState> {
  const p = await initialize();
  const r = await p.query("SELECT data FROM eval_state WHERE id=1");
  return mergePublishedExperiments(r.rows[0].data).state;
}
export async function mutateState(input: unknown): Promise<DataState> {
  const p = await initialize();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      "SELECT data FROM eval_state WHERE id=1 FOR UPDATE",
    );
    const base = r.rows[0].data as DataState;
    const publication = mergePublishedExperiments(base);
    const action = input as Record<string, unknown>;
    if (
      process.env.VERCEL &&
      action?.type === "review" &&
      typeof action.datasetId === "string" &&
      isPublishedExperimentDataset(action.datasetId)
    ) {
      throw new Error("Vercel에 게시된 실험은 읽기 전용입니다. 사람 검수는 로컬 실험실에서 기록해 주세요.");
    }
    const nextView = applyAction(publication.state, input);
    const next = stripPublishedExperiments(nextView, publication);
    await client.query("UPDATE eval_state SET data=$1::jsonb WHERE id=1", [
      JSON.stringify(next),
    ]);
    await client.query("COMMIT");
    return mergePublishedExperiments(next).state;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function readWorkspace1Artifact(kind: "dataset" | "phase1" | "phase2" | "phase3"): Promise<unknown> {
  const p = connection();
  const tables = await p.query<{ present: boolean }>(
    "SELECT to_regclass('public.eval_workspace1_artifacts') IS NOT NULL AS present",
  );
  if (!tables.rows[0]?.present) return null;
  const column = kind;
  const result = await p.query<{ artifact: unknown }>(
    `SELECT ${column} AS artifact FROM eval_workspace1_artifacts WHERE id=$1`,
    ["knot-workspace-1"],
  );
  return result.rows[0]?.artifact ?? null;
}

export async function readWorkspace458SearchCases(): Promise<unknown> {
  const p = connection();
  const result = await p.query<{ cases: unknown }>(
    `SELECT dataset->'cases' AS cases FROM eval_state
     CROSS JOIN LATERAL jsonb_array_elements(data->'datasets') AS dataset
     WHERE eval_state.id=1 AND dataset->>'id'=$1 AND dataset->>'version'=$2 AND dataset->>'locked'='true'`,
    ["knot-workspace-458", "1.30"],
  );
  return result.rows[0]?.cases ?? null;
}
