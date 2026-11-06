import { test } from "node:test";
import assert from "node:assert/strict";
import { readSpringStream, SpringStreamError } from "../lib/spring-stream";
import { askDevSpring } from "../lib/dev-spring";

function bytes(text: string): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
}

test("Spring SSE의 분할된 한글 답변과 실제 문서 근거를 수집한다", async () => {
  const stream = bytes(
    'event: accepted\r\ndata: {"conversationId":43}\r\n\r\nevent: delta\r\ndata: {"text":"결정됨"}\r\n\r\nevent: evidence\r\ndata: {"items":[{"documentId":9}]}\r\n\r\nevent: completed\r\ndata: {}\r\n\r\n',
  );
  assert.deepEqual(await readSpringStream(stream), {
    status: "completed",
    conversationId: 43,
    answer: "결정됨",
    evidenceIds: ["9"],
    failureCode: null,
  });
});
test("실패 이벤트는 완료가 아니라 실패로 기록한다", async () => {
  const stream = bytes(
    'event: accepted\ndata: {"conversationId":1}\n\nevent: failed\ndata: {"code":"MODEL_ERROR"}\n\n',
  );
  assert.equal((await readSpringStream(stream)).failureCode, "MODEL_ERROR");
});
test("접수 이벤트의 답변 ID를 시간 로그 연결에 사용한다", async () => {
  const stream = bytes('event: accepted\ndata: {"conversationId":1,"answerMessageId":27}\n\nevent: completed\ndata: {}\n\n');
  assert.equal((await readSpringStream(stream)).answerMessageId, 27);
});
test("첫 진행 및 답변 이벤트를 수신 순서대로 관측한다", async () => {
  const events: string[] = [];
  const stream = bytes('event: accepted\ndata: {"conversationId":1}\n\nevent: progress\ndata: {}\n\nevent: delta\ndata: {"text":"답변"}\n\nevent: completed\ndata: {}\n\n');
  await readSpringStream(stream,(event) => events.push(event));
  assert.deepEqual(events,["accepted","progress","delta"]);
});
test("종료 이벤트 없이 끊긴 응답은 완료로 취급하지 않는다", async () => {
  const stream = bytes('event: accepted\ndata: {"conversationId":1}\n\n');
  await assert.rejects(readSpringStream(stream), SpringStreamError);
});
test("인증값에 다른 쿠키나 줄바꿈이 섞이면 개발 서버에 요청하지 않는다", async () => {
  await assert.rejects(
    askDevSpring({
      content: "질문",
      accessCookie: "__Host-KNOT_ACCESS_TOKEN=x; other=y",
    }),
    SpringStreamError,
  );
  await assert.rejects(
    askDevSpring({
      content: "질문",
      accessCookie: "__Host-KNOT_ACCESS_TOKEN=x\r\nHeader: value",
    }),
    SpringStreamError,
  );
});
