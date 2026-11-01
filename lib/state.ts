import { createHash, randomUUID } from "node:crypto";
import {
  DatasetSchema,
  RunSchema,
  type DataState,
  type Dataset,
} from "./schema";
export const emptyState = (): DataState => ({
  datasets: [],
  runs: [],
  reviews: [],
});
export const contentHash = (d: Dataset) =>
  createHash("sha256").update(JSON.stringify(d)).digest("hex");
export function applyAction(state: DataState, input: unknown): DataState {
  const v = input as Record<string, unknown>;
  if (!v || typeof v !== "object") throw new Error("잘못된 요청입니다.");
  if (v.type === "import_dataset") {
    const d = DatasetSchema.parse(v.data);
    if (state.datasets.some((x) => x.id === d.id && x.version === d.version))
      throw new Error("같은 평가셋 버전이 이미 있습니다.");
    return {
      ...state,
      datasets: [
        ...state.datasets,
        { ...d, locked: false, contentHash: contentHash(d) },
      ],
    };
  }
  if (v.type === "lock_dataset") {
    const d = state.datasets.find(
      (x) => x.id === v.id && x.version === v.version,
    );
    if (!d) throw new Error("평가셋을 찾을 수 없습니다.");
    if (d.locked) throw new Error("이미 잠긴 버전입니다.");
    return {
      ...state,
      datasets: state.datasets.map((x) =>
        x === d ? { ...x, locked: true } : x,
      ),
    };
  }
  if (v.type === "import_run") {
    const run = RunSchema.parse(v.data);
    const dataset = state.datasets.find(
      (d) => d.id === run.datasetId && d.version === run.datasetVersion,
    );
    if (!dataset || !dataset.locked)
      throw new Error("잠긴 평가셋 버전이 필요합니다.");
    if (state.runs.some((r) => r.id === run.id))
      throw new Error("이미 가져온 실험 ID입니다.");
    if (run.results.some((x) => !dataset.cases.some((c) => c.id === x.caseId)))
      throw new Error("평가셋에 없는 사례 결과가 있습니다.");
    return { ...state, runs: [...state.runs, run] };
  }
  if (v.type === "review") {
    if (
      typeof v.datasetId !== "string" ||
      typeof v.datasetVersion !== "string" ||
      typeof v.caseId !== "string" ||
      !["correct", "incorrect", "hold"].includes(String(v.outcome)) ||
      typeof v.notes !== "string" ||
      v.notes.length > 5000
    )
      throw new Error("검수 내용을 확인해 주세요.");
    const d = state.datasets.find(
      (x) => x.id === v.datasetId && x.version === v.datasetVersion,
    );
    if (!d?.cases.some((c) => c.id === v.caseId))
      throw new Error("사례를 찾을 수 없습니다.");
    if (v.runId !== undefined) {
      if (
        typeof v.runId !== "string" ||
        !state.runs.some(
          (r) =>
            r.id === v.runId &&
            r.datasetId === v.datasetId &&
            r.datasetVersion === v.datasetVersion &&
            r.results.some((x) => x.caseId === v.caseId),
        )
      )
        throw new Error("실험 결과를 찾을 수 없습니다.");
    }
    return {
      ...state,
      reviews: [
        ...state.reviews,
        {
          id: randomUUID(),
          datasetId: v.datasetId,
          datasetVersion: v.datasetVersion,
          caseId: v.caseId,
          ...(typeof v.runId === "string" ? { runId: v.runId } : {}),
          outcome: v.outcome as "correct" | "incorrect" | "hold",
          notes: v.notes,
          reviewer: "개인 평가자",
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }
  throw new Error("지원하지 않는 작업입니다.");
}
export function comparable(a: RunSchemaType, b: RunSchemaType): boolean {
  return (
    a.datasetId === b.datasetId &&
    a.datasetVersion === b.datasetVersion &&
    a.corpusHash === b.corpusHash
  );
}
type RunSchemaType = import("./schema").Run;
