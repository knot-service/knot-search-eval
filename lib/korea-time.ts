/** Render UTC timestamps in stored run labels without changing the stored instant. */
export function koreaTimeInText(value: string): string {
  return value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return `${date.toLocaleString("ko-KR", {timeZone:"Asia/Seoul",hour12:false})} (한국 시간)`;
  });
}

/** 실험 시작 시각을 서울 시간의 월·일·시·분으로 표시한다. */
export function formatKoreaRunTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const month = part("month"), day = part("day"), hour = part("hour"), minute = part("minute");
  if (!month || !day || !hour || !minute) return null;
  return `${month}-${day} ${hour}:${minute}`;
}
