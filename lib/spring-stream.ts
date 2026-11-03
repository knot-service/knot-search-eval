import { z } from "zod";

const Accepted = z.object({ conversationId: z.number().int().positive(), answerMessageId: z.number().int().positive().optional() });
const Delta = z.object({ text: z.string() });
const Evidence = z.object({
  items: z.array(z.object({ documentId: z.number().int().positive() })),
});
const Failed = z.object({ code: z.string().optional() });

export type SpringResult = {
  readonly status: "completed" | "failed" | "stopped";
  readonly conversationId: number;
  readonly answerMessageId?: number;
  readonly answer: string;
  readonly evidenceIds: readonly string[];
  readonly failureCode: string | null;
};

export class SpringStreamError extends Error {}

/** Read actual Spring SSE, preserving UTF-8 characters and event boundaries across chunks. */
export async function readSpringStream(
  stream: ReadableStream<Uint8Array>,
  onEvent?: (event: "accepted" | "progress" | "delta") => void,
): Promise<SpringResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let conversationId: number | undefined;
  let answerMessageId: number | undefined;
  let answer = "";
  let evidenceIds: string[] = [];
  let terminal: SpringResult["status"] | undefined;
  let failureCode: string | null = null;

  function consume(frame: string): void {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (
      !data.length ||
      ![
        "accepted",
        "progress",
        "delta",
        "evidence",
        "completed",
        "failed",
        "stopped",
      ].includes(event)
    )
      return;
    if (terminal) throw new SpringStreamError("종료 이후 이벤트를 받았습니다.");
    if (event === "accepted" || event === "progress" || event === "delta") onEvent?.(event);
    let payload: unknown;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      throw new SpringStreamError("Spring 이벤트를 해석하지 못했습니다.");
    }
    if (event === "accepted") {
      const accepted = Accepted.parse(payload);
      conversationId = accepted.conversationId;
      answerMessageId = accepted.answerMessageId;
    }
    if (event === "delta") answer += Delta.parse(payload).text;
    if (event === "evidence")
      evidenceIds = Evidence.parse(payload).items.map((item) =>
        String(item.documentId),
      );
    if (event === "completed" || event === "failed" || event === "stopped")
      terminal = event;
    if (event === "failed")
      failureCode = Failed.parse(payload).code ?? "ANSWER_GENERATION_FAILED";
  }

  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary && boundary.index !== undefined) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!conversationId || !terminal)
    throw new SpringStreamError(
      "Spring 응답이 완료되기 전에 연결이 종료됐습니다.",
    );
  return { status: terminal, conversationId, ...(answerMessageId ? { answerMessageId } : {}), answer, evidenceIds, failureCode };
}
