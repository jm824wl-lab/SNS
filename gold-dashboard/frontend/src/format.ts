export function formatPrice(value: number, decimals: number): string {
  return value.toLocaleString("ja-JP", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSigned(value: number, decimals: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${sign}${formatPrice(value, decimals)}`;
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatRelativeTime(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}日前`;
}

export function formatClockTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatEventDateTime(isoString: string): string {
  const d = new Date(isoString);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${date}(${weekday}) ${hh}:${mm}`;
}
