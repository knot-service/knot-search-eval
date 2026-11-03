import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type RetrievalObservation = 'performed' | 'skipped' | 'unknown';

/** Match only this answer's structured phases; absent or unfamiliar logs are unknown. */
export function parseRetrievalObservation(log: string, answerId: number): RetrievalObservation {
 const lines = log.split(/\r?\n/).filter((line) => line.includes(`workspaceId=458 answerId=${answerId} `));
 if (lines.some((line) => line.includes('phase=document_retrieval '))) return 'performed';
 const intents = lines.filter((line) => line.includes('phase=intent_classification ') && line.includes('outcome=success '));
 if (intents.length !== 1) return 'unknown';
 const intent = /\bintent=(GREETING_OR_THANKS|SERVICE_GUIDE|NEEDS_CLARIFICATION|OUT_OF_SCOPE)\b/.exec(intents[0] ?? '');
 return intent ? 'skipped' : 'unknown';
}

export async function collectRetrievalObservation(answerId:number, startedAt:string):Promise<RetrievalObservation> {
 try {
  const since = new Date(Date.parse(startedAt) - 5000).toISOString();
  const result = await promisify(execFile)('docker',['logs','--since',since,'knot-eval-clock-controlled'],{timeout:5000,maxBuffer:5_000_000});
  return parseRetrievalObservation(`${result.stdout}\n${result.stderr}`,answerId);
 } catch (error) {
  if (error instanceof Error) return 'unknown';
  throw error;
 }
}
