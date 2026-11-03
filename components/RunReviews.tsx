import type { Review } from "../lib/schema";

const outcomeLabels: Record<Review["outcome"], string> = {
  correct: "적합",
  incorrect: "부적합",
  hold: "판단 보류",
};

export function RunReviews({ reviews, runId, caseId }: {
  reviews: readonly Review[];
  runId: string;
  caseId: string;
}) {
  const matching = reviews
    .filter((review) => review.runId === runId && review.caseId === caseId && !review.stageId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div aria-label="이 결과의 검수 이력">
      <p className="muted">이 결과의 검수 {matching.length}건</p>
      {matching.map((review) => (
        <div className="review-row" key={review.id}>
          <span className="badge">{outcomeLabels[review.outcome]}</span>
          <div className="row-main">
            <strong>{review.reviewer}</strong>
            <small>{review.notes || "작성한 의견이 없어요."}</small>
          </div>
          <span className="muted">
            {new Date(review.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
          </span>
        </div>
      ))}
    </div>
  );
}
