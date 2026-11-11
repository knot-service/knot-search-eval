import assert from "node:assert/strict";
import test from "node:test";
import { searchLabDocuments, syntheticCorpus } from "../lib/lab-search";

test("manual search ranks title and Korean phrase matches and retains original excerpts", () => {
  const documents = syntheticCorpus([{ documents: [
    { id: "document-1", title: "배포 전략 회의", content: "새 배포 전략을 검토했습니다.\n별도 회의 메모", workspaceId: "workspace-458", accessible: true },
    { id: "document-2", title: "성능 회의", content: "배포 전략을 참고합니다.", workspaceId: 458, accessible: true },
    { id: "document-3", title: "일정 회의", content: "휴일을 확인했습니다.", workspaceId: "458", accessible: true },
  ] }]);
  const hits = searchLabDocuments(documents, "배포전략 찾아줘");
  assert.deepEqual(hits.map((hit) => hit.documentId), ["1", "2"]);
  assert.equal(hits[0].excerpt, "새 배포 전략을 검토했습니다.");
  assert.deepEqual(searchLabDocuments(documents, "없는표현 xyz"), []);
});

test("manual search excludes denied documents and other workspaces", () => {
  const document = { id: "document-1", title: "배포", content: "배포", workspaceId: "458", accessible: true };
  const documents = syntheticCorpus([
    { documents: [document, { ...document, id: "document-2", workspaceId: "1" }] },
    { documents: [{ ...document, accessible: false }, { ...document, id: "document-3" }] },
  ]);
  assert.deepEqual(documents.map((entry) => entry.documentId), ["3"]);
});
