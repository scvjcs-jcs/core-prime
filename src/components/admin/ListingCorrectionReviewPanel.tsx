"use client";

import { useMemo, useState } from "react";
import { applyListingCorrection, getSignedPdfUrl, verifyListingWarningNoChange, type ListingCorrectionPayload } from "@/app/admin/(protected)/imports/actions";

type Values = {
  floor: string | null;
  unit: string | null;
  gross_area: number | null;
  gross_area_py: number | null;
  exclusive_area: number | null;
  exclusive_area_py: number | null;
  deposit_per_py: number | null;
  rent_per_py: number | null;
  maintenance_per_py: number | null;
  noc_per_py: number | null;
  deposit_total_won: number | null;
  monthly_rent_total_won: number | null;
  management_fee_total_won: number | null;
  move_in_text: string | null;
  status: string | null;
  is_published: boolean | null;
};

type CorrectionRow = {
  stagingListingId: string;
  listingId: string | null;
  buildingName: string;
  floor: string | null;
  page: number | null;
  reasons: string[];
  current: Values | null;
  extracted: Values;
  correctionStatus: "PENDING" | "APPLIED" | "VERIFIED_NO_CHANGE" | null;
  note: string | null;
};

const numberKeys: Array<keyof Values> = [
  "gross_area","gross_area_py","exclusive_area","exclusive_area_py",
  "deposit_per_py","rent_per_py","maintenance_per_py","noc_per_py",
  "deposit_total_won","monthly_rent_total_won","management_fee_total_won",
];

function format(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(v);
  return String(v);
}

function initialForm(row: CorrectionRow): Record<string, string | boolean> {
  const source = row.current ?? row.extracted;
  const out: Record<string, string | boolean> = {};
  for (const [k,v] of Object.entries(source)) out[k] = typeof v === "boolean" ? v : v === null || v === undefined ? "" : String(v);
  return out;
}

export default function ListingCorrectionReviewPanel({ sourceDocumentId, rows }: { sourceDocumentId: string; rows: CorrectionRow[] }) {
  const [query,setQuery] = useState("");
  const [status,setStatus] = useState("미검토");
  const [openId,setOpenId] = useState<string | null>(null);
  const [forms,setForms] = useState<Record<string,Record<string,string|boolean>>>({});
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState<string | null>(null);
  const [message,setMessage] = useState<string | null>(null);

  const counts = useMemo(() => ({
    pending: rows.filter(r => !r.correctionStatus || r.correctionStatus === "PENDING").length,
    applied: rows.filter(r => r.correctionStatus === "APPLIED").length,
    verified: rows.filter(r => r.correctionStatus === "VERIFIED_NO_CHANGE").length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    const q=query.trim().toLowerCase();
    const qok=!q || `${r.buildingName} ${r.floor ?? ""} ${r.reasons.join(" ")}`.toLowerCase().includes(q);
    const sok=status === "전체" || (status === "미검토" && (!r.correctionStatus || r.correctionStatus === "PENDING")) || (status === "수정반영" && r.correctionStatus === "APPLIED") || (status === "정상확인" && r.correctionStatus === "VERIFIED_NO_CHANGE");
    return qok && sok;
  }), [rows,query,status]);

  function ensureForm(row: CorrectionRow) {
    setForms(prev => prev[row.stagingListingId] ? prev : ({...prev,[row.stagingListingId]:initialForm(row)}));
    setNotes(prev => prev[row.stagingListingId] !== undefined ? prev : ({...prev,[row.stagingListingId]:row.note ?? ""}));
    setOpenId(prev => prev === row.stagingListingId ? null : row.stagingListingId);
  }

  async function openPdf(row: CorrectionRow) {
    setBusy(`pdf-${row.stagingListingId}`);
    const r=await getSignedPdfUrl(sourceDocumentId);
    setBusy(null);
    if (r.error || !r.url) { alert(r.error || "원본 PDF를 열 수 없습니다."); return; }
    window.open(row.page ? `${r.url}#page=${row.page}` : r.url,"_blank","noopener,noreferrer");
  }

  async function apply(row: CorrectionRow) {
    const form=forms[row.stagingListingId] ?? initialForm(row);
    const patch: ListingCorrectionPayload = {};
    for (const key of numberKeys) {
      const raw=String(form[key] ?? "").replace(/,/g,"").trim();
      (patch as Record<string, unknown>)[key] = raw === "" ? null : Number(raw);
    }
    patch.floor=String(form.floor ?? "").trim() || null;
    patch.unit=String(form.unit ?? "").trim() || null;
    patch.move_in_text=String(form.move_in_text ?? "").trim() || null;
    patch.status=String(form.status ?? "available") || "available";
    patch.is_published=Boolean(form.is_published);
    if (Object.values(patch).some(v => typeof v === "number" && !Number.isFinite(v))) { alert("숫자 입력값을 확인해 주세요."); return; }
    setBusy(row.stagingListingId); setMessage(null);
    const r=await applyListingCorrection(sourceDocumentId,row.stagingListingId,patch,notes[row.stagingListingId] ?? "");
    setBusy(null);
    if (r.error) { alert(r.error); return; }
    setMessage(`${row.buildingName} ${row.floor ?? ""} 수정값을 실제 공실 DB에 반영했습니다.`);
    window.location.reload();
  }

  async function verify(row: CorrectionRow) {
    if (!confirm("원본과 현재 등록값이 맞아서 수정 없이 검토완료 처리할까요?")) return;
    setBusy(row.stagingListingId); setMessage(null);
    const r=await verifyListingWarningNoChange(sourceDocumentId,row.stagingListingId,notes[row.stagingListingId] ?? "");
    setBusy(null);
    if (r.error) { alert(r.error); return; }
    setMessage(`${row.buildingName} ${row.floor ?? ""} 항목을 정상 확인 처리했습니다.`);
    window.location.reload();
  }

  return <section id="listing-correction-review" className="mb-5 border border-red-200 bg-red-50/40 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[.16em] text-red-700">Post-Approval Correction</p><h2 className="mt-1 font-medium">승인 후 오류 매물 정정</h2><p className="mt-1 text-xs leading-5 text-red-900">최종 승인된 공실 중 경고가 남은 항목만 원본과 대조해서 개별 수정하거나 ‘현재값 정상’으로 검토완료 처리합니다. 전체 PDF를 다시 승인할 필요는 없습니다.</p></div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="border bg-white px-3 py-2"><b>{counts.pending}</b><div>미검토</div></div><div className="border bg-white px-3 py-2"><b>{counts.applied}</b><div>수정반영</div></div><div className="border bg-white px-3 py-2"><b>{counts.verified}</b><div>정상확인</div></div></div>
    </div>
    {message && <p className="mt-3 border border-green-200 bg-green-50 p-2 text-xs text-green-800">{message}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {["미검토","전체","수정반영","정상확인"].map(s=><button key={s} onClick={()=>setStatus(s)} className={`border px-3 py-1.5 text-xs ${status===s?"border-red-700 bg-red-700 text-white":"border-red-200 bg-white text-red-900"}`}>{s}</button>)}
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="건물명·층·경고 검색" className="min-w-[240px] flex-1 border border-red-200 bg-white px-3 py-1.5 text-xs outline-none" />
    </div>
    <div className="mt-4 space-y-2">
      {filtered.map(row => {
        const form=forms[row.stagingListingId] ?? initialForm(row);
        const opened=openId===row.stagingListingId;
        const badge=row.correctionStatus === "APPLIED" ? "수정반영" : row.correctionStatus === "VERIFIED_NO_CHANGE" ? "정상확인" : "미검토";
        return <div key={row.stagingListingId} className="border border-red-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div><div className="flex flex-wrap items-center gap-2"><b>{row.buildingName}</b><span>{row.floor ?? "층 미상"}</span><span className="border px-2 py-0.5 text-[10px]">{badge}</span></div><p className="mt-1 text-xs text-red-700">{row.reasons.join(" · ")}</p><p className="mt-1 text-[11px] text-silver">PDF {row.page ? `p.${row.page}` : "페이지 미상"} · 실제 공실 {row.listingId ? "연결됨" : "자동 연결 예정"}</p></div>
            <div className="flex gap-2"><button onClick={()=>openPdf(row)} disabled={busy===`pdf-${row.stagingListingId}`} className="border px-3 py-1.5 text-xs">원본 페이지</button><button onClick={()=>ensureForm(row)} className="border border-navy px-3 py-1.5 text-xs text-navy">{opened?"닫기":"검수·정정"}</button></div>
          </div>
          {opened && <div className="border-t bg-fog/40 p-4">
            <div className="overflow-auto"><table className="min-w-[1120px] w-full text-xs"><thead><tr><th className="p-2 text-left">항목</th><th className="p-2 text-left">현재 DB</th><th className="p-2 text-left">PDF 추출값</th><th className="p-2 text-left">정정값</th></tr></thead><tbody>{[
              ["floor","층"],["unit","호실"],["gross_area_py","임대면적(평)"],["exclusive_area_py","전용면적(평)"],["rent_per_py","임대료/평"],["maintenance_per_py","관리비/평"],["deposit_total_won","총 보증금(원)"],["monthly_rent_total_won","총 월세(원)"],["management_fee_total_won","총 관리비(원)"],["move_in_text","입주시기"],
            ].map(([key,label])=><tr key={key} className="border-t"><td className="p-2 font-medium">{label}</td><td className="p-2">{format(row.current?.[key as keyof Values])}</td><td className="p-2 text-silver">{format(row.extracted[key as keyof Values])}</td><td className="p-2"><input value={String(form[key] ?? "")} onChange={e=>setForms(prev=>({...prev,[row.stagingListingId]:{...form,[key]:e.target.value}}))} className="w-full border bg-white px-2 py-1" /></td></tr>)}</tbody></table></div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]"><input value={notes[row.stagingListingId] ?? ""} onChange={e=>setNotes(prev=>({...prev,[row.stagingListingId]:e.target.value}))} placeholder="정정/검토 메모 (선택)" className="border bg-white px-3 py-2 text-xs"/><button disabled={busy===row.stagingListingId} onClick={()=>verify(row)} className="border border-green-700 px-4 py-2 text-xs text-green-700 disabled:opacity-40">현재값 정상 · 검토완료</button><button disabled={busy===row.stagingListingId} onClick={()=>apply(row)} className="bg-charcoal px-4 py-2 text-xs text-white disabled:opacity-40">수정값 개별 반영</button></div>
          </div>}
        </div>;
      })}
      {filtered.length===0 && <p className="border bg-white p-6 text-center text-xs text-silver">조건에 맞는 경고 매물이 없습니다.</p>}
    </div>
  </section>;
}
