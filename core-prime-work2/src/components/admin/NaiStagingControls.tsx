"use client";
import { useState, useTransition } from "react";
import { generateNaiStaging } from "@/app/admin/(protected)/imports/actions";

export default function NaiStagingControls({ sourceDocumentId, enabled }: { sourceDocumentId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return <div>
    <button disabled={!enabled || pending} className="px-4 py-2 bg-navy text-white disabled:opacity-40" onClick={() => startTransition(async () => {
      setMsg(null); const r = await generateNaiStaging(sourceDocumentId); setMsg(r.error ?? `건물 ${r.buildings ?? 0}개 / 공실 ${r.listings ?? 0}개 / 경고 ${r.warnings ?? 0}개 생성`);
    })}>{pending ? "생성 중..." : "NAI Staging 생성"}</button>
    {!enabled && <p className="text-xs text-silver mt-2">NAI 문서의 실제 PDF Text Extraction Run이 COMPLETED 상태일 때 사용할 수 있습니다.</p>}
    {msg && <p className="text-sm mt-2">{msg}</p>}
  </div>;
}
