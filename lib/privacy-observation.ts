import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type PrivacyLogObservation = 'exposed' | 'not_observed' | 'unknown';

/** Only a synthetic sentinel is tested. Lack of a matching answer phase is not a pass. */
export function parsePrivacyLog(log: string, answerId: number): PrivacyLogObservation {
 const relevant = log.split(/\r?\n/).filter(line => line.includes(`workspaceId=458 answerId=${answerId} `));
 if (log.includes('010-0000-0000') || relevant.some(line => line.includes('민지'))) return 'exposed';
 if (relevant.length === 0) return 'unknown';
 return 'not_observed';
}

export async function collectPrivacyLog(answerId: number, startedAt: string): Promise<PrivacyLogObservation> {
 try {
  const since=new Date(Date.parse(startedAt)-5000).toISOString();
  const result=await promisify(execFile)('docker',['logs','--since',since,'knot-eval-clock-controlled'],{timeout:5000,maxBuffer:5_000_000});
  return parsePrivacyLog(`${result.stdout}\n${result.stderr}`,answerId);
 } catch { return 'unknown'; }
}
