import { cookies } from "next/headers";
import { z } from "zod";
import { verifySession } from "../../../lib/auth";

export const dynamic = "force-dynamic";
const Kind = z.enum(["comparison", "lookup", "synthesis", "corpus"]);

async function forward(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? "";
  if (
    process.env.VERCEL ||
    !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    (req.method === "POST" && req.headers.get("origin") !== `http://${host}`)
  ) {
    return Response.json({ error: "로컬 평가실에서 사용할 수 있습니다." }, { status: 403 });
  }
  const session = (await cookies()).get("knot_eval_session")?.value;
  if (!verifySession(session, process.env.SESSION_SECRET)) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const kind = Kind.safeParse(url.searchParams.get("kind"));
  if (!kind.success) {
    return Response.json({ error: "실험 유형을 선택해 주세요." }, { status: 400 });
  }
  if (kind.data === "corpus" && req.method !== "GET") {
    return Response.json({ error: "워크스페이스 집계는 조회만 지원합니다." }, { status: 405 });
  }
  const path = kind.data === "corpus" ? "/workspaces" : `/runs/${kind.data}`;
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
    return Response.json(await result.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "로컬 검색 비교 실행기(18173)를 확인해 주세요." }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
