export function activeListingStatus(status: string) {
  return ["available", "negotiating", "contracting"].includes(status);
}

export function freshnessLabel(date: string | null | undefined) {
  if (!date) return { label: "기준일 미확인", tone: "muted" as const, days: null };
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return { label: "기준일 미확인", tone: "muted" as const, days: null };
  const days = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
  if (days <= 30) return { label: `최근 확인 ${days}일 전`, tone: "fresh" as const, days };
  if (days <= 90) return { label: `확인 ${days}일 전`, tone: "normal" as const, days };
  return { label: `재확인 권장 · ${days}일 전`, tone: "stale" as const, days };
}

export function rangeLabel(values: Array<number | null | undefined>, suffix = "") {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const min = nums[0];
  const max = nums[nums.length - 1];
  return min === max ? `${min.toLocaleString("ko-KR")}${suffix}` : `${min.toLocaleString("ko-KR")}–${max.toLocaleString("ko-KR")}${suffix}`;
}
