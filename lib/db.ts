import { Pool } from "pg";
import { createHmac } from "node:crypto";
import { emptyState, applyAction } from "./state";
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
  return r.rows[0].data;
}
export async function mutateState(input: unknown): Promise<DataState> {
  const p = await initialize();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      "SELECT data FROM eval_state WHERE id=1 FOR UPDATE",
    );
    const next = applyAction(r.rows[0].data, input);
    await client.query("UPDATE eval_state SET data=$1::jsonb WHERE id=1", [
      JSON.stringify(next),
    ]);
    await client.query("COMMIT");
    return next;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
