"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrichCbreBuildingFacts } from "@/app/admin/(protected)/imports/actions";

export default function BuildingFactsEnrichmentButton({ sourceDocumentId, parserType }: { sourceDocumentId: string; parserType: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  if (parserType !== "CBRE") return null;

  return <div className="border border-sky-200 bg-sky-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-sky-950">CBRE 건물 기본정보 보강</p>
        <p className="mt-1 text-xs leading-5 text-sky-800">연면적·규모·전용률·엘리베이터·주차·무료/유료주차·기준층 면적을 원문에서 다시 읽어 이미 등록된 건물의 빈 항목만 채웁니다. 기존 수동 입력값은 덮어쓰지 않습니다.</p>
      </div>
      <button disabled={pending} onClick={() => {
        if (!confirm("CBRE 원문에서 건물 기본정보를 다시 읽어 빈 항목만 보강할까요? 기존에 입력된 값은 유지됩니다.")) return;
        startTransition(async () => {
          setMessage("");
          const r = await enrichCbreBuildingFacts(sourceDocumentId);
          if (r.error) setMessage(`오류: ${r.error}`);
          else {
            setMessage(`완료 · 원문 건물 ${r.parsedBuildings ?? 0} · 연결 ${r.matchedBuildings ?? 0} · 건물정보 보강 ${r.updatedBuildings ?? 0} · 주차정보 ${r.parkingUpdated ?? 0} · 교통정보 ${r.transportAdded ?? 0} · 보류 ${r.skipped ?? 0}`);
            router.refresh();
          }
        });
      }} className="bg-sky-800 px-4 py-2 text-sm text-white disabled:opacity-40">{pending ? "건물정보 보강 중..." : "건물 기본정보 보강 실행"}</button>
    </div>
    {message && <p className={`mt-3 border p-3 text-xs ${message.startsWith("오류:") ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>{message}</p>}
  </div>;
}
