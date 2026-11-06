import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, emptyState } from "../lib/state";
import {
  mergePublishedExperiments,
  publishedExperimentDatasetId,
  stripPublishedExperiments,
} from "../lib/published-experiments";

test("committed live Worker artifact appears in the view without changing the base state", () => {
  const base = emptyState();
  const publication = mergePublishedExperiments(base);

  assert.equal(base.datasets.length, 0);
  assert.equal(base.runs.length, 0);
  assert.equal(publication.state.datasets[0]?.id, publishedExperimentDatasetId);
  assert.equal(publication.state.datasets[0]?.locked, true);
  assert.deepEqual(publication.state.runs.map((run) => run.id), [
    "run-live-api-01-20261106",
    "run-live-api-02-20261106",
    "run-live-api-03-20261106",
  ]);
  assert.ok(publication.state.runs.every((run) => run.experiment?.variant === "observed"));
});

test("reviews can be applied to a published run without persisting the published rows", () => {
  const publication = mergePublishedExperiments(emptyState());
  const reviewed = applyAction(publication.state, {
    type: "review",
    datasetId: publishedExperimentDatasetId,
    datasetVersion: "1.0",
    caseId: "API-03",
    runId: "run-live-api-03-20261106",
    outcome: "correct",
    notes: "명시된 로그인 대상과 문서 근거가 일치합니다.",
  });
  const persistent = stripPublishedExperiments(reviewed, publication);
  const nextView = mergePublishedExperiments(persistent).state;

  assert.equal(persistent.datasets.length, 0);
  assert.equal(persistent.runs.length, 0);
  assert.equal(persistent.reviews.length, 1);
  assert.equal(nextView.runs.length, 3);
  assert.equal(nextView.reviews[0]?.runId, "run-live-api-03-20261106");
});

test("existing identical local rows are not marked ephemeral or duplicated", () => {
  const published = mergePublishedExperiments(emptyState()).state;
  const secondMerge = mergePublishedExperiments(published);

  assert.equal(secondMerge.state.datasets.length, 1);
  assert.equal(secondMerge.state.runs.length, 3);
  assert.equal(secondMerge.ephemeralDatasetKeys.size, 0);
  assert.equal(secondMerge.ephemeralRunIds.size, 0);
});
