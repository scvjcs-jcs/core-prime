"use client";

import { useMemo, useState } from "react";
import { getSignedPdfUrl } from "@/app/admin/(protected)/imports/actions";

type InfoRow = {
  id: string;
  scope: "BUILDING" | "LISTING";
  buildingName: string;
  floor: string | null;
  page: number | null;
  reason: string;
};

function categoryOf(reason: string) {
  const r = reason.toLowerCase();
  if (/공실 없음|no vacancy/.test(r)) return "공실 없음";
  if (/총액|보증금|월세|임대조건/.test(r)) return "총액형 조건";
  if (/fallback|평탄화|text-item|구조화/.test(r)) return "파서 참고";
  if (/층 범위/.test(r)) return "층 표기";
  return "기타";
}

export default function InformationReviewPanel({ sourceDocumentId, infos }: { sourceDocumentId: string; infos: InfoRow[] }) {
  const [filter, setFilter] = useState("전체");
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const cats = useMemo(() => ["전체", ...Array.from(new Set(infos.map((x) => categoryOf(x.reason))))], [infos]);
  const filtered = useMemo(() => infos.filter((x) => {
    const categoryOk = filter === "전체" || categoryOf(x.reason) === filter;
    const q = query.trim().toLowerCase();
    return categoryOk && (!q || `${x.buildingName} ${x.floor ?? ""} ${x.reason}`.toLowerCase().includes(q));
  }), [infos, filter, query]);

  async function openPage(row: InfoRow) {
    setOpening(row.id);
    const r = await getSignedPdfUrl(sourceDocumentId);
    setOpening(null);
    if (r.error || !r.url) { alert(r.error || "원본 PDF를 열 수 없습니다."); return; }
    window.open(row.page ? `${r.url}#page=${row.page}` : r.url, "_blank", "noopener,noreferrer");
  }

  return <section id="information-review" className="mb-5 scroll-mt-6 border border-sky-200 bg-sky-50/60 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[.16em] text-sky-700">Information</p><h2 className="mt-1 font-medium">참고 정보 {infos.length}개</h2><p className="mt-1 text-xs leading-5 text-sky-900">오류가 아니라 정상 처리 과정에서 남긴 참고 정보입니다. 최종 승인 차단 사유가 아닙니다.</p></div>
      <div className="text-xs text-sky-800">경고와 분리 표시</div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {cats.map((c) => <button key={c} onClick={() => setFilter(c)} className={`border px-3 py-1.5 text-xs ${filter===c ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200 bg-white text-sky-900"}`}>{c} {c==="전체" ? infos.length : infos.filter((x)=>categoryOf(x.reason)===c).length}</button>)}
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="건물명·층·참고 검색" className="min-w-[220px] flex-1 border border-sky-200 bg-white px-3 py-1.5 text-xs outline-none" />
    </div>
    <div className="mt-4 max-h-[500px] overflow-auto border border-sky-100 bg-white"><table className="min-w-[860px] w-full text-left text-xs"><thead className="sticky top-0 bg-sky-50"><tr><th className="px-3 py-2">구분</th><th className="px-3 py-2">건물</th><th className="px-3 py-2">층</th><th className="px-3 py-2">참고 내용</th><th className="px-3 py-2">PDF 페이지</th><th className="px-3 py-2">원본</th></tr></thead><tbody>{filtered.map((x)=><tr key={x.id} className="border-t border-sky-100"><td className="px-3 py-2">{x.scope === "BUILDING" ? "건물" : "공실"}</td><td className="px-3 py-2 font-medium">{x.buildingName}</td><td className="px-3 py-2">{x.floor ?? "-"}</td><td className="px-3 py-2">{x.reason}</td><td className="px-3 py-2">{x.page ? `p.${x.page}` : "-"}</td><td className="px-3 py-2"><button onClick={()=>openPage(x)} disabled={opening===x.id} className="border border-navy px-2 py-1 text-navy disabled:opacity-40">{opening===x.id ? "여는 중" : "원본 보기"}</button></td></tr>)}</tbody></table>{filtered.length===0&&<p className="p-6 text-center text-xs text-silver">조건에 맞는 참고 정보가 없습니다.</p>}</div>
  </section>;
}
