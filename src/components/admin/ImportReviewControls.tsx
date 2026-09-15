"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveImportBatch,
  bulkCreateBuildingsFromStaging,
  classifyImportDiff,
  createBuildingFromStaging,
  generateSemanticStaging,
  resolveListingConflict,
  resolvePossibleRemoval,
  runBuildingMatching,
  setManualBuildingMatch,
} from "@/app/admin/(protected)/imports/actions";

type BuildingOption = { id: string; name: string };
type StagingBuilding = { id: string; raw_building_name: string | null; match_status: string | null; matched_building_id: string | null; match_reason: string | null };
type RemovalRow = { id: string; floor: string | null; matched_listing_id: string | null; resolution: string | null };
type ConflictRow = { id: string; floor: string | null; matched_building_id: string | null };
type ListingOption = { id: string; building_id: string; floor: string | null; unit: string | null; status: string };

const MATCH_LABEL: Record<string,string> = {
  UNMATCHED: "미매칭", AUTO_MATCHED: "자동 매칭", REVIEW_REQUIRED: "확인 필요", NEW_CANDIDATE: "신규 후보",
  MANUAL_MATCHED: "수동 매칭", MATCHED: "매칭 완료", AMBIGUOUS: "후보 중복", REVIEW_NEEDED: "확인 필요",
};
const MATCH_PAGE_SIZE = 25;

export default function ImportReviewControls({
  sourceDocumentId, parserType, canParse, stagingBuildings, buildingOptions, removalRows, conflictRows, listingOptions, unclassifiedCount, stagingIsCurrent = true, documentStatus,
}: {
  sourceDocumentId: string; parserType: string | null; canParse: boolean; stagingBuildings: StagingBuilding[]; buildingOptions: BuildingOption[];
  removalRows: RemovalRow[]; conflictRows: ConflictRow[]; listingOptions: ListingOption[]; unclassifiedCount: number; stagingIsCurrent?: boolean; documentStatus?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>("");
  const [selectedNewIds, setSelectedNewIds] = useState<string[]>([]);
  const [matchPage, setMatchPage] = useState(1);

  const unmatched = useMemo(() => stagingBuildings.filter((b) => !b.matched_building_id), [stagingBuildings]);
  const unmatchedCount = unmatched.length;
  const unresolvedRemovalCount = removalRows.filter((r) => !r.resolution).length;
  const canApprove = stagingIsCurrent && stagingBuildings.length > 0 && unmatchedCount === 0 && conflictRows.length === 0 && unresolvedRemovalCount === 0 && unclassifiedCount === 0;
  const safeNewCandidates = unmatched.filter((b) => b.match_status === "NEW_CANDIDATE");
  const reviewCandidates = unmatched.filter((b) => b.match_status !== "NEW_CANDIDATE");

  const matchPages = Math.max(1, Math.ceil(unmatched.length / MATCH_PAGE_SIZE));
  const safeMatchPage = Math.min(matchPage, matchPages);
  const visibleUnmatched = unmatched.slice((safeMatchPage - 1) * MATCH_PAGE_SIZE, safeMatchPage * MATCH_PAGE_SIZE);
  const visibleSafeIds = visibleUnmatched.filter((b) => b.match_status === "NEW_CANDIDATE").map((b) => b.id);
  const allVisibleSafeSelected = visibleSafeIds.length > 0 && visibleSafeIds.every((id) => selectedNewIds.includes(id));

  const run = (fn: () => Promise<any>, ok: string) => start(async () => {
    setMessage("");
    const r = await fn();
    setMessage(r?.error ? `오류: ${r.error}` : ok);
    if (!r?.error) router.refresh();
  });

  const approved = documentStatus === "APPROVED";
  const steps = [
    { no: 1, title: "자료 구조화", done: stagingIsCurrent && stagingBuildings.length > 0, desc: "PDF 원문 → 건물·공실 후보" },
    { no: 2, title: "건물 매칭", done: stagingIsCurrent && stagingBuildings.length > 0 && unmatchedCount === 0, desc: "기존 DB 또는 신규 건물 연결" },
    { no: 3, title: "변경 검수", done: stagingIsCurrent && stagingBuildings.length > 0 && unclassifiedCount === 0 && conflictRows.length === 0 && unresolvedRemovalCount === 0, desc: "신규·변경·종료 가능 공실" },
    { no: 4, title: "승인 반영", done: approved, desc: "검수 결과를 실제 DB에 반영" },
  ];

  const primary = approved ? { step: 4, title: "승인 완료", desc: "이 자료는 실제 DB에 반영되었습니다. 아래 경고/정정 작업함만 확인하면 됩니다.", label: "승인 완료", action: null as null | (()=>void), disabled: true }
    : !canParse ? { step: 0, title: "원문 추출이 먼저 필요합니다", desc: "위 Step 1에서 PDF 원문 추출을 완료해 주세요.", label: "원문 추출 필요", action: null, disabled: true }
    : !stagingIsCurrent || stagingBuildings.length === 0 ? { step: 1, title: "PDF를 건물·공실 데이터로 구조화하세요", desc: "원문은 임시 검수영역으로만 들어가며 실제 DB는 변경되지 않습니다.", label: "자료 구조화 시작", action: () => start(async()=>{ setMessage(""); const r=await generateSemanticStaging(sourceDocumentId); setMessage(r?.error?`오류: ${r.error}`:`자료 구조화 완료 · 건물 ${r.buildings??0}개 · 공실 ${r.listings??0}개 · 경고 ${r.warnings??0}개`); if(!r?.error) router.refresh(); }), disabled: pending }
    : unmatchedCount > 0 ? { step: 2, title: `건물 ${unmatchedCount}개 연결이 필요합니다`, desc: "자동 매칭 후 남은 신규 후보는 일괄 비공개 등록하거나 기존 건물에 수동 연결합니다.", label: "기존 건물 자동매칭", action: () => run(()=>runBuildingMatching(sourceDocumentId),"건물 자동매칭이 완료되었습니다."), disabled: pending }
    : unclassifiedCount > 0 ? { step: 3, title: `공실 ${unclassifiedCount}개 변경 분류가 필요합니다`, desc: "신규·업데이트·종료 가능 공실을 계산합니다.", label: "공실 변경사항 계산", action: () => run(()=>classifyImportDiff(sourceDocumentId),"공실 변경사항 분류가 완료되었습니다."), disabled: pending }
    : conflictRows.length > 0 || unresolvedRemovalCount > 0 ? { step: 3, title: "수동 검수가 남아 있습니다", desc: `충돌 ${conflictRows.length}개 · 종료 여부 미선택 ${unresolvedRemovalCount}개를 아래 작업함에서 처리해 주세요.`, label: "아래 검수 작업함 확인", action: () => document.getElementById("import-manual-review")?.scrollIntoView({behavior:"smooth"}), disabled: false }
    : canApprove ? { step: 4, title: "최종 승인 준비가 완료되었습니다", desc: "승인하면 검수 결과가 실제 건물·공실 DB에 반영됩니다.", label: "최종 승인·반영", action: () => { if(confirm("검수 결과를 실제 건물·공실 DB에 반영할까요? 승인 후 고객 화면에 영향을 줄 수 있습니다.")) run(()=>approveImportBatch(sourceDocumentId),"승인·반영이 완료되었습니다."); }, disabled: pending }
    : { step: 3, title: "검수 상태를 확인해 주세요", desc: "아래 상태 요약과 검수 작업함에서 남은 항목을 확인해 주세요.", label: "검수 작업함 보기", action: () => document.getElementById("import-manual-review")?.scrollIntoView({behavior:"smooth"}), disabled: false };

  return (
    <div className="space-y-5">
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((s) => <div key={s.no} className={`border p-3 ${s.done ? "border-green-200 bg-green-50" : primary.step===s.no ? "border-navy bg-navy/[.04] ring-1 ring-navy/10" : "border-silver/25 bg-fog"}`}><div className="flex items-center justify-between"><p className="text-xs font-medium">{s.no}. {s.title}</p><span className={`text-[10px] ${s.done ? "text-green-700" : primary.step===s.no ? "text-navy" : "text-silver"}`}>{s.done ? "완료" : primary.step===s.no ? "현재" : "대기"}</span></div><p className="mt-1 text-[11px] leading-4 text-silver kr-text">{s.desc}</p></div>)}
      </div>

      <div className={`border p-4 ${approved ? "border-green-200 bg-green-50" : "border-navy/25 bg-navy/[.035]"}`}>
        <p className="text-[11px] font-medium uppercase tracking-[.14em] text-silver">다음 할 일</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h3 className="font-medium text-charcoal">{primary.title}</h3><p className="mt-1 text-xs leading-5 text-silver">{primary.desc}</p></div><button type="button" disabled={primary.disabled} onClick={()=>primary.action?.()} className={`shrink-0 px-4 py-2.5 text-sm ${approved ? "border border-green-300 bg-white text-green-700" : "bg-navy text-white"} disabled:opacity-50`}>{pending ? "처리 중..." : primary.label}</button></div>
      </div>

      {!stagingIsCurrent && stagingBuildings.length > 0 && <p className="border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"><b>이전 Parser 결과입니다.</b> 현재 Parser로 자료 구조화를 다시 실행하기 전에는 다음 단계를 진행하지 않습니다.</p>}
      {message && <p role="status" className={`border p-3 text-sm ${message.startsWith("오류:") ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>{message}</p>}

      <details className="border border-silver/25 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-silver">고급 작업 · 단계별 버튼 직접 보기</summary>
        <div className="flex flex-wrap gap-2 border-t border-silver/20 p-4">
          <button disabled={pending || !canParse || !parserType || !["NAI","CBRE","CW"].includes(parserType)} onClick={() => start(async () => { setMessage(""); const r = await generateSemanticStaging(sourceDocumentId); setMessage(r?.error ? `오류: ${r.error}` : `자료 구조화 완료 · 건물 ${r.buildings ?? 0}개 · 공실 ${r.listings ?? 0}개 · 경고 ${r.warnings ?? 0}개`); if (!r?.error) router.refresh(); })} className="border border-navy px-3 py-2 text-xs text-navy disabled:opacity-40">1. 자료 구조화</button>
          <button disabled={pending || !stagingIsCurrent || stagingBuildings.length === 0} onClick={() => run(() => runBuildingMatching(sourceDocumentId), "건물 자동매칭이 완료되었습니다.")} className="border border-navy px-3 py-2 text-xs text-navy disabled:opacity-40">2. 건물 자동매칭</button>
          <button disabled={pending || !stagingIsCurrent || stagingBuildings.length === 0 || unmatchedCount > 0} onClick={() => run(() => classifyImportDiff(sourceDocumentId), "공실 변경사항 분류가 완료되었습니다.")} className="border border-navy px-3 py-2 text-xs text-navy disabled:opacity-40">3. 변경사항 계산</button>
          <button disabled={pending || !canApprove || approved} onClick={() => { if (confirm("검수 결과를 실제 DB에 반영할까요?")) run(() => approveImportBatch(sourceDocumentId), "승인·반영이 완료되었습니다."); }} className="border border-charcoal px-3 py-2 text-xs text-charcoal disabled:opacity-35">4. 최종 승인</button>
        </div>
      </details>

      <div id="import-manual-review" className="scroll-mt-20 space-y-4">
        {(unmatchedCount > 0 || conflictRows.length > 0 || removalRows.length > 0) && <div className="grid gap-2 sm:grid-cols-3">
          <div className="border border-amber-200 bg-amber-50 p-3 text-xs"><span className="text-amber-800">건물 연결</span><b className="ml-2 text-base">{unmatchedCount}</b></div>
          <div className="border border-orange-200 bg-orange-50 p-3 text-xs"><span className="text-orange-800">공실 충돌</span><b className="ml-2 text-base">{conflictRows.length}</b></div>
          <div className="border border-red-200 bg-red-50 p-3 text-xs"><span className="text-red-800">종료 여부 확인</span><b className="ml-2 text-base">{unresolvedRemovalCount}</b></div>
        </div>}

        {unmatchedCount > 0 && <details open className="border border-amber-200 bg-amber-50">
          <summary className="cursor-pointer p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">건물 연결 작업함</b><p className="mt-1 text-xs text-amber-800">안전 신규후보 {safeNewCandidates.length} · 확인 필요 {reviewCandidates.length}</p></div><span className="text-xs text-amber-800">{safeMatchPage}/{matchPages} 페이지</span></div></summary>
          <div className="border-t border-amber-200 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending || visibleSafeIds.length===0} onClick={() => setSelectedNewIds((prev)=>allVisibleSafeSelected ? prev.filter((id)=>!visibleSafeIds.includes(id)) : Array.from(new Set([...prev,...visibleSafeIds])))} className="border border-green-700 bg-white px-3 py-2 text-xs text-green-800 disabled:opacity-40">{allVisibleSafeSelected ? "현재 페이지 선택 해제" : `현재 페이지 안전후보 ${visibleSafeIds.length}개 선택`}</button>
              <button type="button" disabled={pending || selectedNewIds.length===0} onClick={() => { if (!confirm(`선택한 ${selectedNewIds.length}개 건물을 신규 건물로 비공개 등록할까요?`)) return; start(async () => { setMessage(""); const r=await bulkCreateBuildingsFromStaging(sourceDocumentId,selectedNewIds); if(r.error) setMessage(`오류: ${r.error}`); else { setMessage(`신규 건물 등록 완료 · 생성 ${r.created??0} · 기존 재연결 ${r.linkedExisting??0} · 검토 보류 ${r.skippedReview??0} · 실패 ${r.failed??0}`); setSelectedNewIds([]); router.refresh(); } }); }} className="bg-green-800 px-3 py-2 text-xs text-white disabled:opacity-40">선택 {selectedNewIds.length}개 일괄 신규등록</button>
              <span className="text-[11px] text-amber-800">한 화면에 25개씩 표시합니다.</span>
            </div>
            <div className="space-y-2">{visibleUnmatched.map((b)=><ManualRow key={b.id} b={b} buildings={buildingOptions} disabled={pending} selected={selectedNewIds.includes(b.id)} selectable={b.match_status==="NEW_CANDIDATE"} onSelect={(checked)=>setSelectedNewIds((prev)=>checked?[...new Set([...prev,b.id])]:prev.filter((id)=>id!==b.id))} onMatch={(buildingId)=>run(()=>setManualBuildingMatch(sourceDocumentId,b.id,buildingId),"기존 건물에 연결했습니다.")} onCreate={()=>run(()=>createBuildingFromStaging(sourceDocumentId,b.id),"신규 건물을 비공개 등록했습니다.")} />)}</div>
            {matchPages>1&&<div className="mt-3 flex justify-end gap-2 text-xs"><button disabled={safeMatchPage<=1} onClick={()=>setMatchPage(p=>Math.max(1,p-1))} className="border bg-white px-3 py-1.5 disabled:opacity-30">이전</button><button disabled={safeMatchPage>=matchPages} onClick={()=>setMatchPage(p=>Math.min(matchPages,p+1))} className="border bg-white px-3 py-1.5 disabled:opacity-30">다음</button></div>}
          </div>
        </details>}

        {conflictRows.length > 0 && <details open className="border border-orange-200 bg-orange-50"><summary className="cursor-pointer p-4 text-sm font-medium">공실 충돌 검수 {conflictRows.length}건</summary><div className="space-y-2 border-t border-orange-200 p-4">{conflictRows.map((r)=><ConflictRowControl key={r.id} row={r} options={listingOptions.filter((o)=>o.building_id===r.matched_building_id)} disabled={pending} onNew={()=>run(()=>resolveListingConflict(sourceDocumentId,r.id,"AS_NEW"),`${r.floor??"공실"}: 신규 공실 처리`)} onMatch={(listingId)=>run(()=>resolveListingConflict(sourceDocumentId,r.id,"MATCH_EXISTING",listingId),`${r.floor??"공실"}: 기존 공실 연결`)} />)}</div></details>}

        {removalRows.length > 0 && <details open className="border border-red-200 bg-red-50"><summary className="cursor-pointer p-4 text-sm font-medium">이번 자료에서 보이지 않는 기존 공실 {removalRows.length}건</summary><div className="space-y-2 border-t border-red-200 p-4">{removalRows.map((r)=><div key={r.id} className="flex flex-wrap items-center gap-2 border border-red-100 bg-white p-2 text-xs"><span className="mr-auto">{r.floor??"층 미정"}</span>{(["KEEP","LEASED","EXPIRED","HIDDEN"] as const).map((x)=><button key={x} disabled={pending} onClick={()=>run(()=>resolvePossibleRemoval(sourceDocumentId,r.id,x),`${r.floor??"공실"} 상태 저장`)} className={`border px-2 py-1 ${r.resolution===x?"bg-navy text-white":"bg-white"}`}>{x==="KEEP"?"계속 유지":x==="LEASED"?"임대완료":x==="EXPIRED"?"만료":"숨김"}</button>)}</div>)}</div></details>}
      </div>
    </div>
  );
}

function ManualRow({ b, buildings, disabled, selected, selectable, onSelect, onMatch, onCreate }: { b: StagingBuilding; buildings: BuildingOption[]; disabled: boolean; selected: boolean; selectable: boolean; onSelect: (checked:boolean)=>void; onMatch: (id:string)=>void; onCreate: ()=>void }) {
  const [id,setId] = useState("");
  const needsReview = b.match_status === "REVIEW_REQUIRED" || b.match_status === "AMBIGUOUS" || b.match_status === "REVIEW_NEEDED";
  return <div className={`grid items-center gap-2 bg-white p-3 text-sm md:grid-cols-[auto_1.1fr_1fr_auto_auto] ${needsReview ? "ring-1 ring-orange-200" : ""}`}>
    <div className="flex items-center justify-center"><input aria-label={`${b.raw_building_name ?? "건물"} 선택`} type="checkbox" checked={selected} disabled={disabled || !selectable} onChange={(e)=>onSelect(e.target.checked)} className="h-4 w-4"/></div>
    <div><b>{b.raw_building_name ?? "이름 없음"}</b><div className={`mt-1 text-xs ${needsReview ? "text-orange-700" : "text-silver"}`}>{MATCH_LABEL[b.match_status ?? ""] ?? b.match_status ?? "미매칭"}{b.match_reason ? ` · ${b.match_reason}` : ""}</div>{needsReview && <div className="mt-1 text-[10px] text-orange-700">중복 가능성이 있어 일괄 신규등록에서 제외됩니다.</div>}</div>
    <select className="border px-2 py-2" value={id} onChange={(e)=>setId(e.target.value)}><option value="">기존 건물 선택</option>{buildings.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <button disabled={disabled || !id} onClick={()=>onMatch(id)} className="border px-3 py-2 disabled:opacity-40">기존 건물 연결</button>
    <button disabled={disabled || !selectable} onClick={()=>{if(confirm(`${b.raw_building_name ?? "이 건물"}을 신규 건물로 비공개 등록할까요?`)) onCreate();}} className="bg-navy px-3 py-2 text-white disabled:opacity-40">신규 등록</button>
  </div>;
}

function ConflictRowControl({ row, options, disabled, onNew, onMatch }: { row: ConflictRow; options: ListingOption[]; disabled:boolean; onNew:()=>void; onMatch:(id:string)=>void }) {
  const [id,setId]=useState("");
  return <div className="grid items-center gap-2 border border-orange-100 bg-white p-2 text-xs md:grid-cols-[.5fr_1.4fr_auto_auto]"><span>{row.floor ?? "층 미정"}</span><select value={id} onChange={(e)=>setId(e.target.value)} className="border px-2 py-1.5"><option value="">기존 공실 선택</option>{options.map((o)=><option key={o.id} value={o.id}>{o.floor ?? "층 미정"}{o.unit ? ` ${o.unit}` : ""} · {o.status}</option>)}</select><button disabled={disabled || !id} onClick={()=>onMatch(id)} className="border px-2 py-1.5 disabled:opacity-40">기존 공실 업데이트</button><button disabled={disabled} onClick={onNew} className="border px-2 py-1.5 disabled:opacity-40">신규 공실</button></div>;
}
