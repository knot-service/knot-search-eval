export type StageJson = { formatted: string; expanded: boolean };

export function formatStageJson(raw: string): StageJson | null {
  const parseContainer = (value: string): unknown => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
    } catch { return undefined; }
  };
  const root = parseContainer(raw);
  if (root === undefined) return null;
  let expanded = false;
  const unfold = (value: unknown, depth: number): unknown => {
    if (depth >= 6) return value;
    if (typeof value === 'string') {
      const nested = parseContainer(value);
      if (nested !== undefined) { expanded = true; return unfold(nested, depth + 1); }
      return value;
    }
    if (Array.isArray(value)) return value.map(item => unfold(item, depth + 1));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unfold(item, depth + 1)]));
    }
    return value;
  };
  return { formatted: JSON.stringify(unfold(root, 0), null, 2), expanded };
}
