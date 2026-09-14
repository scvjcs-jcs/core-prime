"use client";

import { useMemo, useState } from "react";
import { getSignedPdfUrl } from "@/app/admin/(protected)/imports/actions";

type WarningRow = {
  id: string;
  scope: "BUILDING" | "LISTING";
  buildingName: string;
  floor: string | null;
  page: number | null;
  reason: string;
};

function categoryOf(reason: string) {
  const r = reason.toLowerCase();
  if (/area|면적|exclusive|gross/.test(r)) return "면적";
  if (/rent|임대료|maintenance|관리비|금액|단가/.test(r)) return "금액";
  if (/move|입주|시기/.test(r)) return "입주시기";
  if (/fallback|평탄화|구조화|표/.test(r)) return "표 인식";
  if (/building|건물명|비정상/.test(r)) return "건물명";
  return "기타";
}

function friendlyReason(reason: string) {
  const map: Record<string, string> = {
    AMBIGUOUS_AREA_LAYOUT: "임대면적/전용면적 표 구조가 모호해 원본 확인이 필요합니다.",
    EXCLUSIVE_AREA_GT_GROSS_AREA: "전용면적이 임대면적보다 크게 인식되었습니다.",
    INVALID_COMPLETION_YEAR: "준공연도가 정상 범위를 벗어납니다.",
  };
  return map[reason] ?? reason;
}

export default function WarningReviewPanel({ sourceDocumentId, warnings, expectedCount }: { sourceDocumentId: string; warnings: WarningRow[]; expectedCount: number }) {
  const [filter, setFilter] = useState("전체");
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const cats = useMemo(() => ["전체", ...Array.from(new Set(warnings.map((w) => categoryOf(w.reason))))], [warnings]);
  const filtered = useMemo(() => warnings.filter((w) => {
    const categoryOk = filter === "전체" || categoryOf(w.reason) === filter;
    const q = query.trim().toLowerCase();
    const textOk = !q || `${w.buildingName} ${w.floor ?? ""} ${w.reason}`.toLowerCase().includes(q);
    return categoryOk && textOk;
  }), [warnings, filter, query]);

  async function openPage(row: WarningRow) {
    setOpening(row.id);
    const r = await getSignedPdfUrl(sourceDocumentId);
    setOpening(null);
    if (r.error || !r.url) { alert(r.error || "원본 PDF를 열 수 없습니다."); return; }
    const url = row.page ? `${r.url}#page=${row.page}` : r.url;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return <section id="warning-review" className="mb-5 scroll-mt-6 border border-amber-300 bg-amber-50/60 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-[.16em] text-amber-700">Warning Review</p>
        <h2 className="mt-1 font-medium">검토 경고 {expectedCount}개</h2>
        <p className="mt-1 text-xs leading-5 text-amber-900">경고 사유와 원본 PDF 페이지를 확인한 뒤 최종 승인하세요. 경고는 자동 오류가 아니라 ‘사람이 한 번 확인하면 좋은 항목’입니다.</p>
      </div>
      <div className="text-right text-xs text-amber-800"><b>{warnings.length}</b>개 상세 경고 표시</div>
    </div>

    {warnings.length !== expectedCount && <p className="mt-3 border border-amber-300 bg-white p-2 text-xs text-amber-800">집계 경고 {expectedCount}개 중 현재 Staging에서 상세 사유를 확인할 수 있는 경고는 {warnings.length}개입니다. 집계값에는 건물/공실 외 파서 전역 경고가 포함될 수 있습니다.</p>}

    <div className="mt-4 flex flex-wrap gap-2">
      {cats.map((c) => <button key={c} onClick={() => setFilter(c)} className={`border px-3 py-1.5 text-xs ${filter===c ? "border-amber-700 bg-amber-700 text-white" : "border-amber-300 bg-white text-amber-900"}`}>{c}{c!=="전체" ? ` ${warnings.filter((w)=>categoryOf(w.reason)===c).length}` : ` ${warnings.length}`}</button>)}
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="건물명·층·경고 검색" className="min-w-[220px] flex-1 border border-amber-300 bg-white px-3 py-1.5 text-xs outline-none" />
    </div>

    <div className="mt-4 max-h-[650px] overflow-auto border border-amber-200 bg-white">
      <table className="min-w-[900px] w-full text-left text-xs">
        <thead className="sticky top-0 bg-amber-50"><tr><th className="px-3 py-2">구분</th><th className="px-3 py-2">건물</th><th className="px-3 py-2">층</th><th className="px-3 py-2">경고 사유</th><th className="px-3 py-2">PDF 페이지</th><th className="px-3 py-2">원본</th></tr></thead>
        <tbody>{filtered.map((w)=><tr key={w.id} className="border-t border-amber-100 align-top"><td className="px-3 py-2"><span className="border border-amber-200 bg-amber-50 px-2 py-1">{w.scope === "BUILDING" ? "건물" : "공실"}</span></td><td className="px-3 py-2 font-medium">{w.buildingName}</td><td className="px-3 py-2">{w.floor ?? "-"}</td><td className="px-3 py-2"><div>{friendlyReason(w.reason)}</div>{friendlyReason(w.reason)!==w.reason&&<div className="mt-1 text-[10px] text-silver">원문 코드: {w.reason}</div>}</td><td className="px-3 py-2 tabular-nums">{w.page ? `p.${w.page}` : "-"}</td><td className="px-3 py-2"><button onClick={()=>openPage(w)} disabled={opening===w.id} className="border border-navy px-2 py-1 text-navy disabled:opacity-40">{opening===w.id ? "여는 중" : w.page ? "원본 페이지 보기" : "원본 PDF 보기"}</button></td></tr>)}</tbody>
      </table>
      {filtered.length===0&&<p className="p-6 text-center text-xs text-silver">조건에 맞는 경고가 없습니다.</p>}
    </div>
  </section>;
}
