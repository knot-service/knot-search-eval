import type { Review } from "./schema";

/** Preserve historical reviewers whose origin is not established. */
export function latestReviewsByProvenance(reviews: readonly Review[]) {
  const result: { ai?: Review; human?: Review; unknown?: Review } = {};
  for (const review of reviews) {
    const origin = review.reviewer === "AI 검수 (Codex)" ? "ai" : review.reviewer === "사람 검수 (실험실)" ? "human" : "unknown";
    const previous = result[origin];
    if (!previous || review.createdAt > previous.createdAt) result[origin] = review;
  }
  return result;
}
