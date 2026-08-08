export function formatYen(value: number | null): string {
  if (value === null) return "-";
  return `${value.toLocaleString("ja-JP")}円`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
