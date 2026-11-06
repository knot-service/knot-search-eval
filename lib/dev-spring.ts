import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  readSpringStream,
  SpringStreamError,
  type SpringResult,
} from "./spring-stream";

const DEV_ORIGIN = "https://dev-api.knoted.kr";
const WORKSPACE_ID = 43;
const Csrf = z.object({ token: z.string().min(1) });

export type DevQuestion = {
  readonly content: string;
  readonly conversationId?: number;
  readonly accessCookie: string;
  readonly timeoutMs?: number;
};
export type DevQuestionResult = SpringResult & { readonly latencyMs: number };

/** Uses an existing dev login; callers must not persist or log the credential. */
export async function askDevSpring(
  input: DevQuestion,
): Promise<DevQuestionResult> {
  if (!input.content.trim() || Array.from(input.content).length > 2000)
    throw new SpringStreamError("질문 길이를 확인해 주세요.");
  if (
    !input.accessCookie.startsWith("__Host-KNOT_ACCESS_TOKEN=") ||
    input.accessCookie === "__Host-KNOT_ACCESS_TOKEN=" ||
    /[;\r\n]/.test(input.accessCookie)
  )
    throw new SpringStreamError("개발 서버 로그인 정보가 필요합니다.");
  if (
    input.conversationId !== undefined &&
    (!Number.isSafeInteger(input.conversationId) || input.conversationId < 1)
  )
    throw new SpringStreamError("대화 번호를 확인해 주세요.");
  const signal = AbortSignal.timeout(input.timeoutMs ?? 120_000);
  const started = performance.now();
  const csrfResponse = await fetch(`${DEV_ORIGIN}/api/v1/auth/csrf`, {
    signal,
    cache: "no-store",
  });
  if (!csrfResponse.ok)
    throw new SpringStreamError(
      `개발 서버 CSRF 요청 실패 (${csrfResponse.status})`,
    );
  const csrf = Csrf.parse(await csrfResponse.json());
  const cookie = csrfResponse.headers
    .getSetCookie()
    .find((value) => value.startsWith("XSRF-TOKEN="))
    ?.split(";")[0];
  if (!cookie) throw new SpringStreamError("개발 서버 CSRF 쿠키가 없습니다.");
  const conversationPath =
    input.conversationId === undefined
      ? ""
      : `/${input.conversationId}/questions`;
  const response = await fetch(
    `${DEV_ORIGIN}/api/v1/workspaces/${WORKSPACE_ID}/search/conversations${conversationPath}`,
    {
      method: "POST",
      signal,
      cache: "no-store",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        cookie: `${input.accessCookie}; ${cookie}`,
        "X-XSRF-TOKEN": csrf.token,
      },
      body: JSON.stringify({ content: input.content, requestId: randomUUID() }),
    },
  );
  if (!response.ok)
    throw new SpringStreamError(
      `개발 서버 탐색 요청 실패 (${response.status})`,
    );
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  )
    throw new SpringStreamError("개발 서버가 SSE 응답을 반환하지 않았습니다.");
  const result = await readSpringStream(response.body);
  return { ...result, latencyMs: Math.round(performance.now() - started) };
}
