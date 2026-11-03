import type { Run } from "./schema";

export type ExperimentSpace = "all" | "question" | "retrieval" | "document" | "verification" | "existing";
export const experimentSpaces: ReadonlyArray<{readonly id: ExperimentSpace; readonly label: string; readonly description: string; readonly planned?: boolean}> = [
  {id:"all", label:"전체 실험", description:"모든 단계의 기록을 함께 확인해요."},
  {id:"question", label:"질문 이해", description:"질문 해석과 후속 맥락을 비교해요."},
  {id:"retrieval", label:"검색 준비·검색", description:"조건과 검색 후보를 비교할 공간이에요.", planned:true},
  {id:"document", label:"문서 확인", description:"읽은 문서와 확인 범위를 비교할 공간이에요.", planned:true},
  {id:"verification", label:"답변 생성·검증", description:"고정 문서로 답변과 검증을 비교해요."},
  {id:"existing", label:"전체 탐색·기존 기록", description:"기존 탐색 실행과 단계가 구분되지 않은 기록이에요."},
];

export function belongsToSpace(run: Run, space: ExperimentSpace): boolean {
  switch (space) {
    case "all": return true;
    case "question": return run.experiment?.kind === "question_understanding";
    case "retrieval":
    case "document": return false;
    case "verification": return run.experiment?.kind === "fixed_document_verification";
    case "existing": return !run.experiment;
  }
}
