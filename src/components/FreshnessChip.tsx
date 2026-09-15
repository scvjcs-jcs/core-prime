import { freshnessLabel } from "@/lib/publicData";

export default function FreshnessChip({ date }: { date: string | null | undefined }) {
  const meta = freshnessLabel(date);
  const cls = meta.tone === "fresh" ? "data-chip data-chip--fresh" : meta.tone === "stale" ? "data-chip text-amber-800 border-amber-300" : "data-chip";
  return <span className={cls}>{meta.label}</span>;
}
