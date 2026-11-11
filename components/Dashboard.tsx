"use client";
import { StageResult } from "./StageResult";
import { HybridSearchLab } from "./HybridSearchLab";
import { EvaluationCases, caseLabels } from "./EvaluationCases";
import { Workspace1EvaluationDraft } from "./Workspace1EvaluationDraft";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  FolderOpen,
  FlaskConical,
  GitCompareArrows,
  ClipboardCheck,
  LogOut,
  Plus,
  ChevronRight,
  Search,
  ArrowUpRight,
  ShieldCheck,
  FileJson,
  LockKeyhole,
  Menu,
} from "lucide-react";
import type { DataState, EvalCase, Run } from "../lib/schema";
import { sharedCaseReadiness } from "../lib/local-cases";
import { latestWorkspaceDataset } from "../lib/latest-workspace-dataset";
import { latestCaseReviews, summarizeDatasetReviews } from "../lib/review-summary";
import { latestReviewsByProvenance } from "../lib/review-provenance";
import { belongsToSpace, experimentSpaces, type ExperimentSpace } from "../lib/experiment-spaces";
import { formatKoreaRunTime, koreaTimeInText } from "../lib/korea-time";
import { CaseSchema } from "../lib/schema";
import { publishedExperimentDatasetId } from "../lib/published-experiment-ids";
import { RunReviews } from "./RunReviews";
import { ProcessComparison } from "./ProcessComparison";
import sampleDataset from "../data/synthetic-dataset.json";
import fullDataset from "../data/synthetic-full-dataset.json";
import sampleA from "../data/synthetic-run-a.json";
import sampleB from "../data/synthetic-run-b.json";
type Page = "overview" | "datasets" | "runs" | "hybrid" | "compare" | "reviews";
const nav: { id: Page; label: string; icon: typeof Search }[] = [
  { id: "overview", label: "대시보드", icon: LayoutDashboard },
  { id: "datasets", label: "평가셋", icon: FolderOpen },
  { id: "runs", label: "실험실", icon: FlaskConical },
  { id: "hybrid", label: "하이브리드 검색 실험", icon: Search },
  { id: "compare", label: "실험 비교", icon: GitCompareArrows },
  { id: "reviews", label: "검수 이력", icon: ClipboardCheck },
];
const workspace1DatasetKey = "workspace1-published";
const labels: Record<string, string> = {
  ...caseLabels,
  completed: "완료",
  failed: "실패",
  timeout: "시간 초과",
  cancelled: "취소",
};
function modelLabel(model: string) {
  return model.includes("(LM Studio)")
    ? model.replace("(LM Studio)", "(서빙 기록 확인 필요)")
    : model;
}
function runDisplayTitle(name: string) {
  const title = name.replace(
    /\s*·\s*(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*\d{1,2}시\s*\d{1,2}분(?:\s*\d{1,2}초)?)(?:\s*\(한국 시간\))?$/,
    "",
  );
  return koreaTimeInText(title);
}
const stageLabels: Record<string, string> = {
  queue_wait:"작업 대기", intent_classification:"질문 의도 분류", document_retrieval:"문서 검색",
  answer_generation:"답변 생성", llm_first_content:"모델 첫 내용까지", content_persistence:"답변 내용 저장 누적", worker_total:"백엔드 작업 전체",
};
export function Login() {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) location.reload();
      else setError((await r.json()).error);
    } catch {
      setError("연결하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-brand">
        <b className="logo">K</b>
        <strong>knot</strong>
      </div>
      <div className="login-center">
        <b className="logo big">K</b>
        <h1>탐색 평가 워크스페이스</h1>
        <p>사례를 검수하고, 실험 결과를 비교해요.</p>
        <form onSubmit={submit}>
          <label htmlFor="password">관리자 비밀번호</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
          />
          <button className="dark-button" disabled={busy}>
            {busy ? "확인 중..." : "로그인"}
          </button>
          {error && (
            <span className="error" role="alert">
              {error}
            </span>
          )}
        </form>
        <span className="login-note">
          <LockKeyhole size={13} /> 허용된 평가자만 접근할 수 있어요
        </span>
      </div>
    </div>
  );
}
export function Dashboard() {
  const [page, setPage] = useState<Page>("overview"),
    [state, setState] = useState<DataState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [datasetFilter, setDatasetFilter] = useState("auto"),
    [left, setLeft] = useState(""),
    [right, setRight] = useState(""),
    [showMenu, setShowMenu] = useState(false),
    [openRun, setOpenRun] = useState(""),
    [reviewCase, setReviewCase] = useState(""),
    [runNotes, setRunNotes] = useState(""),
    [experimentCase, setExperimentCase] = useState("S72-01"),
    [experimentTarget, setExperimentTarget] = useState("baseline"),
    [fixedCase, setFixedCase] = useState("S14-01"),
    [fixedVariant, setFixedVariant] = useState("A"),
    [runSearch, setRunSearch] = useState(""),
    [runVersion, setRunVersion] = useState("all"),
    [runSpace, setRunSpace] = useState<ExperimentSpace>("all"),
    [compareSpace, setCompareSpace] = useState<ExperimentSpace>("all"),
    [compareVersion, setCompareVersion] = useState("all"),
    [compareRevision, setCompareRevision] = useState("all"),
    [compareSearch, setCompareSearch] = useState(""),
    [runRevision, setRunRevision] = useState("all"),
    [runLimit, setRunLimit] = useState(20),
    [localAccess, setLocalAccess] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (r.status === 401) {
        location.reload();
        return;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결 오류");
    }
  }, []);
  useEffect(() => {
    setLocalAccess(location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(location.hostname));
    void load();
  }, [load]);
  async function action(data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState(d);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    e: React.ChangeEvent<HTMLInputElement>,
    type: "import_dataset" | "import_run",
  ) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 1000000) {
      setError("파일 크기 제한은 1MB입니다.");
      return;
    }
    try {
      await action({ type, data: JSON.parse(await f.text()) });
    } catch {
      setError("JSON 파일을 읽을 수 없습니다.");
    }
  }
  const datasets = state?.datasets ?? [],
    runs = state?.runs ?? [],
    reviews = state?.reviews ?? [];
  const meetingDataset = latestWorkspaceDataset(datasets);
  const reviewSummary = summarizeDatasetReviews(meetingDataset, reviews);
  const displayDatasets = meetingDataset ? [meetingDataset] : [];
  const experimentCases = useMemo(() => (meetingDataset?.cases ?? fullDataset.cases).map((raw) => CaseSchema.parse(raw)), [meetingDataset]);
  const experimentCategories = [...new Set(experimentCases.map((c) => c.category))];
  const caseReviews = meetingDataset ? latestCaseReviews(meetingDataset, reviews) : new Map();
  const readinessFor = (c: EvalCase) => sharedCaseReadiness(c,new Date(),caseReviews.get(c.id)?.outcome);
  const readyCaseCount = experimentCases.filter((c) => readinessFor(c).ready).length;
  const allCases = useMemo(
    () =>
      datasets.flatMap((d) =>
        d.cases.map((c) => ({
          ...c,
          datasetId: d.id,
          datasetVersion: d.version,
          datasetName: d.name,
        })),
      ),
    [datasets],
  );
  const baselineKey = meetingDataset ? `${meetingDataset.id}:${meetingDataset.version}` : "";
  const workspace1Selected = datasetFilter === workspace1DatasetKey;
  const activeDataset = workspace1Selected ? workspace1DatasetKey : baselineKey;
  const selectedExperiment = experimentCases.find((c) => c.id === experimentCase);
  const runVersions = [...new Set(runs.map((run) => `${run.datasetId}:${run.datasetVersion}`))];
  const runRevisions = [...new Set(runs.filter(run => belongsToSpace(run, runSpace) && run.experiment).map(run => run.experiment?.promptVersion).filter((version): version is string => Boolean(version)))].sort();
  const visibleRuns = [...runs].reverse().filter((run) => belongsToSpace(run, runSpace) && (runRevision === "all" || run.experiment?.promptVersion === runRevision) && (runVersion === "all" || `${run.datasetId}:${run.datasetVersion}` === runVersion) && `${run.name} ${run.results.map((r) => r.caseId).join(" ")}`.toLowerCase().includes(runSearch.toLowerCase()));
  const activeRun = visibleRuns.find((run) => run.id === openRun) ?? visibleRuns[0];
  const compareRuns = [...runs].reverse().filter((run) => belongsToSpace(run, compareSpace)
    && (compareVersion === "all" || `${run.datasetId}:${run.datasetVersion}` === compareVersion)
    && (compareRevision === "all" || run.experiment?.promptVersion === compareRevision)
    && `${run.name} ${run.results.map(result => result.caseId).join(" ")}`.toLowerCase().includes(compareSearch.toLowerCase()));
  const runA = compareRuns.find((r) => r.id === left) ?? compareRuns[0],
    runB = compareRuns.find((r) => r.id === right) ?? compareRuns.find(r => r.id !== runA?.id);
  async function seed() {
    if (!(await action({ type: "import_dataset", data: sampleDataset })))
      return;
  }
  async function sampleRuns() {
    if (!(await action({ type: "import_run", data: sampleA }))) return;
    await action({ type: "import_run", data: sampleB });
  }
  async function runLocal() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/local-experiment", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({caseId: experimentCase,dataset: meetingDataset ? "meetings" : "initial",target: experimentTarget}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data);
    } catch (e) { setError(e instanceof Error ? e.message : "실험 실패"); }
    finally { setBusy(false); }
  }
  async function runFixed() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/fixed-verification", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({caseId:fixedCase,variant:fixedVariant})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data);
    } catch (e) { setError(e instanceof Error ? e.message : "실험 실패"); }
    finally { setBusy(false); }
  }
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.reload();
  }
  const go = (p: Page) => {
    setPage(p);
    setShowMenu(false);
  };
  return (
    <div className="shell">
      <header className="topbar">
        <div className="crumb">
          <button
            className="mobile-menu"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="메뉴 열기"
          >
            <Menu size={19} />
          </button>
          <b className="logo small">K</b>
          <strong>knot</strong>
          <span className="slash">/</span>
          <span>탐색 평가</span>
        </div>
        <div className="top-right">
          <span className="environment">
            <span /> 내부 평가
          </span>
          <span className="avatar">흑</span>
        </div>
      </header>
      <aside className={`sidebar ${showMenu ? "show" : ""}`}>
        <div className="workspace">
          <span className="workspace-icon">K</span>
          <div>
            <strong>Knot 평가실</strong>
            <small>개인 워크스페이스</small>
          </div>
        </div>
        <p className="side-label">WORKSPACE</p>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={page === id ? "active" : ""}
            >
              <Icon size={17} />
              <span>{label}</span>
              {page === id && <ChevronRight size={14} className="chevron" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={16} />
            <div>
              <strong>{page === "hybrid" || (page === "datasets" && workspace1Selected) ? "Workspace 1 평가 자료" : "합성 데이터 전용"}</strong>
              <small>{page === "hybrid" || (page === "datasets" && workspace1Selected) ? "검수용 질문과 문서 인용을 확인해요" : "실제 회의 데이터는 사용하지 않아요"}</small>
            </div>
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={15} /> 로그아웃
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="container">
          <div className="breadcrumbs">
            워크스페이스 <ChevronRight size={13} />{" "}
            <span>{nav.find((n) => n.id === page)?.label}</span>
          </div>
          {page !== "hybrid" && error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => setError("")}>닫기</button>
            </div>
          )}
          {page === "hybrid" ? (
            <HybridSearchLab key={String(localAccess)} localAccess={localAccess} />
          ) : !state ? (
            <div className="empty">
              {error
                ? "저장소에 연결할 수 없어요."
                : "평가 데이터를 불러오는 중이에요."}
            </div>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <div className="heading">
                    <div>
                      <div className="eyebrow">SEARCH EVALUATION</div>
                      <h1>탐색 평가 대시보드</h1>
                      <p>시나리오와 실험 결과를 한곳에서 확인해요.</p>
                    </div>
                    <button className="primary" onClick={() => go("datasets")}>
                      <Plus size={16} /> 평가셋 살펴보기
                    </button>
                  </div>
                  <div className="notice">
                    <span className="notice-icon">✦</span>
                    <div>
                      <strong>합성 데이터로 시작하세요</strong>
                      <p>예시 결과는 실제 Knot 검색 성능을 의미하지 않아요.</p>
                    </div>
                    <span className="notice-tag">SYNTHETIC</span>
                  </div>
                  <div className="section-head">
                    <div>
                      <h2>평가 현황</h2>
                      <p>현재 저장된 사례와 실험을 기준으로 집계해요.</p>
                    </div>
                    <span className="muted">전체 워크스페이스</span>
                  </div>
                  <div className="stats">
                    <Stat
                      label="평가셋"
                      value={String(displayDatasets.length).padStart(2, "0")}
                      sub="등록된 버전"
                    />
                    <Stat
                      label="평가 사례"
                      value={String(meetingDataset?.cases.length ?? 0).padStart(2, "0")}
                      sub="전체 시나리오"
                    />
                    <Stat
                      label="판정 기록"
                      value={`${reviewSummary.total - reviewSummary.unreviewed} / ${reviewSummary.total}`}
                      sub="적합·부적합·보류 포함"
                    />
                    <Stat
                      label="실험"
                      value={String(runs.length).padStart(2, "0")}
                      sub="가져온 결과"
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>평가셋</h2>
                          <p>검수할 시나리오를 살펴보세요.</p>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => go("datasets")}
                        >
                          전체 보기 <ArrowUpRight size={14} />
                        </button>
                      </div>
                      {displayDatasets.length ? (
                        displayDatasets.map((d) => (
                          <button
                            className="dataset-row"
                            key={`${d.id}-${d.version}`}
                            onClick={() => go("datasets")}
                          >
                            <span className="file-icon">
                              <FolderOpen size={18} />
                            </span>
                            <span className="row-main">
                              <strong>{d.name}</strong>
                              <small>
                                {d.id} · {d.cases.length}개 사례
                              </small>
                            </span>
                            <span className="badge">v{d.version}</span>
                            <ChevronRight size={15} />
                          </button>
                        ))
                      ) : (
                        <div className="empty small-empty">
                          아직 평가셋이 없어요.
                          <button
                            className="text-link"
                            onClick={seed}
                            disabled={busy}
                          >
                            합성 예시 추가하기
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>최근 실험</h2>
                          <p>가져온 결과만 표시해요.</p>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => go("runs")}
                        >
                          전체 보기 <ArrowUpRight size={14} />
                        </button>
                      </div>
                      {runs.length ? (
                        runs
                          .slice(-3)
                          .reverse()
                          .map((r) => (
                            <div className="run-row" key={r.id}>
                              <span className="run-dot" />
                              <span className="row-main">
                                <strong>{koreaTimeInText(r.name)}</strong>
                                <small>
                                  {koreaTimeInText(r.strategy)} · {r.results.length}개 결과
                                </small>
                              </span>
                              <span className="badge neutral">
                                {labels[r.status]}
                              </span>
                            </div>
                          ))
                      ) : (
                        <div className="empty small-empty">
                          가져온 실험 결과가 없어요.
                        </div>
                      )}
                    </section>
                  </div>
                  <div className="coverage">
                    <span>◌</span>
                    <div>
                      <strong>시나리오 범위</strong>
                      <p>
                        등록된 사례와 검수 상태를 확인해요. 아직 평가되지 않은
                        시나리오는 통과로 표시하지 않아요.
                      </p>
                    </div>
                    <button onClick={() => go("datasets")}>
                      사례 보기 <ChevronRight size={15} />
                    </button>
                  </div>
                </>
              )}
              {page === "datasets" && (
                <>
                  <div className="heading">
                    <div>
                      <div className="eyebrow">DATASETS</div>
                      <h1>평가셋</h1>
                      <p>워크스페이스 문서를 기준으로 질문과 근거 후보를 검수해요.</p>
                    </div>
                    <label className="primary file-button">
                      <Plus size={16} /> JSON 가져오기
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={(e) => upload(e, "import_dataset")}
                      />
                    </label>
                  </div>
                  <div className="toolbar dataset-selector">
                    <label htmlFor="dataset-choice">평가셋 선택</label>
                    <select
                      id="dataset-choice"
                      value={activeDataset}
                      onChange={(e) => setDatasetFilter(e.target.value)}
                    >
                      {meetingDataset ? (
                        <option value={baselineKey}>Workspace 458 · 합성 기준선 · v{meetingDataset.version}</option>
                      ) : (
                        <option value="">합성 평가셋 없음</option>
                      )}
                      <option value={workspace1DatasetKey}>Workspace 1 · 운영 문서 평가셋</option>
                    </select>
                  </div>
                  {workspace1Selected ? (
                    <Workspace1EvaluationDraft />
                  ) : meetingDataset ? (
                    <EvaluationCases
                      key={baselineKey}
                      cases={meetingDataset.cases}
                      name="Workspace 458 · 합성 기준선"
                      version={meetingDataset.version}
                      source="합성 문서"
                      status={meetingDataset.locked ? "버전 잠금" : "편집 가능"}
                      controls={meetingDataset.locked ? undefined : (
                        <button
                          className="outline"
                          disabled={busy}
                          onClick={() => action({
                            type: "lock_dataset",
                            id: meetingDataset.id,
                            version: meetingDataset.version,
                          })}
                        >
                          버전 잠그기
                        </button>
                      )}
                      overview={
                        <details className="panel evaluation-overview">
                          <summary>검수 현황 · 실행 가능 {readyCaseCount} / {reviewSummary.total}개</summary>
                          <div className="stats">
                            <Stat label="적합" value={String(reviewSummary.correct)} sub="사례 구성 검수" />
                            <Stat label="판단 보류" value={String(reviewSummary.hold)} sub="추가 확인 필요" />
                            <Stat label="부적합" value={String(reviewSummary.incorrect)} sub="수정 필요" />
                            <Stat label="미검수" value={String(reviewSummary.unreviewed)} sub="판정 전" />
                          </div>
                          <p className="review-summary-note">AI 검토와 이전 버전에서 이관한 판정을 포함해요. 실행 가능 여부와 탐색 정답률은 별도로 봐요.</p>
                        </details>
                      }
                      review={{
                        latest: caseReviews,
                        history: reviews.filter((r) =>
                          r.datasetId === meetingDataset.id && r.datasetVersion === meetingDataset.version && !r.runId
                        ),
                        busy,
                        submit: (caseId, outcome, notes) => action({
                          type: "review",
                          datasetId: meetingDataset.id,
                          datasetVersion: meetingDataset.version,
                          caseId,
                          outcome,
                          notes,
                        }),
                      }}
                    />
                  ) : (
                    <div className="panel empty">
                      등록된 평가셋이 없어요.
                      <button className="primary" onClick={seed} disabled={busy}>합성 예시 추가하기</button>
                    </div>
                  )}
                </>
              )}
              {page === "runs" && (
                <>
                  <div className="heading">
                    <div>
                      <div className="eyebrow">EXPERIMENTS</div>
                      <h1>실험실</h1>
                      <p>워크플로우별 실험과 검수 결과를 확인해요.</p>
                    </div>
                    <label className="primary file-button">
                      <Plus size={16} /> 결과 가져오기
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={(e) => upload(e, "import_run")}
                      />
                    </label>
                  </div>
                  <nav className="experiment-spaces" aria-label="워크플로우별 실험 공간">
                    {localAccess && <button className="experiment-space" onClick={() => go("hybrid")}>
                      <span className="experiment-space-top"><strong>하이브리드 검색 실험</strong></span>
                      <small>키워드·벡터 비교, 문서 찾기, 회의 종합</small>
                    </button>}
                    {experimentSpaces.map((space) => <button key={space.id} className={`experiment-space ${runSpace === space.id ? "selected" : ""}`} aria-pressed={runSpace === space.id} onClick={() => { setRunSpace(space.id); setRunLimit(20); setRunVersion("all"); setRunRevision("all"); setRunSearch(""); setOpenRun(""); setRunNotes(""); setReviewCase(""); }}>
                      <span className="experiment-space-top"><strong>{space.label}</strong><span>{space.planned ? "준비 중" : runs.filter(run => belongsToSpace(run, space.id)).length}</span></span>
                      <small>{space.description}</small>
                    </button>)}
                  </nav>
                  {runSpace === "question" && <div className="lab-space-note"><strong>질문 이해 실험</strong><span>실험 결과와 검수 내역을 확인해요. 새 실험은 현재 로컬 실행기로 시작합니다.</span></div>}
                  {runSpace === "document" && <div className="lab-space-note"><strong>실험 기록 준비 중</strong><span>이 단계만 따로 실행하고 기록하는 기능은 아직 구현되지 않았어요.</span></div>}
                  {runSpace === "retrieval" && <div className="lab-space-note"><strong>검색 준비·검색 실험</strong><span>로컬 실험기에서 기록한 검색 후보와 적용 조건을 비교해요. 후보는 답변 근거가 아닙니다.</span></div>}
                  {(runSpace === "all" || runSpace === "existing") && <div className="panel lab-setup">
                    <div>
                      <strong>Spring 탐색 실험</strong>
                      <p>
                        하나의 합성 워크스페이스에 질문하고 실행 결과를 비교합니다.
                      </p>
                      <small>
                        {localAccess ? "워크스페이스 458의 문서 기준이에요. 검수된 사례만 실행할 수 있어요." : "로컬과 같은 평가셋과 기록을 볼 수 있어요. 실험 실행은 로컬에서 해주세요."}
                      </small>
                    </div>
                    <div className="lab-controls">
                      <label htmlFor="experiment-target">실행 대상</label>
                      <select id="experiment-target" value={experimentTarget} onChange={(e) => setExperimentTarget(e.target.value)} disabled={busy || !localAccess}>
                        <option value="baseline">기존 평가 서버</option>
                        <option value="lab">knot-search-lab</option>
                      </select>
                      {experimentTarget === "lab" && <small>시각 고정·특수 실행 조건 사례는 준비 후 지원합니다.</small>}
                      <label htmlFor="experiment-case">실행할 사례</label>
                      <select id="experiment-case" value={experimentCase} onChange={(e) => setExperimentCase(e.target.value)} disabled={busy}>
                        {experimentCategories.map((category) => <optgroup label={category} key={category}>{experimentCases.filter((c) => c.category === category).map((c) => { const ready=readinessFor(c); const unsupported=experimentTarget === "lab" && Boolean(c.evaluationTime || c.executionFixture); return <option key={c.id} value={c.id} disabled={!ready.ready || unsupported}>{c.id} · {c.question}{!ready.ready ? ` · ${ready.reason}` : unsupported ? " · 실험실 조건 준비 중" : ""}</option>; })}</optgroup>)}
                      </select>
                      <button className="primary" disabled={busy || !localAccess || (experimentTarget === "lab" && Boolean(selectedExperiment?.evaluationTime || selectedExperiment?.executionFixture))} onClick={runLocal}>{busy ? "실험 중..." : "선택한 사례 실행"}</button>
                    </div>
                    {selectedExperiment && <div className="lab-case-preview"><strong>{selectedExperiment.id}</strong><span>{selectedExperiment.question}</span><small>기대 동작: {selectedExperiment.expectedBehavior}</small></div>}
                  </div>}
                  {(runSpace === "all" || runSpace === "verification") && <div className="panel lab-setup">
                    <div>
                      <strong>고정 문서 답변 검증 A/B</strong>
                      <p>같은 합성 문서로 답변 생성과 검증을 비교해요.</p>
                      <small>검색은 실행하지 않아요. 모델 의견과 사람 검수를 따로 기록합니다.</small>
                    </div>
                    <div className="lab-controls">
                      <label htmlFor="fixed-case">비교 사례</label>
                      <select id="fixed-case" value={fixedCase} onChange={(e) => setFixedCase(e.target.value)} disabled={busy || !localAccess}>
                        {["S14-01", "S19-01", "S29-01", "S69-01", "S71-01"].map((id) => <option key={id} value={id}>{id}</option>)}
                      </select>
                      <label htmlFor="fixed-variant">검증 방식</label>
                      <select id="fixed-variant" value={fixedVariant} onChange={(e) => setFixedVariant(e.target.value)} disabled={busy || !localAccess}>
                        <option value="A">A · 생성과 자체 점검</option>
                        <option value="B">B · 생성 후 별도 대조</option>
                      </select>
                      <button className="primary" disabled={busy || !localAccess} onClick={runFixed}>{busy ? "실험 중..." : "고정 문서 실험 실행"}</button>
                    </div>
                  </div>}
                  <div className="run-results-layout">
                  <div className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>
                          실험 결과{" "}
                          <span className="count">{visibleRuns.length}</span>
                        </h2>
                        <p>{experimentSpaces.find(space => space.id === runSpace)?.description}</p>
                      </div>
                      <div className="run-list-tools"><label><span className="sr-only">평가셋 버전</span><select aria-label="평가셋 버전" value={runVersion} onChange={(e) => { setRunVersion(e.target.value); setRunLimit(20); }}><option value="all">모든 평가셋</option>{runVersions.map((v) => <option key={v} value={v}>{v.replace(":", " · v")}</option>)}</select></label>{runRevisions.length > 0 && <label><span className="sr-only">실험 방식 버전</span><select aria-label="실험 방식 버전" value={runRevision} onChange={(e) => { setRunRevision(e.target.value); setRunLimit(20); }}><option value="all">모든 실험 방식</option>{runRevisions.map((version) => <option key={version} value={version}>{version}</option>)}</select></label>}<label><span className="sr-only">실험 검색</span><input type="search" placeholder="사례 번호로 검색" value={runSearch} onChange={(e) => { setRunSearch(e.target.value); setRunLimit(20); }} /></label><button className="outline" onClick={() => void load()} disabled={busy}>새로고침</button></div>
                      {datasets.some(
                        (d) =>
                          d.id === "knot-synthetic" &&
                          d.version === "1.0" &&
                          d.locked,
                      ) &&
                        !runs.length && (
                          <button
                            className="outline"
                            onClick={sampleRuns}
                            disabled={busy}
                          >
                            합성 결과 추가
                          </button>
                        )}
                    </div>
                    {visibleRuns.length ? (
                      visibleRuns.slice(0, runLimit).map((r) => {
                        const startedAtKorea = formatKoreaRunTime(r.startedAt);
                        return (
                          <button
                            className={`experiment ${activeRun?.id === r.id ? "selected" : ""}`}
                            key={r.id}
                            aria-pressed={activeRun?.id === r.id}
                            onClick={() => {
                              setOpenRun(r.id);
                              setReviewCase("");
                              setRunNotes("");
                              if (window.matchMedia("(max-width: 900px)").matches) {
                                requestAnimationFrame(() => document.getElementById("run-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                              }
                            }}
                          >
                            <span className="file-icon">
                              <FlaskConical size={18} />
                            </span>
                            <div className="row-main">
                              <strong>{runDisplayTitle(r.name)}</strong>
                              <small>
                                {r.datasetId} v{r.datasetVersion} ·{" "}
                                {r.environment} · {modelLabel(r.model)}
                              </small>
                              <small className="run-start-time">
                                실험 시각 · {startedAtKorea ?? "시간 미수집"} (서울 시간)
                              </small>
                            </div>
                            <span className="muted">
                              {r.results.length}개 사례
                            </span>
                            <span className="badge neutral">
                              {labels[r.status]}
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        );
                      })
                    ) : (
                      <div className="empty">{runSpace === "retrieval" || runSpace === "document" ? "이 단계의 별도 실험은 아직 없어요." : runs.length ? "검색한 실험이 없어요." : "아직 실험이 없어요."}</div>
                    )}
                    {visibleRuns.length > runLimit && <button className="outline run-more" onClick={() => setRunLimit((n) => n + 20)}>결과 더 보기 ({runLimit} / {visibleRuns.length})</button>}
                  </div>
                  {activeRun && (
                    <RunDetail
                      run={activeRun}
                      cases={allCases}
                      reviews={reviews}
                      selected={reviewCase}
                      setSelected={setReviewCase}
                      notes={runNotes}
                      setNotes={setRunNotes}
                      busy={busy}
                      reviewEnabled={localAccess || activeRun.datasetId !== publishedExperimentDatasetId}
                      onStageReview={async (stageId, outcome, stageNotes) => { await action({type:"review",datasetId:activeRun.datasetId,datasetVersion:activeRun.datasetVersion,caseId:activeRun.results[0]?.caseId,runId:activeRun.id,stageId,outcome,notes:stageNotes}); }}
                      onCompare={() => {
                        const current = activeRun;
                        if (!current) return;
                        const paired = current.revision === "condition-impact-v1" && current.experiment ? runs.find(x => x.id !== current.id && x.revision === current.revision && x.datasetId === current.datasetId && x.datasetVersion === current.datasetVersion && x.corpusHash === current.corpusHash && x.experiment?.inputHash === current.experiment?.inputHash && x.experiment?.variant !== current.experiment?.variant && x.model === current.model && x.results.some(result => current.results.some(item => item.caseId === result.caseId))) : undefined;
                        const previous = paired ?? [...runs].reverse().find((x) => x.id !== current.id && x.datasetId === current.datasetId && x.datasetVersion === current.datasetVersion && x.corpusHash === current.corpusHash && x.startedAt < current.startedAt && x.results.some((result) => current.results.some((item) => item.caseId === result.caseId)) && (!current.experiment && !x.experiment || Boolean(current.experiment && x.experiment && current.experiment.inputHash === x.experiment.inputHash && current.experiment.variant === x.experiment.variant && current.model === x.model)));
                        if (!previous) { setError("같은 입력과 방식의 이전 결과가 없어요."); return; }
                        setCompareSpace("all"); setCompareVersion("all"); setCompareRevision("all"); setCompareSearch(""); setLeft(previous.id); setRight(current.id); go("compare");
                      }}
                      onReview={async (outcome) => {
                        const r = activeRun;
                        if (
                          await action({
                            type: "review",
                            datasetId: r.datasetId,
                            datasetVersion: r.datasetVersion,
                            caseId: reviewCase || r.results[0]?.caseId,
                            runId: r.id,
                            outcome,
                            notes: runNotes,
                          })
                        )
                          setRunNotes("");
                      }}
                    />
                  )}
                  </div>
                </>
              )}
              {page === "compare" && (
                <>
                  <div className="heading">
                    <div>
                      <div className="eyebrow">COMPARE</div>
                      <h1>실험 비교</h1>
                      <p>같은 평가셋과 문서 기준의 결과를 나란히 살펴봐요.</p>
                    </div>
                  </div>
                  <nav className="experiment-spaces" aria-label="비교할 워크플로우">
                    {experimentSpaces.map((space) => <button key={space.id} className={`experiment-space ${compareSpace === space.id ? "selected" : ""}`} aria-pressed={compareSpace === space.id} onClick={() => { setCompareSpace(space.id); setCompareVersion("all"); setCompareRevision("all"); setCompareSearch(""); setLeft(""); setRight(""); }}>
                      <span className="experiment-space-top"><strong>{space.label}</strong><span>{space.planned ? "준비 중" : runs.filter(run => belongsToSpace(run, space.id)).length}</span></span>
                      <small>{space.description}</small>
                    </button>)}
                  </nav>
                  <div className="compare-select">
                    <label>평가셋 버전<select value={compareVersion} onChange={(e) => { setCompareVersion(e.target.value); setLeft(""); setRight(""); }}><option value="all">모든 평가셋</option>{runVersions.map(version => <option key={version} value={version}>{version.replace(":", " · v")}</option>)}</select></label>
                    <label>실험 방식 버전<select value={compareRevision} onChange={(e) => { setCompareRevision(e.target.value); setLeft(""); setRight(""); }}><option value="all">모든 실험 방식</option>{[...new Set(runs.filter(run => belongsToSpace(run, compareSpace)).map(run => run.experiment?.promptVersion).filter((version): version is string => Boolean(version)))].sort().map(version => <option key={version} value={version}>{version}</option>)}</select></label>
                    <label>실험 검색<input type="search" value={compareSearch} placeholder="사례 ID 또는 실행 이름" onChange={(e) => { setCompareSearch(e.target.value); setLeft(""); setRight(""); }} /></label>
                  </div>
                  <div className="compare-select">
                    <label>
                      기준 실험
                      <select
                        value={runA?.id ?? ""}
                        onChange={(e) => setLeft(e.target.value)}
                      >
                        {compareRuns.map((r) => (
                          <option key={r.id} value={r.id}>
                            {koreaTimeInText(r.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span>↔</span>
                    <label>
                      비교 실험
                      <select
                        value={runB?.id ?? ""}
                        onChange={(e) => setRight(e.target.value)}
                      >
                        {compareRuns.map((r) => (
                          <option key={r.id} value={r.id}>
                            {koreaTimeInText(r.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {runA && runB ? (
                    <Comparison a={runA} b={runB} cases={allCases} reviews={reviews} />
                  ) : (
                    <div className="panel empty">
                      선택한 조건에 비교할 실험 결과가 2개 이상 필요해요.
                    </div>
                  )}
                </>
              )}
              {page === "reviews" && (
                <>
                  <div className="heading">
                    <div>
                      <div className="eyebrow">REVIEWS</div>
                      <h1>검수 이력</h1>
                      <p>평가자가 남긴 판단과 의견을 순서대로 확인해요.</p>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>
                          최근 검수{" "}
                          <span className="count">{reviews.length}</span>
                        </h2>
                        <p>수정해도 이전 검수 기록은 보존돼요.</p>
                      </div>
                    </div>
                    {reviews.length ? (
                      [...reviews].reverse().map((r) => (
                        <div className="review-row" key={r.id}>
                          <span className="badge">{labels[r.outcome]}</span>
                          <div className="row-main">
                            <strong>
                              {r.caseId} · {r.datasetId} v{r.datasetVersion}
                              {r.runId ? ` · 실험 ${r.runId}` : " · 사례 검수"}
                            </strong>
                            <small>{r.notes || "작성한 의견이 없어요."}</small>
                          </div>
                          <span className="muted">
                            {new Date(r.createdAt).toLocaleString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="empty">아직 검수한 사례가 없어요.</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          <footer>
            knot <span>·</span> Search Evaluation <span>·</span> {page === "hybrid" || (page === "datasets" && workspace1Selected) ? "Workspace 1 평가 자료" : "합성 데이터 전용"}
          </footer>
        </div>
      </main>
    </div>
  );
}
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}
function Comparison({
  a,
  b,
  cases,
  reviews,
}: {
  a: Run;
  b: Run;
  cases: (EvalCase & { datasetId: string; datasetVersion: string })[];
  reviews: DataState["reviews"];
}) {
  const same =
    a.datasetId === b.datasetId &&
    a.datasetVersion === b.datasetVersion &&
    a.corpusHash === b.corpusHash &&
    (!a.experiment && !b.experiment || Boolean(a.experiment && b.experiment && a.experiment.inputHash === b.experiment.inputHash && a.experiment.promptVersion === b.experiment.promptVersion && a.model === b.model && a.results.length === b.results.length && a.results.every((result) => b.results.some((other) => other.caseId === result.caseId))));
  const ids = [
    ...new Set([
      ...a.results.map((r) => r.caseId),
      ...b.results.map((r) => r.caseId),
    ]),
  ];
  return (
    <>
      <div className={`compare-status ${same ? "" : "warn"}`}>
        {same
          ? "평가셋 버전과 입력된 문서 집합 식별자가 같아요. 실제 문서 및 나머지 실행 조건은 별도로 확인하세요."
          : a.experiment && b.experiment && a.experiment.inputHash === b.experiment.inputHash && a.experiment.promptVersion !== b.experiment.promptVersion
            ? `프롬프트가 달라요: ${a.experiment.promptVersion} → ${b.experiment.promptVersion}. 입력과 모델 등 다른 조건도 확인하세요.`
            : "평가셋, 입력 또는 실행 조건이 달라 동일 조건 비교가 아니에요."}
      </div>
      {a.strategy.startsWith("OpenAI Decisions") !== b.strategy.startsWith("OpenAI Decisions") && <div className="compare-status warn">Decisions는 세 가지 질문의 확률을 판단하고, 다른 질문 이해 실험은 대상·조건을 추출해요. 작업 범위가 달라 시간과 품질을 동등하게 비교할 수 없어요.</div>}
      {(a.experiment || b.experiment) && <ProcessComparison runs={[a, b]} reviews={reviews} />}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>
              사례별 결과 <span className="count">{ids.length}</span>
            </h2>
            <p>누락·실패·타임아웃을 포함해 표시해요.</p>
          </div>
        </div>
        {ids.map((id) => (
          <div className="comparison-row" key={id}>
            <div>
              <span className="case-id">{id}</span>
              <p>
                {cases.find(
                  (c) =>
                    c.id === id &&
                    c.datasetId === a.datasetId &&
                    c.datasetVersion === a.datasetVersion,
                )?.question ?? "사례 정보 없음"}
              </p>
            </div>
            <Result result={a.results.find((r) => r.caseId === id)} candidateAvailable={a.environment !== "isolated_spring" && !a.experiment} experimentKind={a.experiment?.kind} />
            <Result result={b.results.find((r) => r.caseId === id)} candidateAvailable={b.environment !== "isolated_spring" && !b.experiment} experimentKind={b.experiment?.kind} />
          </div>
        ))}
      </div>
    </>
  );
}
function Result({ result, candidateAvailable, experimentKind }: { result: Run["results"][number] | undefined; candidateAvailable: boolean; experimentKind?: NonNullable<Run["experiment"]>["kind"] }) {
  return (
    <div className="result">
      {!result ? (
        <span className="badge neutral">결과 없음</span>
      ) : (
        <>
          <span
            className={`badge ${result.status === "completed" ? "" : result.status === "hold" || result.status === "not_run" ? "neutral" : "warning"}`}
          >
            {labels[result.status]}
          </span>
          <p>{result.answer || result.error || "답변 없음"}</p>
          <small>
            후보 {experimentKind === "search_retrieval" ? result.candidates.join(", ") || "없음" : experimentKind === "question_understanding" ? "해당 없음 (검색 미실행)" : experimentKind ? "해당 없음 (고정 문서)" : candidateAvailable ? result.candidates.join(", ") || "없음" : "미수집"} · {experimentKind === "question_understanding" || experimentKind === "search_retrieval" ? "근거 미확인" : experimentKind ? "모델이 제시한 근거 후보" : "근거"}{" "}
            {result.evidenceIds.join(", ") || "없음"} ·{" "}
            {result.latencyMs === null ? "시간 없음" : `${result.latencyMs}ms`}
          </small>
        </>
      )}
    </div>
  );
}

function ExperimentStage({stage, reviews, busy, onReview, separateProvenance, reviewEnabled}: {
  stage: NonNullable<Run["experiment"]>["stages"][number];
  reviews: DataState["reviews"];
  busy: boolean;
  separateProvenance: boolean;
  reviewEnabled: boolean;
  onReview: (outcome: "correct" | "incorrect" | "hold", notes: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const current = [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const grouped = latestReviewsByProvenance(reviews);
  const status = {completed:"실행됨",failed:"실패",not_applicable:"해당 없음",not_run:"미실행"}[stage.status];
  return <section className="detail-block" aria-label={`${stage.label} 단계`}>
    <strong>{stage.label}</strong> <span className="muted">· {status} · {stage.durationMs === null ? "시간 미수집" : `${stage.durationMs.toLocaleString("ko-KR")}ms`}</span>
    <StageResult value={stage.result} />
    <small>입력 토큰 {stage.inputTokens ?? "미수집"} · 출력 토큰 {stage.outputTokens ?? "미수집"}</small>
    {separateProvenance ? <div>
      <p>AI 검수: {grouped.ai ? labels[grouped.ai.outcome] : "미검수"}</p>
      <p>사람 검수: {grouped.human ? labels[grouped.human.outcome] : "미검수"}</p>
      {grouped.unknown && <p>출처 미확인 검수: {labels[grouped.unknown.outcome]} · {grouped.unknown.reviewer}</p>}
    </div> : <p>품질: {current ? `${labels[current.outcome]} · ${current.reviewer} · ${new Date(current.createdAt).toLocaleString("ko-KR", {timeZone:"Asia/Seoul"})}` : stage.status === "not_applicable" ? "해당 없음" : "미검수"}</p>}
    {reviews.length > 0 && <details><summary>검수 이력 {reviews.length}건</summary>{[...reviews].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((review) => <p key={review.id}>{labels[review.outcome]} · {review.reviewer} · {new Date(review.createdAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}{review.notes ? ` · ${review.notes}` : ""}</p>)}</details>}
    {stage.status === "completed" && reviewEnabled && <><textarea aria-label={`${stage.label} 품질 검수 의견`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="이 단계의 품질 판단 근거" /><div className="review-actions">{(["correct","incorrect","hold"] as const).map((outcome) => <button className="outline" disabled={busy} key={outcome} onClick={() => void onReview(outcome,note)}>{labels[outcome]}</button>)}</div></>}
  </section>;
}

function RunDetail({
  run,
  cases,
  reviews,
  selected,
  setSelected,
  notes,
  setNotes,
  busy,
  onReview,
  onStageReview,
  onCompare,
  reviewEnabled,
}: {
  run: Run;
  cases: (EvalCase & { datasetId: string; datasetVersion: string })[];
  reviews: DataState["reviews"];
  selected: string;
  setSelected: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  busy: boolean;
  onReview: (v: "correct" | "incorrect" | "hold") => void;
  onStageReview: (stageId: string, outcome: "correct" | "incorrect" | "hold", notes: string) => Promise<void>;
  onCompare: () => void;
  reviewEnabled: boolean;
}) {
  const result =
    run.results.find((r) => r.caseId === selected) ?? run.results[0];
  const c = cases.find(
    (x) =>
      x.id === result?.caseId &&
      x.datasetId === run.datasetId &&
      x.datasetVersion === run.datasetVersion,
  );
  const failures = run.results.filter((r) => r.status !== "completed").length;
  const startedAtKorea = formatKoreaRunTime(run.startedAt);
  const withEvidence = run.results.filter(
    (r) =>
      cases.find(
        (c) =>
          c.id === r.caseId &&
          c.datasetId === run.datasetId &&
          c.datasetVersion === run.datasetVersion,
      )?.expectedEvidenceIds.length,
  );
  const hits = withEvidence.filter((r) =>
    cases
      .find(
        (c) =>
          c.id === r.caseId &&
          c.datasetId === run.datasetId &&
          c.datasetVersion === run.datasetVersion,
      )
      ?.expectedEvidenceIds.every((id) => r.candidates.includes(id)),
  ).length;
  return (
    <section id="run-detail" className="panel run-detail" aria-label="선택한 실험 결과">
      <div className="panel-head">
        <div>
          <h2>{runDisplayTitle(run.name)}</h2>
          <p>
            {koreaTimeInText(run.strategy)} · {run.environment} · {modelLabel(run.model)} · {run.revision}
          </p>
          <p>실험 시작 · {startedAtKorea ? <time dateTime={run.startedAt}>{startedAtKorea} (서울 시간)</time> : "시간 미수집"}</p>
        </div>
        <div className="run-list-tools"><span className="badge neutral">{labels[run.status]}</span><button className="outline" onClick={onCompare}>이전 결과와 비교</button></div>
      </div>
      <div className="metrics-inline">
        <span>
          결과 <strong>{run.results.length}건</strong>
        </span>
        <span>
          실패·시간 초과·취소{" "}
          <strong>
            {failures} / {run.results.length}
          </strong>
        </span>
        <span>
          기대 근거 후보 포함{" "}
          <strong>
            {run.experiment?.kind === "search_retrieval" ? `${hits} / ${withEvidence.length}` : run.experiment ? "해당 없음" : run.environment === "isolated_spring" ? "미수집" : `${hits} / ${withEvidence.length}`}
          </strong>
        </span>
      </div>
      <p className="run-hint">
        {run.strategy.startsWith("OpenAI Decisions") ? "세 가지 질문에 대한 확률만 판단하며 대상·기간 추출, 문서 검색과 답변 생성은 하지 않아요. AI 검수는 임시 기준 0.5를 사용했어요." : run.experiment?.kind === "question_understanding" ? "질문 이해만 실행하여 문서 검색과 답변 생성은 하지 않아요." : run.experiment?.kind === "search_retrieval" ? "검색과 문서 확인, 답변 생성의 실행 여부는 아래 단계별 결과에서 확인해요." : run.experiment ? "고정 문서 실험은 검색을 실행하지 않아 후보 포함률을 계산하지 않아요." : run.environment === "isolated_spring" ? "Spring은 검색 후보 목록을 반환하지 않아 후보 포함률을 계산하지 않아요." : "기대 근거가 있는 사례만 포함률 분모로 사용해요."} 응답 완료는 정답을 의미하지 않으며 사람의 검수가 필요해요.
      </p>
      {run.model.includes("(LM Studio)") && <p className="run-hint">기존 실행의 서빙 방식은 기록을 확인해야 해요. 현재 서비스는 vLLM을 사용합니다.</p>}
      <div className="run-grid">
        {run.results.length > 1 && <div className="run-case-list">
          {run.results.map((r) => (
            <button
              className={`case-row ${result?.caseId === r.caseId ? "selected" : ""}`}
              key={r.caseId}
              onClick={() => setSelected(r.caseId)}
            >
              <span className="case-id">{r.caseId}</span>
              <span className="row-main">
                <strong>
                  {cases.find(
                    (c) =>
                      c.id === r.caseId &&
                      c.datasetId === run.datasetId &&
                      c.datasetVersion === run.datasetVersion,
                  )?.question || "사례 정보 없음"}
                </strong>
              </span>
              <span className="badge neutral">{labels[r.status]}</span>
            </button>
          ))}
        </div>}
        {result && (
          <div className="detail">
            <div className="detail-block">
              <label>사용자 질문 · {result.caseId}</label>
              <p className="question">{c?.question || "사례 정보 없음"}</p>
            </div>
            {!!c?.history.length && <div className="detail-block">
              <label>이전 대화</label>
              {c.history.map((message, index) => <p className="history" key={index}><span>{message.role === "user" ? "사용자" : "답변"}</span> {message.content}</p>)}
            </div>}
            <div className="detail-block">
              <label>{run.experiment?.kind === "question_understanding" ? "질문 이해 결과" : "실제 응답"} · {labels[result.status]}</label>
              <p className="run-answer">{result.answer || result.error || "답변 없음"}</p>
              {result.retrievalObserved && <p className="muted">검색 단계: {result.retrievalObserved === 'performed' ? '실행됨' : result.retrievalObserved === 'skipped' ? '실행하지 않음' : '확인할 수 없음'}</p>}
              {run.budgetObservation && <p className="muted">입력 제한: {run.budgetObservation.inputChars} / {run.budgetObservation.limitChars}자 · 후보 {run.budgetObservation.documents}개 중 {run.budgetObservation.selectedDocuments}개 전달 · 일부만 확인</p>}
              {result.privacyLogObserved && <p className="muted">합성 개인정보 로그 관측: {result.privacyLogObserved === 'exposed' ? '노출 감지' : result.privacyLogObserved === 'not_observed' ? '관측된 로그에서 노출 없음' : '확인할 수 없음'} (해당 실행의 로그만 확인)</p>}
              {result.answer && result.error && <p className="run-error">오류: {result.error}</p>}
              <p className="muted">
                후보 {run.experiment?.kind === "search_retrieval" ? result.candidates.join(", ") || "없음" : run.experiment?.kind === "question_understanding" ? "해당 없음 (검색 미실행)" : run.experiment ? "해당 없음 (고정 문서)" : run.environment === "isolated_spring" ? "미수집" : result.candidates.join(", ") || "없음"} · {run.experiment?.kind === "search_retrieval" && run.experiment.variant === "observed" ? "저장된 실제 근거" : run.experiment?.kind === "search_retrieval" || run.experiment?.kind === "question_understanding" ? "근거 미확인" : run.experiment ? "모델이 제시한 근거 후보" : "근거"}{" "}
                {result.evidenceIds.join(", ") || "없음"} ·{" "}
                {result.latencyMs === null ? "시간 없음" : `${result.latencyMs}ms`}
              </p>
            </div>
            <div className="detail-block">
              <label>단계별 소요 시간</label>
              {result.clientTimings?.firstProgressMs !== undefined && <p>첫 진행 상황 수신: {result.clientTimings.firstProgressMs.toLocaleString("ko-KR")}ms</p>}
              {result.clientTimings?.firstDeltaMs !== undefined && <p>첫 답변 조각 수신: {result.clientTimings.firstDeltaMs.toLocaleString("ko-KR")}ms</p>}
              {(result.clientTimings?.firstProgressMs !== undefined || result.clientTimings?.firstDeltaMs !== undefined) && <small>질문 POST 전송부터 평가 실행기가 이벤트를 수신하기까지의 시간이에요.</small>}
              {result.stageTimings?.capture === "collected" ? <>
                {result.stageTimings.stages.map((stage, index) => <p key={`${stage.phase}-${index}`}>{stageLabels[stage.phase] ?? stage.phase}: {stage.durationMs.toLocaleString("ko-KR")}ms{stage.outcome === "failure" ? " · 실패" : ""}</p>)}
                <small>백엔드 로그 기준. 첫 내용과 저장 시간은 답변 생성에 포함될 수 있어 단순 합산하지 않아요. 표시되지 않은 단계는 측정되지 않았어요.</small>
              </> : <p className="muted">{run.experiment ? "실험 시간은 아래 단계별 결과에서 확인해요." : "단계별 기록이 없어요. 새 실험부터 수집합니다."}</p>}
            </div>
            {run.experiment && <div className="detail-block">
              <label>단계별 결과·시간·품질</label>
              <p className="muted">{run.experiment.kind === "question_understanding" ? run.strategy.startsWith("OpenAI Decisions") ? "질문 판단 · OpenAI Decisions" : `질문 이해 ${run.experiment.variant === "A" ? "HTTP" : "Spring AI"}` : run.experiment.kind === "search_retrieval" ? `검색 ${run.experiment.variant === "observed" ? "실제 API/SSE 관측" : run.experiment.variant}` : `검증 ${run.experiment.variant}`} · 입력 {run.experiment.inputHash.slice(0, 12)} · 모델의 판정과 사람 검수는 별개예요.</p>
              {run.experiment.stages.map((stage) => <ExperimentStage key={stage.id} stage={stage} reviews={reviews.filter((review) => review.runId === run.id && review.stageId === stage.id)} busy={busy} reviewEnabled={reviewEnabled} separateProvenance={run.experiment?.kind === "question_understanding" || run.experiment?.kind === "search_retrieval"} onReview={(outcome, stageNotes) => onStageReview(stage.id, outcome, stageNotes)} />)}
            </div>}
            <div className="detail-block">
              <label>{run.experiment?.kind === "question_understanding" ? "참고: 전체 답변의 기대 동작" : "기대 동작"}</label>
              <p>{c?.expectedBehavior || "사례 정보 없음"}</p>
            </div>
            <div className="detail-block">
              <label htmlFor="run-note">결과 검수</label>
              {reviewEnabled ? <>
                <textarea
                  id="run-note"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="결과의 근거와 판단을 기록하세요"
                />
                <div className="review-actions">
                  <button className="outline" disabled={busy} onClick={() => onReview("correct")}>적합</button>
                  <button className="outline" disabled={busy} onClick={() => onReview("incorrect")}>부적합</button>
                  <button className="outline" disabled={busy} onClick={() => onReview("hold")}>판단 보류</button>
                </div>
              </> : <p className="muted">Vercel에 게시된 실행 결과는 읽기 전용이에요. 검수 기록은 로컬 실험실에서 작성합니다.</p>}
              <RunReviews reviews={reviews} runId={run.id} caseId={result.caseId} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
