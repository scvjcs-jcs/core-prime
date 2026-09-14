import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SOURCE_DOCUMENT_STATUS_LABEL, PARSER_TYPE_LABEL, PARSING_RUN_STATUS_LABEL } from "@/lib/labels";
import ViewOriginalPdfButton from "@/components/admin/ViewOriginalPdfButton";
import PdfExtractionControls from "@/components/admin/PdfExtractionControls";
import ImportReviewControls from "@/components/admin/ImportReviewControls";
import type { ParsingRun, SourceDocumentPage } from "@/lib/types";
import { NAI_PARSER_VERSION } from "@/lib/parsers/nai/NAIParser";
import { CBRE_PARSER_VERSION } from "@/lib/parsers/cbre/CBREParser";
import { CW_PARSER_VERSION } from "@/lib/parsers/cw/CWParser";

const TEXT_EXTRACT_PARSER_VERSION = "TEXT-EXTRACT-v1.0.0";
function formatDateTime(value: string | null) { return value ? new Date(value).toLocaleString("ko-KR") : "-"; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString("ko-KR") : "-"; }
function percent(done: number, total: number | null) { return total && total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0; }
function previewText(text: string | null, maxLength = 360) { if (!text?.trim()) return "(텍스트 없음)"; const t=text.trim(); return t.length <= maxLength ? t : `${t.slice(0,maxLength)} …`; }

function extractedValue(data: unknown, key: string): string | number | null {
  if (!data || typeof data !== "object") return null;
  const candidate = (data as Record<string, unknown>)[key];
  if (!candidate || typeof candidate !== "object") return null;
  const value = (candidate as Record<string, unknown>).value;
  return typeof value === "string" || typeof value === "number" ? value : null;
}
function formatNumber(value: string | number | null) {
  if (value === null || value === "") return "-";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g,""));
  return Number.isFinite(n) ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(n) : String(value);
}

function statusBox(status: string) {
  if (status === "APPROVED") return "border-green-200 bg-green-50 text-green-700";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("source_documents").select("*, sources(name)").eq("id", id).maybeSingle();
  if (!doc) notFound();

  const { data: allRunsData } = await supabase.from("parsing_runs").select("*").eq("source_document_id", id).order("created_at", { ascending: false });
  const latestRealRun = ((allRunsData ?? []) as ParsingRun[]).find((r) => r.parser_version === TEXT_EXTRACT_PARSER_VERSION) ?? null;

  let realCounts = { failed:0, pending:0, noText:0 };
  let recentRealPages: SourceDocumentPage[] = [];
  if (latestRealRun) {
    const { data: pageRows } = await supabase.from("source_document_pages").select("status,warnings").eq("parsing_run_id", latestRealRun.id);
    for (const row of pageRows ?? []) {
      if (row.status === "FAILED") realCounts.failed++;
      if (row.status === "PENDING") realCounts.pending++;
      const warnings=(row.warnings ?? []) as unknown[];
      if (row.status === "DONE" && Array.isArray(warnings) && warnings.includes("NO_TEXT")) realCounts.noText++;
    }
    const { data: recentPagesData } = await supabase.from("source_document_pages").select("*").eq("parsing_run_id", latestRealRun.id).not("processed_at","is",null).order("processed_at",{ascending:false}).limit(4);
    recentRealPages = (recentPagesData ?? []) as SourceDocumentPage[];
  }

  const { data: stagingBuildingsData } = latestRealRun ? await supabase.from("staging_buildings").select("id,raw_building_name,primary_source_page,match_status,match_score,match_reason,matched_building_id").eq("parsing_run_id",latestRealRun.id).order("primary_source_page") : { data: [] as any[] };
  const stagingBuildings = stagingBuildingsData ?? [];
  const { data: stagingListingsData } = latestRealRun ? await supabase.from("staging_listings").select("id,staging_building_id,floor,source_page,change_type,review_status,matched_listing_id,matched_building_id,extracted_data").eq("parsing_run_id",latestRealRun.id) : { data: [] as any[] };
  const stagingListings = stagingListingsData ?? [];
  const listingCountByBuilding = new Map<string,number>();
  const buildingNameById = new Map<string,string>();
  for (const b of stagingBuildings) buildingNameById.set(b.id, b.raw_building_name ?? "이름 없음");
  for (const row of stagingListings) listingCountByBuilding.set(row.staging_building_id,(listingCountByBuilding.get(row.staging_building_id) ?? 0)+1);

  const { data: buildingOptionsData } = await supabase.from("buildings").select("id,name").is("deleted_at",null).order("name");
  const buildingOptions = buildingOptionsData ?? [];
  const diffCounts = stagingListings.reduce((acc: Record<string,number>, row: any) => { const key=row.change_type ?? "UNCLASSIFIED"; acc[key]=(acc[key]??0)+1; return acc; },{});
  const removalRows = stagingListings.filter((row:any)=>row.change_type==="POSSIBLY_REMOVED").map((row:any)=>({ id:row.id,floor:row.floor,matched_listing_id:row.matched_listing_id,resolution:row.extracted_data?._removal_resolution ?? null }));
  const conflictRows = stagingListings.filter((row:any)=>row.change_type==="CONFLICT").map((row:any)=>({id:row.id,floor:row.floor,matched_building_id:row.matched_building_id}));
  const matchedBuildingIds=[...new Set(stagingBuildings.map((b:any)=>b.matched_building_id).filter(Boolean))] as string[];
  const { data: existingListingOptionsData } = matchedBuildingIds.length ? await supabase.from("listings").select("id,building_id,floor,unit,status").in("building_id",matchedBuildingIds).neq("status","expired").order("floor") : { data: [] as any[] };
  const sourceName=(doc.sources as unknown as {name:string}|null)?.name ?? "-";
  const progress=latestRealRun ? percent(latestRealRun.processed_pages,latestRealRun.total_pages) : 0;
  const canSemanticParse=Boolean(latestRealRun?.status === "COMPLETED");
  const expectedSemanticVersion = doc.parser_type === "CBRE" ? CBRE_PARSER_VERSION : doc.parser_type === "NAI" ? NAI_PARSER_VERSION : doc.parser_type === "CW" ? CW_PARSER_VERSION : null;
  const stagingIsCurrent = stagingBuildings.length === 0 || !expectedSemanticVersion || doc.parser_version === expectedSemanticVersion;

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[.2em] text-silver">Import Review</p><h1 className="mt-1 font-display text-3xl kr-text">{doc.title}</h1><p className="mt-2 text-sm text-silver">{sourceName} · 기준 {formatDate(doc.report_date)}</p></div><span className={`w-fit border px-3 py-1.5 text-xs ${statusBox(doc.status)}`}>{SOURCE_DOCUMENT_STATUS_LABEL[doc.status] ?? doc.status}</span></div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="border border-silver/25 bg-white p-4"><p className="text-xs text-silver">원본 PDF</p><p className="mt-1 text-lg font-medium tabular-nums">{doc.page_count ?? latestRealRun?.total_pages ?? "-"}<span className="ml-1 text-xs font-normal text-silver">페이지</span></p></div>
        <div className="border border-silver/25 bg-white p-4"><p className="text-xs text-silver">발견 건물</p><p className="mt-1 text-lg font-medium tabular-nums">{doc.total_buildings_detected ?? stagingBuildings.length}</p></div>
        <div className="border border-silver/25 bg-white p-4"><p className="text-xs text-silver">발견 공실</p><p className="mt-1 text-lg font-medium tabular-nums">{doc.total_listings_detected ?? stagingListings.length}</p></div>
        <div className={`border p-4 ${(doc.warning_count ?? 0)>0?"border-amber-200 bg-amber-50":"border-silver/25 bg-white"}`}><p className="text-xs text-silver">검토 경고</p><p className="mt-1 text-lg font-medium tabular-nums">{doc.warning_count ?? 0}</p></div>
      </div>

      <section className="mb-5 border border-silver/25 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">원본 자료 정보</h2><p className="mt-1 text-xs text-silver">원본은 비공개 Storage에 보관되며 관리자만 임시 링크로 열람합니다.</p></div><div className="flex flex-wrap items-center gap-2"><ViewOriginalPdfButton sourceDocumentId={doc.id}/>{doc.parser_type === "CBRE" && latestRealRun?.status === "COMPLETED" && <a href={`/admin/imports/${doc.id}/diagnostic-text`} className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100">CBRE 진단 원문 다운로드</a>}</div></div>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[140px_1fr_140px_1fr]"><dt className="text-silver">원본 파일명</dt><dd className="break-all">{doc.original_filename}</dd><dt className="text-silver">분석 방식</dt><dd>{doc.parser_type ? PARSER_TYPE_LABEL[doc.parser_type] ?? doc.parser_type : "일반"}</dd><dt className="text-silver">업로드일</dt><dd>{formatDateTime(doc.uploaded_at)}</dd><dt className="text-silver">문서 상태</dt><dd>{SOURCE_DOCUMENT_STATUS_LABEL[doc.status] ?? doc.status}</dd></dl>
      </section>

      <section className="mb-5 border border-navy/20 bg-navy/[.035] p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-navy/60">Step 1</p><h2 className="mt-1 font-medium">PDF 원문 추출</h2><p className="mt-1 text-xs leading-5 text-navy/70 kr-text">PDF 각 페이지의 텍스트를 먼저 안전하게 추출합니다. 이 단계만으로 고객용 건물·공실 데이터가 변경되지는 않습니다.</p></div>{latestRealRun && <span className="border border-silver/30 bg-white px-2 py-1 text-xs">{PARSING_RUN_STATUS_LABEL[latestRealRun.status] ?? latestRealRun.status}</span>}</div>
        {latestRealRun ? <><div className="grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-silver">진행률</p><p className="mt-1 text-lg font-medium">{progress}%</p></div><div><p className="text-xs text-silver">완료</p><p className="mt-1 text-lg font-medium">{latestRealRun.processed_pages}/{latestRealRun.total_pages ?? "-"}</p></div><div><p className="text-xs text-silver">실패</p><p className={`mt-1 text-lg font-medium ${realCounts.failed?"text-red-700":""}`}>{realCounts.failed}</p></div><div><p className="text-xs text-silver">텍스트 없음</p><p className="mt-1 text-lg font-medium">{realCounts.noText}</p></div></div><div className="mt-4 h-2 overflow-hidden bg-white"><div className="h-full bg-navy" style={{width:`${progress}%`}}/></div>{latestRealRun.error_message && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{latestRealRun.error_message}</p>}</> : <p className="mb-4 text-sm text-silver">아직 원문 추출을 시작하지 않았습니다.</p>}
        <div className="mt-4"><PdfExtractionControls sourceDocumentId={doc.id} latestRunId={latestRealRun?.id ?? null} latestRunStatus={latestRealRun?.status ?? null} failedPageCount={realCounts.failed}/></div>
        {recentRealPages.length > 0 && <details className="mt-5 border-t border-silver/20 pt-4"><summary className="cursor-pointer text-sm font-medium">최근 추출된 페이지 원문 확인</summary><div className="mt-3 space-y-2">{recentRealPages.map((page)=><div key={page.id} className="border border-silver/20 bg-white p-3 text-xs"><div className="mb-1 flex justify-between"><b>PDF {page.page_number}페이지</b><span className="text-silver">{page.status}</span></div><p className="whitespace-pre-wrap break-words leading-5 text-silver">{page.status === "FAILED" ? page.error_message ?? "오류 메시지 없음" : previewText(page.extracted_text)}</p></div>)}</div></details>}
      </section>

      {doc.parser_type && ["NAI","CBRE","CW"].includes(doc.parser_type) && <section className="mb-5 border border-silver/25 bg-white p-5"><div className="mb-4"><p className="text-xs uppercase tracking-[.16em] text-silver">Step 2–4</p><h2 className="mt-1 font-medium">구조화 · 건물 매칭 · 변경 검수 · 승인</h2><p className="mt-1 text-xs leading-5 text-silver kr-text">원문에서 추출한 후보는 임시 검수영역에만 저장됩니다. 마지막 ‘최종 승인·반영’을 누르기 전에는 실제 건물·공실 DB를 변경하지 않습니다.</p>{expectedSemanticVersion && <p className="mt-2 text-[11px] text-silver">현재 Parser <b>{expectedSemanticVersion}</b>{doc.parser_version ? ` · 저장된 결과 ${doc.parser_version}` : " · 아직 구조화 결과 없음"}</p>}</div>
        <ImportReviewControls sourceDocumentId={doc.id} parserType={doc.parser_type} canParse={canSemanticParse} stagingBuildings={stagingBuildings.map((b:any)=>({id:b.id,raw_building_name:b.raw_building_name,match_status:b.match_status,matched_building_id:b.matched_building_id,match_reason:b.match_reason}))} buildingOptions={buildingOptions} removalRows={removalRows} conflictRows={conflictRows} listingOptions={existingListingOptionsData ?? []} unclassifiedCount={diffCounts.UNCLASSIFIED ?? 0} stagingIsCurrent={stagingIsCurrent}/>
        {stagingListings.length > 0 && <div className="mt-5 border-t border-silver/20 pt-4"><div className="flex flex-wrap gap-2 text-xs">{Object.entries(diffCounts).map(([k,v])=><span key={k} className="border border-silver/30 bg-fog px-2 py-1">{k}: {v}</span>)}</div></div>}
        {stagingListings.length > 0 && <details className="mt-5 border-t border-silver/20 pt-4" open><summary className="cursor-pointer text-sm font-medium">최종 승인 전 공실 데이터 확인 ({stagingListings.length}건)</summary><p className="mt-2 text-xs leading-5 text-silver kr-text">층·면적·평당 임대료·관리비·입주시기를 원본 PDF와 대조해 주세요. 특히 ‘충돌’, ‘업데이트’, 경고가 있는 자료는 반드시 확인한 뒤 승인하는 것을 권장합니다.</p><div className="mt-3 max-h-[620px] overflow-auto border border-silver/20"><table className="min-w-[980px] w-full text-left text-xs"><thead className="sticky top-0 bg-fog"><tr><th className="px-3 py-2">건물</th><th className="px-3 py-2">층</th><th className="px-3 py-2">임대면적(평)</th><th className="px-3 py-2">전용면적(평)</th><th className="px-3 py-2">임대료/평</th><th className="px-3 py-2">관리비/평</th><th className="px-3 py-2">입주</th><th className="px-3 py-2">판정</th><th className="px-3 py-2">출처</th></tr></thead><tbody>{stagingListings.slice(0,200).map((row:any)=>{const d=row.extracted_data; const warnings=Array.isArray(d?._warnings)?d._warnings:[]; return <tr key={row.id} className={`border-t border-silver/15 ${row.change_type==="CONFLICT"?"bg-orange-50":row.change_type==="UPDATED"?"bg-amber-50/50":"bg-white"}`}><td className="px-3 py-2 font-medium">{buildingNameById.get(row.staging_building_id) ?? "-"}</td><td className="px-3 py-2">{row.floor ?? String(extractedValue(d,"floor_raw") ?? "-")}</td><td className="px-3 py-2 tabular-nums">{formatNumber(extractedValue(d,"gross_area_py"))}</td><td className="px-3 py-2 tabular-nums">{formatNumber(extractedValue(d,"exclusive_area_py"))}</td><td className="px-3 py-2 tabular-nums">{formatNumber(extractedValue(d,"rent_per_py"))}</td><td className="px-3 py-2 tabular-nums">{formatNumber(extractedValue(d,"maintenance_per_py"))}</td><td className="px-3 py-2">{String(extractedValue(d,"move_in_text") ?? "-")}</td><td className="px-3 py-2"><span>{row.change_type ?? "UNCLASSIFIED"}</span>{warnings.length>0&&<div className="mt-1 text-[10px] text-amber-700">경고 {warnings.length}</div>}</td><td className="px-3 py-2 tabular-nums">p.{row.source_page ?? "-"}</td></tr>})}</tbody></table></div>{stagingListings.length>200&&<p className="mt-2 text-xs text-silver">화면에는 앞 200건을 표시합니다. 전체 {stagingListings.length}건은 승인 로직에 모두 포함됩니다.</p>}</details>}
        {stagingBuildings.length > 0 && <details className="mt-5 border-t border-silver/20 pt-4" open><summary className="cursor-pointer text-sm font-medium">추출된 건물 후보 {stagingBuildings.length}개 보기</summary><div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto">{stagingBuildings.map((b:any)=><div key={b.id} className="border border-silver/20 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-medium">{b.raw_building_name || "이름 없음"}</span><span className="text-xs text-silver">p.{b.primary_source_page ?? "-"} · 공실 {listingCountByBuilding.get(b.id) ?? 0}</span></div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-silver"><span>매칭 {b.match_status ?? "미처리"}</span>{typeof b.match_score === "number" && <span>신뢰도 {Math.round(b.match_score*100)}%</span>}{b.match_reason && <span>{b.match_reason}</span>}</div></div>)}</div></details>}
      </section>}

      <section className="border border-silver/25 bg-white p-5"><h2 className="font-medium">처리 결과 요약</h2><dl className="mt-4 grid gap-y-2 text-sm sm:grid-cols-[1fr_1fr_1fr_1fr]"><dt className="text-silver">매칭된 건물</dt><dd>{doc.matched_buildings_count ?? 0}</dd><dt className="text-silver">신규 건물 후보</dt><dd>{doc.new_buildings_count ?? 0}</dd><dt className="text-silver">변경 공실</dt><dd>{doc.changed_listings_count ?? 0}</dd><dt className="text-silver">처리 완료</dt><dd>{doc.processing_completed_at ? formatDateTime(doc.processing_completed_at) : "-"}</dd></dl></section>
    </div>
  );
}
