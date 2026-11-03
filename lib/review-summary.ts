import type {DataState, Review} from './schema';

/** One case-level decision per case, ordered by its actual timestamp. */
export function latestCaseReviews(dataset: {readonly id: string; readonly version: string}, reviews: readonly Review[]): Map<string, Review> {
 const latest = new Map<string, Review>();
 for (const review of reviews) {
  if (review.datasetId !== dataset.id || review.datasetVersion !== dataset.version || review.runId) continue;
  const previous = latest.get(review.caseId);
  if (!previous || Date.parse(review.createdAt) >= Date.parse(previous.createdAt)) latest.set(review.caseId, review);
 }
 return latest;
}

/** Count the latest case-level decision, never run reviews or old versions. */
export function summarizeDatasetReviews(dataset: DataState['datasets'][number] | undefined, reviews: readonly Review[]) {
 const result={total:dataset?.cases.length ?? 0,correct:0,hold:0,incorrect:0,unreviewed:0};
 if (!dataset) return result;
 const latest=latestCaseReviews(dataset,reviews);
 for(const c of dataset.cases){
  const outcome=latest.get(c.id)?.outcome;
  if(outcome) result[outcome]++;
  else result.unreviewed++;
 }
 return result;
}
