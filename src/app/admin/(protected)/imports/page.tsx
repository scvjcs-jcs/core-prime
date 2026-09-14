import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SOURCE_DOCUMENT_STATUS_LABEL, PARSER_TYPE_LABEL } from "@/lib/labels";

function formatDate(value: string | null): string { return value ? new Date(value).toLocaleDateString("ko-KR") : "-"; }
function statusClass(status: string) {
  if (status === "APPROVED") return "border-green-200 bg-green-50 text-green-700";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "REVIEW_REQUIRED" || status === "PROCESSING") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-silver/30 bg-fog text-silver";
}

export default async function AdminImportsPage() {
  const supabase = await createClient();
  const { data: documents, error } = await supabase.from("source_documents")
    .select("id,title,report_date,uploaded_at,parser_type,status,page_count,total_buildings_detected,total_listings_detected,warning_count,matched_buildings_count,new_buildings_count,changed_listings_count,sources(name)")
    .order("uploaded_at", { ascending: false });

  const pending = (documents ?? []).filter((d) => ["UPLOADED","PROCESSING","REVIEW_REQUIRED","FAILED"].includes(d.status)).length;
  const approved = (documents ?? []).filter((d) => d.status === "APPROVED").length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[.2em] text-silver">Data Pipeline</p><h1 className="mt-1 font-display text-3xl">자료 가져오기 · 검수</h1><p className="mt-2 text-sm text-silver kr-text">출처사 PDF를 등록하고 원문 추출 → 구조화 → 건물 매칭 → 변경사항 검수 → 승인 순서로 반영합니다.</p></div><Link href="/admin/imports/new" className="w-fit bg-navy px-4 py-2.5 text-sm text-white hover:bg-charcoal">+ PDF 자료 등록</Link></div>

      <div className="mb-5 flex gap-3 text-xs"><span className="border border-silver/30 bg-white px-3 py-2">전체 <b className="ml-1 tabular-nums">{documents?.length ?? 0}</b></span><span className="border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">처리·검수 필요 <b className="ml-1 tabular-nums">{pending}</b></span><span className="border border-green-200 bg-green-50 px-3 py-2 text-green-700">승인 완료 <b className="ml-1 tabular-nums">{approved}</b></span></div>

      {error && <p className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">목록을 불러오지 못했습니다: {error.message}</p>}

      <div className="overflow-x-auto border border-silver/25 bg-white">
        <table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-silver/25 bg-fog text-left text-silver"><th className="px-4 py-3 font-normal">출처 · 자료명</th><th className="px-4 py-3 font-normal">기준일</th><th className="px-4 py-3 font-normal">분석 방식</th><th className="px-4 py-3 font-normal">상태</th><th className="px-4 py-3 font-normal">건물 / 공실</th><th className="px-4 py-3 font-normal">매칭 / 신규 / 변경</th><th className="px-4 py-3 font-normal">경고</th><th className="px-4 py-3 font-normal text-right">작업</th></tr></thead>
          <tbody>{(documents ?? []).map((d) => { const source=(d.sources as unknown as {name:string}|null)?.name ?? "-"; return <tr key={d.id} className="border-b border-silver/15 last:border-0 hover:bg-fog/50"><td className="px-4 py-3"><Link href={`/admin/imports/${d.id}`} className="font-medium hover:underline">{d.title}</Link><p className="mt-1 text-xs text-silver">{source} · 업로드 {formatDate(d.uploaded_at)}{d.page_count ? ` · ${d.page_count}p` : ""}</p></td><td className="px-4 py-3 text-silver">{formatDate(d.report_date)}</td><td className="px-4 py-3 text-silver">{d.parser_type ? PARSER_TYPE_LABEL[d.parser_type] ?? d.parser_type : "일반"}</td><td className="px-4 py-3"><span className={`inline-block border px-2 py-1 text-xs ${statusClass(d.status)}`}>{SOURCE_DOCUMENT_STATUS_LABEL[d.status] ?? d.status}</span></td><td className="px-4 py-3 text-silver">{d.total_buildings_detected ?? "-"} / {d.total_listings_detected ?? "-"}</td><td className="px-4 py-3 text-silver">{d.matched_buildings_count ?? "-"} / {d.new_buildings_count ?? "-"} / {d.changed_listings_count ?? "-"}</td><td className={`px-4 py-3 ${(d.warning_count ?? 0)>0?"text-amber-700":"text-silver"}`}>{d.warning_count ?? 0}</td><td className="px-4 py-3 text-right"><Link href={`/admin/imports/${d.id}`} className="text-navy hover:underline">열기 →</Link></td></tr> })}
            {(!documents || documents.length===0) && <tr><td colSpan={8} className="px-4 py-12 text-center text-silver">아직 등록된 자료가 없습니다. PDF 자료를 먼저 등록해 주세요.</td></tr>}
          </tbody></table>
      </div>
    </div>
  );
}
