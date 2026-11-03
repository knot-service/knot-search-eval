import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Run } from "./schema";

type StageTimings = NonNullable<Run["results"][number]["stageTimings"]>;
type Phase = StageTimings["stages"][number]["phase"];
const phases: readonly Phase[] = ["queue_wait", "intent_classification", "document_retrieval", "answer_generation", "llm_first_content", "content_persistence", "worker_total"];

/** Use only structured timings for this workspace and answer; raw logs are never stored. */
export function parseStageTimings(log: string, answerId: number): StageTimings {
  const stages: StageTimings["stages"] = [];
  for (const line of log.split(/\r?\n/)) {
    if (!line.includes(`workspaceId=458 answerId=${answerId} `)) continue;
    const phase = /\bphase=([a-z_]+)\b/.exec(line)?.[1];
    const duration = /\belapsedMs=(\d+)\b/.exec(line)?.[1];
    const matched = phases.find((item) => item === phase);
    if (!matched || duration === undefined) continue;
    const durationMs = Number(duration);
    if (!Number.isSafeInteger(durationMs)) continue;
    const outcome = /\boutcome=(success|failure)\b/.exec(line)?.[1];
    stages.push({phase:matched,durationMs,outcome:outcome === "success" || outcome === "failure" ? outcome : "unknown"});
  }
  return {capture:stages.length ? "collected" : "unavailable",stages};
}

export async function collectStageTimings(answerId: number, startedAt: string, container: string): Promise<StageTimings> {
  try {
    const since = new Date(Date.parse(startedAt) - 5000).toISOString();
    const result = await promisify(execFile)("docker", ["logs", "--since", since, container], {timeout:5000,maxBuffer:5_000_000});
    return parseStageTimings(`${result.stdout}\n${result.stderr}`, answerId);
  } catch (error) {
    if (error instanceof Error) return {capture:"unavailable",stages:[]};
    throw error;
  }
}
