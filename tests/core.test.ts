import { test } from "node:test";
import assert from "node:assert/strict";
import { validPassword, signSession, verifySession } from "../lib/auth";
import { applyAction, emptyState, comparable } from "../lib/state";
import sample from "../data/synthetic-dataset.json";
import first from "../data/synthetic-run-a.json";
import second from "../data/synthetic-run-b.json";
import full from "../data/synthetic-full-dataset.json";
import type { Run } from "../lib/schema";
import workspace from "../data/workspace-458-dataset.json";
import { sharedCaseReadiness } from "../lib/local-cases";
import { DatasetSchema } from "../lib/schema";
test("workspace dataset retains physical evidence candidates and requires review", () => {
  const dataset = DatasetSchema.parse(workspace);
  const sample = dataset.cases.find((item) => item.id === "S72-01");
  assert.ok(sample);
  assert.equal(dataset.cases.length, 255);
  assert.ok(dataset.corpusHash);
  assert.deepEqual(sample.expectedEvidenceIds, ["document-2210"]);
  assert.equal(sharedCaseReadiness(sample).ready, false);
  assert.equal(sharedCaseReadiness(sample, new Date(), "correct").ready, true);
});
test("full draft covers each planned scenario with three cases", () => {
  const state = applyAction(emptyState(), {
    type: "import_dataset",
    data: full,
  });
  const dataset = state.datasets[0];
  assert.ok(dataset);
  const counts = new Map<string, number>();
  for (const item of dataset.cases)
    counts.set(item.scenario, (counts.get(item.scenario) ?? 0) + 1);
  const expected = [
    ...Array.from(
      { length: 76 },
      (_, i) => `S${String(i + 1).padStart(2, "0")}`,
    ),
    ...Array.from(
      { length: 9 },
      (_, i) => `C${String(i + 1).padStart(2, "0")}`,
    ),
  ];
  assert.deepEqual([...counts.keys()].sort(), expected.sort());
  for (const count of counts.values()) assert.equal(count, 3);
  assert.equal(dataset.locked, false);
});
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
