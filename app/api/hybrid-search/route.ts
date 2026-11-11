import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifySession } from "../../../lib/auth";
import { readWorkspace1Artifact, readWorkspace458SearchCases } from "../../../lib/db";
import { toWorkspace1Dataset, Workspace1Dataset } from "../../../lib/workspace1-dataset";
import { LabSearchQuery, publishedEvidenceCorpus, searchLabDocuments, syntheticCorpus } from "../../../lib/lab-search";
import phase4 from "../../../data/hybrid-search-phase4.json";
import phase5 from "../../../data/hybrid-search-phase5.json";
import phase6 from "../../../data/hybrid-search-phase6.json";
import phase6Split from "../../../data/hybrid-search-phase6-lookup-worker.json";
import phase6QwenReplay from "../../../data/hybrid-search-phase6-qwen-replay.json";
import phase6GenerationReplay from "../../../data/hybrid-search-phase6-generation-routes.json";
import phase6AgingReplay from "../../../data/hybrid-search-phase6-synthesis-aging.json";
import phase6SustainedReplay from "../../../data/hybrid-search-phase6-sustained.json";
import quality1 from "../../../data/hybrid-search-quality1.json";

export const dynamic = "force-dynamic";
const Kind = z.enum(["search", "comparison", "lookup", "synthesis", "corpus", "dataset", "phase1", "phase2", "phase3", "phase4", "phase5", "phase6", "quality1"]);
const headers = { "Cache-Control": "no-store" };

async function workspaceArtifact(kind: "dataset" | "phase1" | "phase2" | "phase3") {
  const dataset = kind === "dataset";
  const missing = dataset ? "Workspace 1 평가셋 초안을 준비 중입니다." : "검색 품질 결과를 준비 중입니다.";
  try {
    if (process.env.VERCEL) {
      const artifact = await readWorkspace1Artifact(kind);
      return artifact === null
        ? Response.json({ error: missing }, { status: 404 })
        : Response.json(artifact, { headers });
    }

    const override = {
      dataset: process.env.KNOT_WORKSPACE1_DATASET_FILE,
      phase1: process.env.KNOT_WORKSPACE1_PHASE1_FILE,
      phase2: process.env.KNOT_WORKSPACE1_PHASE2_FILE,
      phase3: process.env.KNOT_WORKSPACE1_PHASE3_FILE,
    }[kind];
    const filename = override ?? resolve(
      process.cwd(), "..", "knot-search-hybrid-eval", "experiments", "hybrid-search",
      ".local", dataset ? "workspace1-evaluation-draft.json" : `workspace1-${kind}.json`,
    );
    const data = await readFile(filename, "utf8");
    if (dataset) {
      return Response.json(toWorkspace1Dataset(JSON.parse(data)), { headers });
    }
    const summary = z.object({ results: z.array(z.unknown()) }).passthrough().parse(JSON.parse(data));
    const { results: _results, ...metrics } = summary;
    return Response.json(metrics, { headers });
  } catch (error) {
    const notFound = error instanceof Error && "code" in error && error.code === "ENOENT";
    return Response.json(
      { error: notFound ? missing : "Workspace 1 결과를 읽지 못했습니다." },
      { status: notFound ? 404 : 503 },
    );
  }
}

async function search(req: Request) {
  if (req.method !== "POST") return Response.json({ error: "POST로 질문을 보내 주세요." }, { status: 405 });
  const query = LabSearchQuery.safeParse(await req.json().catch(() => null));
  if (!query.success) return Response.json({ error: "워크스페이스와 검색어(2~240자)를 확인해 주세요." }, { status: 400 });
  const { workspace, question } = query.data;
  try {
    let documents;
    if (workspace === 1) {
      const dataset = await workspaceArtifact("dataset");
      if (!dataset.ok) return dataset;
      documents = publishedEvidenceCorpus(Workspace1Dataset.parse(await dataset.json()));
    } else {
      const cases = await readWorkspace458SearchCases();
      if (!cases) return Response.json({ error: "Workspace 458 평가셋이 없습니다." }, { status: 404 });
      documents = syntheticCorpus(cases);
    }
    return Response.json({ workspace, documentsSearched: documents.length, hits: searchLabDocuments(documents, question) }, { headers });
  } catch {
    return Response.json({ error: "검색 자료를 읽지 못했습니다." }, { status: 503 });
  }
}

async function forward(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? "";
  const local = !process.env.VERCEL &&
    /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  const kind = Kind.safeParse(url.searchParams.get("kind"));
  if (!kind.success) {
    return Response.json({ error: "실험 유형을 선택해 주세요." }, { status: 400 });
  }
  const target = kind.data;
  if (target === "search") {
    if (!verifySession((await cookies()).get("knot_eval_session")?.value, process.env.SESSION_SECRET)) {
      return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const origin = `${process.env.VERCEL ? "https:" : url.protocol}//${host}`;
    if (req.method === "POST" && req.headers.get("origin") !== origin) {
      return Response.json({ error: "Lab에서 검색해 주세요." }, { status: 403 });
    }
    return search(req);
  }
  const springReport = target === "phase4" || target === "phase5" || target === "phase6" || target === "quality1";
  const artifact = target === "dataset" || target === "phase1" || target === "phase2" || target === "phase3";
  if (
    (!local && !(process.env.VERCEL && (artifact || springReport))) ||
    (req.method === "POST" && req.headers.get("origin") !== `http://${host}`)
  ) {
    return Response.json({ error: "실험 실행은 로컬 평가실에서 사용할 수 있습니다." }, { status: 403 });
  }
  const session = (await cookies()).get("knot_eval_session")?.value;
  if (!verifySession(session, process.env.SESSION_SECRET)) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (springReport) {
    if (req.method !== "GET") return Response.json({ error: "게시된 실험 결과는 조회만 지원합니다." }, { status: 405 });
    const phase6Report = { ...phase6, split: phase6Split, qwenReplay: phase6QwenReplay, generationReplay: phase6GenerationReplay, agingReplay: phase6AgingReplay, sustainedReplay: phase6SustainedReplay };
    return Response.json({ phase4, phase5, phase6: phase6Report, quality1 }[target], { headers });
  }
  if (artifact) {
    return req.method === "GET"
      ? workspaceArtifact(target)
      : Response.json({ error: "게시된 평가셋과 결과는 조회만 지원합니다." }, { status: 405 });
  }
  if (target === "corpus" && req.method !== "GET") {
    return Response.json({ error: "워크스페이스 집계는 조회만 지원합니다." }, { status: 405 });
  }
  const path = target === "corpus" ? "/workspaces" : `/runs/${target}`;
  try {
    const result = await fetch(`http://127.0.0.1:18173${path}`, {
      method: req.method,
      cache: "no-store",
      signal: AbortSignal.timeout(165_000),
    });
    if (!result.ok) {
      const error = z.object({ detail: z.string() }).safeParse(await result.json());
      return Response.json(
        { error: error.success ? error.data.detail : "실험 실행에 실패했습니다." },
        { status: result.status },
      );
    }
    return Response.json(await result.json(), { headers });
  } catch {
    return Response.json({ error: "로컬 검색 비교 실행기(18173)를 확인해 주세요." }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
