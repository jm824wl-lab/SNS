import type { Verdict } from "./api";

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

export function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "pdf":
      return "PDF取込";
    case "gmail":
      return "Gmail取込";
    default:
      return "メール取込";
  }
}

export function formatMan(man: number | null): string {
  if (man === null) return "";
  if (man >= 10000) return `${(man / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}億円`;
  return `${man.toLocaleString("ja-JP")}万円`;
}

export function formatRange(min: number | null, max: number | null, fmt: (v: number) => string): string | null {
  if (min === null && max === null) return null;
  return `${min !== null ? fmt(min) : ""}〜${max !== null ? fmt(max) : ""}`;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  match: "条件に合致",
  possible: "要確認(情報不足)",
  near: "1条件のみ不適合",
  unmatched: "対象外",
};
