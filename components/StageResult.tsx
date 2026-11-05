import { formatStageJson } from "../lib/format-stage-json";

export function StageResult({ value }: { value: string }) {
  const result = formatStageJson(value);
  if (!result) return <pre className="stage-result-text">{value}</pre>;
  return <div className="stage-json">
    <div className="stage-json-header"><span>JSON</span>{result.expanded && <span>중첩 JSON을 펼쳐서 표시</span>}</div>
    <pre><code>{result.formatted}</code></pre>
    {result.expanded && <details><summary>원본 데이터 보기</summary><pre><code>{value}</code></pre></details>}
  </div>;
}
