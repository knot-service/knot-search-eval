/** Render UTC timestamps in stored run labels without changing the stored instant. */
export function koreaTimeInText(value: string): string {
  return value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return `${date.toLocaleString("ko-KR", {timeZone:"Asia/Seoul",hour12:false})} (한국 시간)`;
  });
}
