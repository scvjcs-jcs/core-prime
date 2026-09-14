"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveImportBatch,
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

export default function ImportReviewControls({
  sourceDocumentId, parserType, canParse, stagingBuildings, buildingOptions, removalRows, conflictRows, listingOptions, unclassifiedCount, stagingIsCurrent = true,
}: {
  sourceDocumentId: string; parserType: string | null; canParse: boolean; stagingBuildings: StagingBuilding[]; buildingOptions: BuildingOption[];
  removalRows: RemovalRow[]; conflictRows: ConflictRow[]; listingOptions: ListingOption[]; unclassifiedCount: number; stagingIsCurrent?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>("");
  const unmatchedCount = stagingBuildings.filter((b) => !b.matched_building_id).length;
  const unresolvedRemovalCount = removalRows.filter((r) => !r.resolution).length;
  const canApprove = stagingIsCurrent && stagingBuildings.length > 0 && unmatchedCount === 0 && conflictRows.length === 0 && unresolvedRemovalCount === 0 && unclassifiedCount === 0;

  const run = (fn: () => Promise<any>, ok: string) => start(async () => {
    setMessage("");
    const r = await fn();
    setMessage(r?.error ? `오류: ${r.error}` : ok);
    if (!r?.error) router.refresh();
  });

  const steps = [
    { no: 1, title: "자료 구조화", done: stagingIsCurrent && stagingBuildings.length > 0, desc: "PDF 원문에서 건물·공실 후보 생성" },
    { no: 2, title: "건물 매칭", done: stagingIsCurrent && stagingBuildings.length > 0 && unmatchedCount === 0, desc: "기존 DB 또는 신규 건물 연결" },
    { no: 3, title: "변경 검수", done: stagingIsCurrent && stagingBuildings.length > 0 && unclassifiedCount === 0 && conflictRows.length === 0 && unresolvedRemovalCount === 0, desc: "신규·변경·종료 가능 공실 확인" },
    { no: 4, title: "승인 반영", done: false, desc: "검수 결과를 실제 DB에 반영" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((s) => <div key={s.no} className={`border p-3 ${s.done ? "border-green-200 bg-green-50" : "border-silver/25 bg-fog"}`}><div className="flex items-center justify-between"><p className="text-xs font-medium">{s.no}. {s.title}</p><span className={`text-[10px] ${s.done ? "text-green-700" : "text-silver"}`}>{s.done ? "완료" : "대기"}</span></div><p className="mt-1 text-[11px] leading-4 text-silver kr-text">{s.desc}</p></div>)}
      </div>

      <div className="flex flex-wrap gap-2">
        <button disabled={pending || !canParse || !parserType || !["NAI","CBRE","CW"].includes(parserType)} onClick={() => start(async () => {
          setMessage("");
          const r = await generateSemanticStaging(sourceDocumentId);
          setMessage(r?.error ? `오류: ${r.error}` : `1단계 자료 구조화 완료 · 건물 ${r.buildings ?? 0}개 · 공실 ${r.listings ?? 0}개 · 경고 ${r.warnings ?? 0}개`);
          if (!r?.error) router.refresh();
        })} className="bg-navy px-4 py-2 text-sm text-white disabled:opacity-40">1. 건물·공실 후보 만들기</button>
        <button disabled={pending || !stagingIsCurrent || stagingBuildings.length === 0} onClick={() => run(() => runBuildingMatching(sourceDocumentId), "2단계 건물 자동매칭이 완료되었습니다.")} className="border border-navy px-4 py-2 text-sm text-navy disabled:opacity-40">2. 기존 건물 자동매칭</button>
        <button disabled={pending || !stagingIsCurrent || stagingBuildings.length === 0 || unmatchedCount > 0} onClick={() => run(() => classifyImportDiff(sourceDocumentId), "3단계 공실 변경사항 분류가 완료되었습니다.")} className="border border-navy px-4 py-2 text-sm text-navy disabled:opacity-40">3. 공실 변경사항 계산</button>
        <button disabled={pending || !canApprove} onClick={() => { if (confirm("검수 결과를 실제 건물·공실 DB에 반영할까요? 승인 후 고객 화면에 영향을 줄 수 있습니다.")) run(() => approveImportBatch(sourceDocumentId), "4단계 승인·반영이 완료되었습니다."); }} className="bg-charcoal px-4 py-2 text-sm text-white disabled:opacity-35">4. 최종 승인·반영</button>
      </div>

      {!canParse && <p className="border border-silver/25 bg-fog p-3 text-xs text-silver">먼저 위의 PDF 원문 추출을 완료해야 자료 구조화를 시작할 수 있습니다.</p>}
      {!stagingIsCurrent && stagingBuildings.length > 0 && <p className="border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"><b>이전 Parser 결과가 화면에 남아 있습니다.</b> 1단계 ‘건물·공실 후보 만들기’를 다시 실행해 현재 Parser 결과로 교체하기 전에는 2~4단계를 진행할 수 없습니다.</p>}
      {stagingBuildings.length > 0 && !canApprove && <div className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><b>최종 승인 전 확인:</b>{unmatchedCount > 0 ? ` 미매칭 건물 ${unmatchedCount}개.` : ""}{unclassifiedCount > 0 ? ` 미분류 공실 ${unclassifiedCount}개.` : ""}{conflictRows.length > 0 ? ` 충돌 공실 ${conflictRows.length}개.` : ""}{unresolvedRemovalCount > 0 ? ` 종료 여부 미선택 ${unresolvedRemovalCount}개.` : ""}</div>}
      {message && <p role="status" className={`border p-3 text-sm ${message.startsWith("오류:") ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>{message}</p>}

      {unmatchedCount > 0 && <div className="border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-medium">건물 연결 확인이 필요합니다.</p><p className="mb-3 mt-1 text-xs text-amber-800">자동으로 확정하지 못한 건물입니다. 기존 건물을 선택하거나 실제 신규 건물이라면 비공개 상태로 먼저 등록하세요.</p><div className="space-y-3">{stagingBuildings.filter((b) => !b.matched_building_id).map((b) => <ManualRow key={b.id} b={b} buildings={buildingOptions} disabled={pending} onMatch={(buildingId) => run(() => setManualBuildingMatch(sourceDocumentId,b.id,buildingId), "기존 건물에 연결했습니다.")} onCreate={() => run(() => createBuildingFromStaging(sourceDocumentId,b.id), "신규 건물을 비공개로 등록하고 연결했습니다.")} />)}</div></div>}

      {conflictRows.length > 0 && <div className="border border-orange-200 bg-orange-50 p-4"><p className="text-sm font-medium">같은 층의 기존 공실이 여러 개 있습니다.</p><p className="mb-3 mt-1 text-xs text-orange-800">신규 공실인지, 기존 공실의 업데이트인지 직접 선택해 주세요.</p><div className="space-y-2">{conflictRows.map((r) => <ConflictRowControl key={r.id} row={r} options={listingOptions.filter((o) => o.building_id === r.matched_building_id)} disabled={pending} onNew={() => run(() => resolveListingConflict(sourceDocumentId,r.id,"AS_NEW"), `${r.floor ?? "공실"}: 신규 공실로 처리했습니다.`)} onMatch={(listingId) => run(() => resolveListingConflict(sourceDocumentId,r.id,"MATCH_EXISTING",listingId), `${r.floor ?? "공실"}: 기존 공실에 연결했습니다.`)} />)}</div></div>}

      {removalRows.length > 0 && <div className="border border-red-200 bg-red-50 p-4"><p className="text-sm font-medium">이번 자료에서 보이지 않는 기존 공실</p><p className="mb-3 mt-1 text-xs text-red-800">자동 삭제하지 않습니다. 계속 유지할지, 임대완료·만료·숨김 처리할지 선택해야 합니다.</p><div className="space-y-2">{removalRows.map((r) => <div key={r.id} className="flex flex-wrap items-center gap-2 border border-red-100 bg-white p-2 text-xs"><span className="mr-auto">{r.floor ?? "층 미정"}</span>{(["KEEP","LEASED","EXPIRED","HIDDEN"] as const).map((x) => <button key={x} disabled={pending} onClick={() => run(() => resolvePossibleRemoval(sourceDocumentId,r.id,x), `${r.floor ?? "공실"} 처리 상태를 저장했습니다.`)} className={`border px-2 py-1 ${r.resolution===x ? "bg-navy text-white" : "bg-white"}`}>{x === "KEEP" ? "계속 유지" : x === "LEASED" ? "임대완료" : x === "EXPIRED" ? "만료" : "숨김"}</button>)}</div>)}</div></div>}
    </div>
  );
}

function ManualRow({ b, buildings, disabled, onMatch, onCreate }: { b: StagingBuilding; buildings: BuildingOption[]; disabled: boolean; onMatch: (id:string)=>void; onCreate: ()=>void }) {
  const [id,setId] = useState("");
  return <div className="grid items-center gap-2 bg-white p-3 text-sm md:grid-cols-[1.1fr_1fr_auto_auto]"><div><b>{b.raw_building_name ?? "이름 없음"}</b><div className="mt-1 text-xs text-silver">{MATCH_LABEL[b.match_status ?? ""] ?? b.match_status ?? "미매칭"}{b.match_reason ? ` · ${b.match_reason}` : ""}</div></div><select className="border px-2 py-2" value={id} onChange={(e)=>setId(e.target.value)}><option value="">기존 건물 선택</option>{buildings.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select><button disabled={disabled || !id} onClick={()=>onMatch(id)} className="border px-3 py-2 disabled:opacity-40">기존 건물 연결</button><button disabled={disabled} onClick={()=>{if(confirm(`${b.raw_building_name ?? "이 건물"}을 신규 건물로 비공개 등록할까요?`)) onCreate();}} className="bg-navy px-3 py-2 text-white disabled:opacity-40">신규 등록</button></div>;
}

function ConflictRowControl({ row, options, disabled, onNew, onMatch }: { row: ConflictRow; options: ListingOption[]; disabled:boolean; onNew:()=>void; onMatch:(id:string)=>void }) {
  const [id,setId]=useState("");
  return <div className="grid items-center gap-2 border border-orange-100 bg-white p-2 text-xs md:grid-cols-[.5fr_1.4fr_auto_auto]"><span>{row.floor ?? "층 미정"}</span><select value={id} onChange={(e)=>setId(e.target.value)} className="border px-2 py-1.5"><option value="">기존 공실 선택</option>{options.map((o)=><option key={o.id} value={o.id}>{o.floor ?? "층 미정"}{o.unit ? ` ${o.unit}` : ""} · {o.status}</option>)}</select><button disabled={disabled || !id} onClick={()=>onMatch(id)} className="border px-2 py-1.5 disabled:opacity-40">기존 공실 업데이트</button><button disabled={disabled} onClick={onNew} className="border px-2 py-1.5 disabled:opacity-40">신규 공실</button></div>;
}
