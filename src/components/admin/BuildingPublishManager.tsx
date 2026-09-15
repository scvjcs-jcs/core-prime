"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import DeleteBuildingButton from "@/components/admin/DeleteBuildingButton";
import {
  bulkGeneratePrimeScoreRecommendations,
  bulkPublishReadyBuildings,
  bulkSetBuildingPublished,
} from "@/app/admin/(protected)/buildings/actions";

type Row = {
  id: string;
  name: string;
  status: string;
  is_published: boolean;
  completion_year: number | null;
  created_at: string | null;
  deleted_at: string | null;
  district_name: string;
  readiness_score: number;
  ready_to_publish: boolean;
  blockers: string[];
  warnings: string[];
  freshness: "fresh" | "aging" | "stale" | "unknown";
  freshness_label: string;
  has_score_recommendation: boolean;
  score_status: string | null;
  active_listing_count: number;
};

type AutomationFilter = "all" | "ready" | "not_ready" | "stale" | "score_pending";

export default function BuildingPublishManager({ buildings }: { buildings: Row[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"all" | "published" | "private">("all");
  const [automationFilter, setAutomationFilter] = useState<AutomationFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const summary = useMemo(() => ({
    ready: buildings.filter((b) => !b.deleted_at && b.ready_to_publish).length,
    notReady: buildings.filter((b) => !b.deleted_at && !b.ready_to_publish).length,
    stale: buildings.filter((b) => !b.deleted_at && ["stale", "unknown"].includes(b.freshness)).length,
    scorePending: buildings.filter((b) => !b.deleted_at && !b.has_score_recommendation && b.score_status !== "PUBLISHED").length,
  }), [buildings]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return buildings.filter((b) => {
      if (visibility === "published" && !b.is_published) return false;
      if (visibility === "private" && b.is_published) return false;
      if (automationFilter === "ready" && !b.ready_to_publish) return false;
      if (automationFilter === "not_ready" && b.ready_to_publish) return false;
      if (automationFilter === "stale" && !["stale", "unknown"].includes(b.freshness)) return false;
      if (automationFilter === "score_pending" && (b.has_score_recommendation || b.score_status === "PUBLISHED")) return false;
      if (q && !`${b.name} ${b.district_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [buildings, visibility, automationFilter, keyword]);

  const filteredIds = filtered.filter((b) => !b.deleted_at).map((b) => b.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));
  const selectedRows = buildings.filter((b) => selected.includes(b.id));
  const selectedPublished = selectedRows.filter((b) => b.is_published).length;
  const selectedPrivate = selectedRows.filter((b) => !b.is_published).length;

  const toggleAllFiltered = () => {
    if (allFilteredSelected) setSelected((prev) => prev.filter((id) => !filteredIds.includes(id)));
    else setSelected((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  const selectReady = () => {
    const readyIds = filtered.filter((b) => b.ready_to_publish && !b.deleted_at).map((b) => b.id);
    setSelected(readyIds);
    setMessage(`공개 준비 완료 ${readyIds.length}개를 선택했습니다.`);
  };

  const changeVisibility = (publish: boolean) => {
    if (selected.length === 0) return setMessage("먼저 변경할 건물을 선택해 주세요.");
    const verb = publish ? "공개" : "비공개";
    if (!confirm(publish
      ? `선택한 ${selected.length}개 건물을 고객 사이트에 공개할까요?\n공개 준비도와 무관하게 선택 항목을 그대로 공개합니다.`
      : `선택한 ${selected.length}개 건물을 비공개로 전환할까요?\n관리자 DB에는 그대로 유지됩니다.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await bulkSetBuildingPublished(selected, publish);
      if (result.error) return setMessage(`오류: ${result.error}`);
      setMessage(`${result.updated ?? 0}개 건물을 ${verb} 상태로 변경했습니다.`);
      setSelected([]);
      window.location.reload();
    });
  };

  const publishReady = () => {
    if (selected.length === 0) return setMessage("먼저 건물을 선택해 주세요.");
    if (!confirm(`선택한 ${selected.length}개 중 서버 기준 공개 준비가 완료된 건물만 공개할까요?\n정보가 부족한 건물은 자동 제외됩니다.`)) return;
    setMessage(null);
    startTransition(async () => {
      const r = await bulkPublishReadyBuildings(selected);
      if (r.error) return setMessage(`오류: ${r.error}`);
      const blocked = r.blocked ? ` · 제외 ${r.blocked}개${r.blockedNames?.length ? ` (${r.blockedNames.slice(0, 4).join(", ")}${r.blockedNames.length > 4 ? " 외" : ""})` : ""}` : "";
      setMessage(`공개 준비 완료 ${r.published ?? 0}개 공개${blocked}`);
      setSelected([]);
      window.location.reload();
    });
  };

  const generateScores = () => {
    if (selected.length === 0) return setMessage("Prime Score 추천을 생성할 건물을 선택해 주세요.");
    if (selected.length > 50) return setMessage("Prime Score 추천은 한 번에 최대 50개씩 생성해 주세요.");
    if (!confirm(`선택한 ${selected.length}개 건물의 Prime Score 추천값을 생성할까요?\n공식 공개 점수는 변경하지 않습니다.`)) return;
    setMessage(null);
    startTransition(async () => {
      const r = await bulkGeneratePrimeScoreRecommendations(selected);
      if (r.error) return setMessage(`오류: ${r.error}`);
      setMessage(`Prime Score 추천 생성 ${r.generated ?? 0}개${r.failed ? ` · 실패 ${r.failed}개` : ""}`);
      window.location.reload();
    });
  };

  return (
    <>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <button type="button" onClick={() => setAutomationFilter("ready")} className="border border-green-200 bg-green-50 p-4 text-left hover:border-green-500"><p className="text-xs text-green-800">공개 준비 완료</p><p className="mt-1 font-display text-2xl text-green-950">{summary.ready}</p><p className="mt-1 text-[11px] text-green-700">필수정보 + 현재 공실 확인</p></button>
        <button type="button" onClick={() => setAutomationFilter("not_ready")} className="border border-amber-200 bg-amber-50 p-4 text-left hover:border-amber-500"><p className="text-xs text-amber-800">보완 필요</p><p className="mt-1 font-display text-2xl text-amber-950">{summary.notReady}</p><p className="mt-1 text-[11px] text-amber-700">주소·규모·주차·공실 자동 점검</p></button>
        <button type="button" onClick={() => setAutomationFilter("stale")} className="border border-red-200 bg-red-50 p-4 text-left hover:border-red-500"><p className="text-xs text-red-800">재검수 필요</p><p className="mt-1 font-display text-2xl text-red-950">{summary.stale}</p><p className="mt-1 text-[11px] text-red-700">120일 초과 또는 확인일 없음</p></button>
        <button type="button" onClick={() => setAutomationFilter("score_pending")} className="border border-sky-200 bg-sky-50 p-4 text-left hover:border-sky-500"><p className="text-xs text-sky-800">Prime Score 추천 대기</p><p className="mt-1 font-display text-2xl text-sky-950">{summary.scorePending}</p><p className="mt-1 text-[11px] text-sky-700">추천값 미생성 건물</p></button>
      </div>

      <div className="mb-4 border border-silver/30 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="font-medium text-charcoal">건물 자동화 센터</div>
            <p className="mt-1 text-xs text-silver">공개 준비도 자동점검 → 준비완료 선택 → Prime Score 추천 → 안전 공개까지 한 화면에서 처리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={selectReady} disabled={pending} className="border border-green-600 bg-green-50 px-3 py-2 text-xs text-green-800 disabled:opacity-40">공개 준비완료 자동선택</button>
            <button type="button" onClick={generateScores} disabled={pending || selected.length === 0} className="border border-sky-600 bg-sky-50 px-3 py-2 text-xs text-sky-800 disabled:opacity-40">선택 Prime Score 추천</button>
            <button type="button" onClick={publishReady} disabled={pending || selected.length === 0} className="bg-green-700 px-4 py-2 text-xs text-white disabled:opacity-40">준비완료만 안전 공개</button>
            <button type="button" onClick={() => changeVisibility(false)} disabled={pending || selected.length === 0} className="border border-silver/50 bg-white px-3 py-2 text-xs disabled:opacity-40">선택 비공개</button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_repeat(4,auto)]">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="건물명 또는 지역 검색" className="border border-silver/40 px-3 py-2 text-sm outline-none focus:border-navy" />
          <button type="button" onClick={() => { setVisibility("all"); setAutomationFilter("all"); }} className={`px-3 py-2 text-xs border ${visibility === "all" && automationFilter === "all" ? "bg-navy text-white border-navy" : "border-silver/40"}`}>전체</button>
          <button type="button" onClick={() => setVisibility("private")} className={`px-3 py-2 text-xs border ${visibility === "private" ? "bg-navy text-white border-navy" : "border-silver/40"}`}>비공개만</button>
          <button type="button" onClick={() => setVisibility("published")} className={`px-3 py-2 text-xs border ${visibility === "published" ? "bg-navy text-white border-navy" : "border-silver/40"}`}>공개만</button>
          <button type="button" onClick={() => changeVisibility(true)} disabled={pending || selected.length === 0} className="border border-navy px-3 py-2 text-xs text-navy disabled:opacity-40">선택 강제 공개</button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-silver">
          <button type="button" onClick={toggleAllFiltered} className="underline underline-offset-2 text-navy">{allFilteredSelected ? "현재 목록 선택 해제" : `현재 목록 ${filteredIds.length}개 전체 선택`}</button>
          <span>선택 {selected.length}개</span><span>공개 {selectedPublished}개</span><span>비공개 {selectedPrivate}개</span>
          {automationFilter !== "all" && <button type="button" onClick={() => setAutomationFilter("all")} className="text-navy underline">자동화 필터 해제</button>}
          {pending && <span className="text-navy">처리 중...</span>}
        </div>
        {message && <p className={`mt-3 text-sm ${message.startsWith("오류") ? "text-red-600" : "text-green-700"}`}>{message}</p>}
      </div>

      <div className="bg-white border border-silver/30 overflow-x-auto">
        <table className="w-full text-sm min-w-[1180px]">
          <thead><tr className="text-left text-silver border-b border-silver/30">
            <th className="px-3 py-3 font-normal w-10"><input type="checkbox" aria-label="현재 목록 전체 선택" checked={allFilteredSelected} onChange={toggleAllFiltered} /></th>
            <th className="px-3 py-3 font-normal">건물명</th><th className="px-3 py-3 font-normal">지역</th><th className="px-3 py-3 font-normal">준공</th>
            <th className="px-3 py-3 font-normal">공개 준비도</th><th className="px-3 py-3 font-normal">데이터 최신성</th><th className="px-3 py-3 font-normal">Prime Score</th><th className="px-3 py-3 font-normal">공실</th><th className="px-3 py-3 font-normal">공개</th><th className="px-3 py-3 font-normal text-right">관리</th>
          </tr></thead>
          <tbody>{filtered.map((b) => (
            <tr key={b.id} className="border-b border-silver/20 last:border-0 align-top">
              <td className="px-3 py-3"><input type="checkbox" disabled={!!b.deleted_at} checked={selected.includes(b.id)} onChange={(e) => setSelected((prev) => e.target.checked ? Array.from(new Set([...prev, b.id])) : prev.filter((id) => id !== b.id))} /></td>
              <td className="px-3 py-3"><Link href={`/admin/buildings/${b.id}`} className="font-medium hover:underline">{b.name}</Link>{b.blockers.length > 0 && <p className="mt-1 max-w-[260px] text-[11px] text-amber-700">{b.blockers.join(" · ")}</p>}</td>
              <td className="px-3 py-3 text-silver">{b.district_name || "-"}</td><td className="px-3 py-3 text-silver">{b.completion_year ?? "-"}</td>
              <td className="px-3 py-3"><span className={`inline-block border px-2 py-0.5 text-xs ${b.ready_to_publish ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{b.readiness_score}점 · {b.ready_to_publish ? "준비완료" : "보완필요"}</span>{b.warnings.length > 0 && <p className="mt-1 max-w-[230px] text-[10px] text-silver">{b.warnings.slice(0, 2).join(" · ")}{b.warnings.length > 2 ? " 외" : ""}</p>}</td>
              <td className="px-3 py-3"><span className={`text-xs ${b.freshness === "fresh" ? "text-green-700" : b.freshness === "aging" ? "text-amber-700" : "text-red-700"}`}>{b.freshness_label}</span></td>
              <td className="px-3 py-3 text-xs">{b.score_status === "PUBLISHED" ? <span className="text-green-700">공개점수</span> : b.has_score_recommendation ? <span className="text-sky-700">추천 생성됨</span> : <span className="text-silver">추천 대기</span>}</td>
              <td className="px-3 py-3 text-silver">{b.active_listing_count}건</td>
              <td className="px-3 py-3"><span className={b.is_published ? "text-green-700 bg-green-50 px-2 py-0.5 text-xs border border-green-200" : "text-silver bg-fog px-2 py-0.5 text-xs border border-silver/30"}>{b.is_published ? "공개" : "비공개"}</span></td>
              <td className="px-3 py-3 text-right space-x-3"><Link href={`/admin/buildings/${b.id}`} className="text-navy hover:underline">수정</Link><DeleteBuildingButton id={b.id} name={b.name} deletedAt={b.deleted_at} /></td>
            </tr>
          ))}{filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-silver">조건에 맞는 건물이 없습니다.</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}
