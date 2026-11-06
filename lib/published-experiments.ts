import rawPublication from "../data/live-qwen-http-sse-2026-11-06.json";
import { contentHash } from "./state";
import { DatasetSchema, RunSchema, type DataState } from "./schema";
import { publishedExperimentDatasetId } from "./published-experiment-ids";
export { publishedExperimentDatasetId } from "./published-experiment-ids";

const dataset = DatasetSchema.parse(rawPublication.dataset);
const runs = rawPublication.runs.map((run) => RunSchema.parse(run));
const publishedDataset = {
  ...dataset,
  locked: true,
  contentHash: contentHash(dataset),
};

type PublicationMerge = {
  state: DataState;
  ephemeralDatasetKeys: Set<string>;
  ephemeralRunIds: Set<string>;
};

const datasetKey = (id: string, version: string) => `${id}:${version}`;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isPublishedExperimentDataset(id: string): boolean {
  return id === publishedExperimentDatasetId;
}

/** Adds committed, synthetic live-run artifacts to the returned view without writing them to the configured database. */
export function mergePublishedExperiments(base: DataState): PublicationMerge {
  const datasets = [...base.datasets];
  const existingDataset = datasets.find(
    (item) => item.id === publishedDataset.id && item.version === publishedDataset.version,
  );
  const ephemeralDatasetKeys = new Set<string>();

  if (existingDataset) {
    if (existingDataset.contentHash !== publishedDataset.contentHash)
      throw new Error("게시된 실험의 평가셋 버전이 저장소 데이터와 일치하지 않습니다.");
    if (!existingDataset.locked)
      throw new Error("게시된 실험의 평가셋 버전이 잠기지 않았습니다.");
  } else {
    datasets.push(publishedDataset);
    ephemeralDatasetKeys.add(datasetKey(dataset.id, dataset.version));
  }

  const mergedRuns = [...base.runs];
  const ephemeralRunIds = new Set<string>();
  for (const run of runs) {
    const existing = mergedRuns.find((item) => item.id === run.id);
    if (existing) {
      if (stable(existing) !== stable(run))
        throw new Error(`게시된 실험 ${run.id}의 저장 내용이 artifact와 다릅니다.`);
      continue;
    }
    mergedRuns.push(run);
    ephemeralRunIds.add(run.id);
  }

  return {
    state: { ...base, datasets, runs: mergedRuns },
    ephemeralDatasetKeys,
    ephemeralRunIds,
  };
}

/** Keeps only real database rows after applying an action to the merged view. Reviews remain persistable. */
export function stripPublishedExperiments(
  view: DataState,
  publication: Pick<PublicationMerge, "ephemeralDatasetKeys" | "ephemeralRunIds">,
): DataState {
  return {
    ...view,
    datasets: view.datasets.filter(
      (item) => !publication.ephemeralDatasetKeys.has(datasetKey(item.id, item.version)),
    ),
    runs: view.runs.filter((item) => !publication.ephemeralRunIds.has(item.id)),
  };
}
