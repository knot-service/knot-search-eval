"use client";
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
import sampleDataset from "../data/synthetic-dataset.json";
import sampleA from "../data/synthetic-run-a.json";
import sampleB from "../data/synthetic-run-b.json";
type Page = "overview" | "datasets" | "runs" | "compare" | "reviews";
const nav: { id: Page; label: string; icon: typeof Search }[] = [
  { id: "overview", label: "대시보드", icon: LayoutDashboard },
  { id: "datasets", label: "평가셋", icon: FolderOpen },
  { id: "runs", label: "실험 결과", icon: FlaskConical },
  { id: "compare", label: "실험 비교", icon: GitCompareArrows },
  { id: "reviews", label: "검수 이력", icon: ClipboardCheck },
];
const labels: Record<string, string> = {
  answer: "문서 답변",
  not_found: "확인 불가",
  clarify: "되묻기",
  deny: "접근 제한",
  partial: "부분 결과",
  recovery: "장애 복구",
  correct: "적합",
  incorrect: "부적합",
  hold: "판단 보류",
  completed: "완료",
  failed: "실패",
  timeout: "시간 초과",
  cancelled: "취소",
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
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [left, setLeft] = useState(""),
    [right, setRight] = useState(""),
    [notes, setNotes] = useState(""),
    [showMenu, setShowMenu] = useState(false),
    [openRun, setOpenRun] = useState(""),
    [reviewCase, setReviewCase] = useState(""),
    [runNotes, setRunNotes] = useState("");
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
  const filtered = allCases.filter((c) =>
    `${c.id} ${c.question} ${c.category}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const focus =
    filtered.find(
      (c) => `${c.datasetId}:${c.datasetVersion}:${c.id}` === selected,
    ) ?? filtered[0];
  const reviewed = new Set(
    reviews.map((r) => `${r.datasetId}:${r.datasetVersion}:${r.caseId}`),
  ).size;
  const runA = runs.find((r) => r.id === left) ?? runs[0],
    runB = runs.find((r) => r.id === right) ?? runs[1];
  async function seed() {
    if (!(await action({ type: "import_dataset", data: sampleDataset })))
      return;
  }
  async function sampleRuns() {
    if (!(await action({ type: "import_run", data: sampleA }))) return;
    await action({ type: "import_run", data: sampleB });
  }
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.reload();
  }
  const go = (p: Page) => {
    setPage(p);
    setShowMenu(false);
    setSearch("");
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
              <strong>합성 데이터 전용</strong>
              <small>실제 회의 데이터는 사용하지 않아요</small>
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
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => setError("")}>닫기</button>
            </div>
          )}
          {!state ? (
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
                      value={String(datasets.length).padStart(2, "0")}
                      sub="등록된 버전"
                    />
                    <Stat
                      label="평가 사례"
                      value={String(allCases.length).padStart(2, "0")}
                      sub="전체 시나리오"
                    />
                    <Stat
                      label="검수 완료"
                      value={`${reviewed} / ${allCases.length}`}
                      sub="검수 이력 기준"
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
                      {datasets.length ? (
                        datasets.map((d) => (
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
                                <strong>{r.name}</strong>
                                <small>
                                  {r.strategy} · {r.results.length}개 결과
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
                      <p>질문, 문서와 기대 동작을 살펴보고 검수해요.</p>
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
                  <div className="toolbar">
                    <div className="search">
                      <Search size={16} />
                      <input
                        placeholder="사례나 시나리오 검색"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <span className="muted">{filtered.length}개 사례</span>
                  </div>
                  {!datasets.length ? (
                    <div className="panel empty">
                      등록된 평가셋이 없어요.
                      <button
                        className="primary"
                        onClick={seed}
                        disabled={busy}
                      >
                        합성 예시 추가하기
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="dataset-bar">
                        {datasets.map((d) => (
                          <div key={d.id + d.version}>
                            <strong>{d.name}</strong>
                            <span className="badge">v{d.version}</span>
                            <span className="muted">
                              합성 · {d.cases.length}개
                            </span>
                            {d.locked ? (
                              <span className="badge neutral">버전 잠금</span>
                            ) : (
                              <button
                                className="outline"
                                onClick={() =>
                                  action({
                                    type: "lock_dataset",
                                    id: d.id,
                                    version: d.version,
                                  })
                                }
                                disabled={busy}
                              >
                                버전 잠그기
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="case-layout">
                        <section className="panel case-list">
                          <div className="panel-head">
                            <div>
                              <h2>평가 사례</h2>
                              <p>사례를 선택해 기대 동작을 확인하세요.</p>
                            </div>
                          </div>
                          {filtered.map((c) => {
                            const key = `${c.datasetId}:${c.datasetVersion}:${c.id}`;
                            const r = reviews
                              .filter(
                                (r) =>
                                  `${r.datasetId}:${r.datasetVersion}:${r.caseId}` ===
                                  key,
                              )
                              .at(-1);
                            return (
                              <button
                                key={key}
                                onClick={() => setSelected(key)}
                                className={`case-row ${focus?.id === c.id ? "selected" : ""}`}
                              >
                                <span className="case-id">{c.id}</span>
                                <span className="row-main">
                                  <strong>{c.question}</strong>
                                  <small>
                                    {c.category} · {labels[c.expectedType]}
                                  </small>
                                </span>
                                <span className={`badge ${r ? "" : "neutral"}`}>
                                  {r ? labels[r.outcome] : "미검수"}
                                </span>
                              </button>
                            );
                          })}
                          {!filtered.length && (
                            <div className="empty">검색 결과가 없어요.</div>
                          )}
                        </section>
                        {focus && (
                          <CaseDetail
                            item={focus}
                            reviews={reviews.filter(
                              (r) =>
                                r.datasetId === focus.datasetId &&
                                r.datasetVersion === focus.datasetVersion &&
                                r.caseId === focus.id,
                            )}
                            notes={notes}
                            setNotes={setNotes}
                            busy={busy}
                            onReview={async (outcome) => {
                              if (
                                await action({
                                  type: "review",
                                  datasetId: focus.datasetId,
                                  datasetVersion: focus.datasetVersion,
                                  caseId: focus.id,
                                  outcome,
                                  notes,
                                })
                              )
                                setNotes("");
                            }}
                          />
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
              {page === "runs" && (
                <>
                  <div className="heading">
                    <div>
                      <div className="eyebrow">EXPERIMENTS</div>
                      <h1>실험 결과</h1>
                      <p>실험한 환경과 결과를 확인해요.</p>
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
                  <div className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>
                          가져온 실험{" "}
                          <span className="count">{runs.length}</span>
                        </h2>
                        <p>이 화면에서 실험을 직접 실행하지 않아요.</p>
                      </div>
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
                    {runs.length ? (
                      runs.map((r) => (
                        <button
                          className="experiment"
                          key={r.id}
                          onClick={() => {
                            setOpenRun(r.id);
                            setReviewCase("");
                          }}
                        >
                          <span className="file-icon">
                            <FlaskConical size={18} />
                          </span>
                          <div className="row-main">
                            <strong>{r.name}</strong>
                            <small>
                              {r.datasetId} v{r.datasetVersion} ·{" "}
                              {r.environment} · {r.model}
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
                      ))
                    ) : (
                      <div className="empty">
                        아직 실험이 없어요. 평가셋을 잠근 뒤 결과 JSON을
                        가져오세요.
                      </div>
                    )}
                  </div>
                  {openRun && runs.find((r) => r.id === openRun) && (
                    <RunDetail
                      run={runs.find((r) => r.id === openRun)!}
                      cases={allCases}
                      reviews={reviews}
                      selected={reviewCase}
                      setSelected={setReviewCase}
                      notes={runNotes}
                      setNotes={setRunNotes}
                      busy={busy}
                      onReview={async (outcome) => {
                        const r = runs.find((x) => x.id === openRun)!;
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
                  <div className="compare-select">
                    <label>
                      기준 실험
                      <select
                        value={runA?.id ?? ""}
                        onChange={(e) => setLeft(e.target.value)}
                      >
                        {runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
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
                        {runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {runA && runB ? (
                    <Comparison a={runA} b={runB} cases={allCases} />
                  ) : (
                    <div className="panel empty">
                      비교하려면 실험 결과 2개를 가져오세요.
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
            knot <span>·</span> Search Evaluation <span>·</span> 합성 데이터
            전용
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
function CaseDetail({
  item,
  reviews,
  notes,
  setNotes,
  busy,
  onReview,
}: {
  item: EvalCase & { datasetId: string; datasetVersion: string };
  reviews: DataState["reviews"];
  notes: string;
  setNotes: (v: string) => void;
  busy: boolean;
  onReview: (v: "correct" | "incorrect" | "hold") => void;
}) {
  return (
    <section className="panel detail">
      <div className="panel-head">
        <div>
          <div className="case-id">
            {item.id} · {item.scenario}
          </div>
          <h2>사례 상세</h2>
        </div>
        <span className="badge">{labels[item.expectedType]}</span>
      </div>
      <div className="detail-block">
        <label>질문</label>
        <p className="question">{item.question}</p>
      </div>
      {item.history.length > 0 && (
        <div className="detail-block">
          <label>이전 대화</label>
          {item.history.map((h, i) => (
            <p key={i} className="history">
              <span>{h.role === "user" ? "사용자" : "답변"}</span> {h.content}
            </p>
          ))}
        </div>
      )}
      <div className="detail-block">
        <label>기대 동작</label>
        <p>{item.expectedBehavior}</p>
      </div>
      <div className="detail-block">
        <label>참고 문서 · {item.documents.length}</label>
        {item.documents.length ? (
          item.documents.map((d) => (
            <div className="document" key={d.id}>
              <strong>{d.title}</strong>
              <small>{d.id}</small>
              <p>{d.content}</p>
            </div>
          ))
        ) : (
          <p className="muted">접근 가능한 문서가 없어요.</p>
        )}
        <p className="muted evidence">
          기대 근거: {item.expectedEvidenceIds.join(", ") || "없음"}
        </p>
      </div>
      <div className="detail-block">
        <label htmlFor="notes">사람 검수</label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="판단 근거를 기록해 주세요 (합성 내용만)"
        />
        <div className="review-actions">
          <button
            className="outline"
            disabled={busy}
            onClick={() => onReview("correct")}
          >
            적합
          </button>
          <button
            className="outline"
            disabled={busy}
            onClick={() => onReview("incorrect")}
          >
            부적합
          </button>
          <button
            className="outline"
            disabled={busy}
            onClick={() => onReview("hold")}
          >
            판단 보류
          </button>
        </div>
        <p className="muted">
          {reviews.length
            ? `검수 이력 ${reviews.length}건 · 최근 ${labels[reviews.at(-1)!.outcome]}`
            : "아직 검수하지 않았어요."}
        </p>
      </div>
    </section>
  );
}
function Comparison({
  a,
  b,
  cases,
}: {
  a: Run;
  b: Run;
  cases: (EvalCase & { datasetId: string; datasetVersion: string })[];
}) {
  const same =
    a.datasetId === b.datasetId &&
    a.datasetVersion === b.datasetVersion &&
    a.corpusHash === b.corpusHash;
  const ids = [
    ...new Set([
      ...(same
        ? cases
            .filter(
              (c) =>
                c.datasetId === a.datasetId &&
                c.datasetVersion === a.datasetVersion,
            )
            .map((c) => c.id)
        : []),
      ...a.results.map((r) => r.caseId),
      ...b.results.map((r) => r.caseId),
    ]),
  ];
  return (
    <>
      <div className={`compare-status ${same ? "" : "warn"}`}>
        {same
          ? "평가셋 버전과 입력된 문서 집합 식별자가 같아요. 실제 문서 및 나머지 실행 조건은 별도로 확인하세요."
          : "평가셋 버전 또는 문서 집합이 달라 동일 조건 비교가 아니에요."}
      </div>
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
            <Result result={a.results.find((r) => r.caseId === id)} />
            <Result result={b.results.find((r) => r.caseId === id)} />
          </div>
        ))}
      </div>
    </>
  );
}
function Result({ result }: { result: Run["results"][number] | undefined }) {
  return (
    <div className="result">
      {!result ? (
        <span className="badge neutral">결과 없음</span>
      ) : (
        <>
          <span
            className={`badge ${result.status === "completed" ? "" : "warning"}`}
          >
            {labels[result.status]}
          </span>
          <p>{result.answer || result.error || "답변 없음"}</p>
          <small>
            후보 {result.candidates.join(", ") || "없음"} · 근거{" "}
            {result.evidenceIds.join(", ") || "없음"} ·{" "}
            {result.latencyMs === null ? "시간 없음" : `${result.latencyMs}ms`}
          </small>
        </>
      )}
    </div>
  );
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
    <section className="panel run-detail">
      <div className="panel-head">
        <div>
          <h2>{run.name}</h2>
          <p>
            {run.strategy} · {run.environment} · {run.model} · {run.revision}
          </p>
        </div>
        <span className="badge neutral">{labels[run.status]}</span>
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
            {hits} / {withEvidence.length}
          </strong>
        </span>
      </div>
      <p className="run-hint">
        기대 근거가 있는 사례만 포함률 분모로 사용하며, 결과가 없는 사례는
        제외됩니다. 실행 결과는 사람의 검수가 필요해요.
      </p>
      <div className="case-layout run-grid">
        <div>
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
        </div>
        {result && (
          <div className="detail">
            <div className="detail-block">
              <label>기대 동작</label>
              <p>{c?.expectedBehavior || "사례 정보 없음"}</p>
            </div>
            <div className="detail-block">
              <label>실제 결과 · {labels[result.status]}</label>
              <p>{result.answer || result.error || "답변 없음"}</p>
              <p className="muted">
                후보 {result.candidates.join(", ") || "없음"} · 근거{" "}
                {result.evidenceIds.join(", ") || "없음"} ·{" "}
                {result.latencyMs === null
                  ? "시간 없음"
                  : `${result.latencyMs}ms`}
              </p>
            </div>
            <div className="detail-block">
              <label htmlFor="run-note">결과 검수</label>
              <textarea
                id="run-note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="결과의 근거와 판단을 기록하세요"
              />
              <div className="review-actions">
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => onReview("correct")}
                >
                  적합
                </button>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => onReview("incorrect")}
                >
                  부적합
                </button>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => onReview("hold")}
                >
                  판단 보류
                </button>
              </div>
              <p className="muted">
                이 결과의 검수{" "}
                {
                  reviews.filter(
                    (r) => r.runId === run.id && r.caseId === result.caseId,
                  ).length
                }
                건
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
