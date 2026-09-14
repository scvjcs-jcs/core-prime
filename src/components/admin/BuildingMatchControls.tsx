"use client";

import { useState, useTransition } from "react";
import { runBuildingMatching } from "@/app/admin/(protected)/imports/actions";

export default function BuildingMatchControls({ sourceDocumentId, enabled }: { sourceDocumentId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={!enabled || pending}
        className="px-4 py-2 bg-navy text-white disabled:opacity-40"
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await runBuildingMatching(sourceDocumentId);
            setMessage(
              result.error ??
                `자동매칭 ${result.autoMatched ?? 0}개 / 확인필요 ${result.reviewRequired ?? 0}개 / 신규후보 ${result.newCandidates ?? 0}개`
            );
          })
        }
      >
        {pending ? "매칭 중..." : "기존 건물 자동매칭"}
      </button>
      {!enabled && <p className="text-xs text-silver mt-2">먼저 NAI Staging 후보를 생성해 주세요.</p>}
      {message && <p className="text-sm mt-2">{message}</p>}
    </div>
  );
}
