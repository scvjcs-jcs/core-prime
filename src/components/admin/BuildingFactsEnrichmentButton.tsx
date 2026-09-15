"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrichCbreBuildingFacts } from "@/app/admin/(protected)/imports/actions";

type Totals = {
  matched: number;
  updated: number;
  parking: number;
  transport: number;
  skipped: number;
};

export default function BuildingFactsEnrichmentButton({ sourceDocumentId, parserType }: { sourceDocumentId: string; parserType: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  if (parserType !== "CBRE") return null;

  return <div className="border border-sky-200 bg-sky-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-sky-950">CBRE 건물 기본정보 보강</p>
        <p className="mt-1 text-xs leading-5 text-sky-800">연면적·규모·전용률·엘리베이터·주차·무료/유료주차·기준층 면적을 원문에서 다시 읽어 이미 등록된 건물의 빈 항목만 채웁니다. 기존 수동 입력값은 덮어쓰지 않습니다.</p>
        <p className="mt-1 text-[11px] text-sky-700">대용량 자료는 12개 건물씩 안전하게 나눠 처리합니다. 중간 오류가 나도 이미 반영된 값은 유지되며 다시 실행해도 빈 값만 채웁니다.</p>
      </div>
      <button disabled={pending} onClick={() => {
        if (!confirm("CBRE 원문에서 건물 기본정보를 다시 읽어 빈 항목만 보강할까요? 기존에 입력된 값은 유지됩니다.")) return;
        startTransition(async () => {
          setMessage("");
          setProgress({ done: 0, total: 0 });
          let offset = 0;
          const totals: Totals = { matched: 0, updated: 0, parking: 0, transport: 0, skipped: 0 };
          try {
            // Keep each server action below serverless execution limits. The server caps limit <= 20.
            for (let guard = 0; guard < 100; guard += 1) {
              const r = await enrichCbreBuildingFacts(sourceDocumentId, offset, 12);
              if (r.error) {
                setMessage(`오류: ${r.error}`);
                return;
              }
              totals.matched += r.matchedBuildings ?? 0;
              totals.updated += r.updatedBuildings ?? 0;
              totals.parking += r.parkingUpdated ?? 0;
              totals.transport += r.transportAdded ?? 0;
              totals.skipped += r.skipped ?? 0;

              const next = r.nextOffset ?? r.processedTo ?? offset;
              const total = r.totalBuildings ?? r.parsedBuildings ?? 0;
              setProgress({ done: next, total });
              if (r.done || next >= total) {
                setMessage(`완료 · 원문 건물 ${total} · 연결 ${totals.matched} · 건물정보 보강 ${totals.updated} · 주차정보 ${totals.parking} · 교통정보 ${totals.transport} · 보류 ${totals.skipped}`);
                router.refresh();
                return;
              }
              if (next <= offset) {
                setMessage("오류: 처리 위치가 진행되지 않았습니다. 새로고침 후 다시 실행해 주세요.");
                return;
              }
              offset = next;
            }
            setMessage("오류: 안전 반복 횟수를 초과했습니다. 새로고침 후 다시 실행해 주세요.");
          } catch (error) {
            const detail = error instanceof Error ? error.message : "알 수 없는 네트워크/서버 오류";
            setMessage(`오류: 건물정보 보강 중 연결이 중단되었습니다. 이미 반영된 값은 유지됩니다. 새로고침 후 다시 실행해 주세요. (${detail})`);
          }
        });
      }} className="bg-sky-800 px-4 py-2 text-sm text-white disabled:opacity-40">{pending ? "건물정보 보강 중..." : "건물 기본정보 보강 실행"}</button>
    </div>
    {pending && progress && <div className="mt-3">
      <div className="mb-1 flex justify-between text-[11px] text-sky-800"><span>안전 분할 처리</span><span>{progress.done}/{progress.total || "..."}</span></div>
      <div className="h-1.5 overflow-hidden bg-sky-100"><div className="h-full bg-sky-700 transition-all" style={{ width: progress.total ? `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` : "2%" }} /></div>
    </div>}
    {message && <p className={`mt-3 border p-3 text-xs ${message.startsWith("오류:") ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>{message}</p>}
  </div>;
}
