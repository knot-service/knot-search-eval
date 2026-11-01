import { test } from "node:test";
import assert from "node:assert/strict";
import { validPassword, signSession, verifySession } from "../lib/auth";
import { applyAction, emptyState, comparable } from "../lib/state";
import sample from "../data/synthetic-dataset.json";
import first from "../data/synthetic-run-a.json";
import second from "../data/synthetic-run-b.json";
import type { Run } from "../lib/schema";
test("password and expiring session reject wrong and malformed credentials", () => {
  const secret = "a".repeat(32);
  assert.equal(validPassword("wrong", "right"), false);
  assert.equal(validPassword("right", "right"), true);
  const token = signSession(secret, 1000);
  assert.equal(verifySession(token, secret, 1001), true);
  assert.equal(verifySession(token, secret, 1000 + 8 * 60 * 60 * 1000), false);
  assert.equal(verifySession(token, "b".repeat(32), 1001), false);
  assert.equal(verifySession("broken", secret), false);
});
test("dataset import rejects invalid and duplicate IDs; locked versions cannot be replaced", () => {
  let s = applyAction(emptyState(), { type: "import_dataset", data: sample });
  assert.throws(() => applyAction(s, { type: "import_dataset", data: sample }));
  s = applyAction(s, {
    type: "lock_dataset",
    id: sample.id,
    version: sample.version,
  });
  assert.equal(s.datasets[0].locked, true);
  assert.throws(() =>
    applyAction(s, {
      type: "lock_dataset",
      id: sample.id,
      version: sample.version,
    }),
  );
  assert.throws(() =>
    applyAction(emptyState(), {
      type: "import_dataset",
      data: { ...sample, cases: [sample.cases[0], sample.cases[0]] },
    }),
  );
});
test("results require locked dataset, preserve failures and reject unknown case", () => {
  let s = applyAction(emptyState(), { type: "import_dataset", data: sample });
  assert.throws(() => applyAction(s, { type: "import_run", data: first }));
  s = applyAction(s, {
    type: "lock_dataset",
    id: sample.id,
    version: sample.version,
  });
  s = applyAction(s, { type: "import_run", data: first });
  assert.equal(s.runs[0].results[1].status, "failed");
  assert.throws(() => applyAction(s, { type: "import_run", data: first }));
  assert.throws(() =>
    applyAction(s, {
      type: "import_run",
      data: {
        ...second,
        results: [{ ...second.results[0], caseId: "not-found" }],
      },
    }),
  );
});
test("reviews append history and invalid reviews are rejected", () => {
  let s = applyAction(emptyState(), { type: "import_dataset", data: sample });
  const x = {
    type: "review",
    datasetId: sample.id,
    datasetVersion: sample.version,
    caseId: "S01-01",
    outcome: "correct",
    notes: "근거 확인",
  };
  s = applyAction(s, x);
  s = applyAction(s, { ...x, outcome: "hold" });
  assert.equal(s.reviews.length, 2);
  assert.equal(s.reviews[0].outcome, "correct");
  assert.throws(() => applyAction(s, { ...x, caseId: "unknown" }));
});
test("comparison detects dataset and corpus mismatch", () => {
  assert.equal(comparable(first as Run, second as Run), true);
  assert.equal(
    comparable(first as Run, { ...second, corpusHash: "other" } as Run),
    false,
  );
  assert.equal(
    comparable(first as Run, { ...second, datasetVersion: "2" } as Run),
    false,
  );
});
