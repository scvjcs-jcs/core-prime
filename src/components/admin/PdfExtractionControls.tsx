"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { processNextPdfBatch, retryFailedPdfPages, startPdfTextExtractionRun } from "@/app/admin/(protected)/imports/actions";
import type { ParsingRunStatus } from "@/lib/types";

type Props = { sourceDocumentId:string; latestRunId:string|null; latestRunStatus:ParsingRunStatus|null; failedPageCount:number };

export default function PdfExtractionControls({ sourceDocumentId, latestRunId, latestRunStatus, failedPageCount }: Props) {
  const router=useRouter();
  const [isPending,startTransition]=useTransition();
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const active=latestRunStatus === "QUEUED" || latestRunStatus === "PROCESSING";
  const blockedByWarnings=latestRunStatus === "COMPLETED_WITH_WARNINGS";
  const canStartNew=!latestRunId || (!active && !blockedByWarnings);

  function runAction(action:()=>Promise<{error?:string}>, ok?:string) {
    setError(null); setMessage(null);
    startTransition(async()=>{ const result=await action(); if(result.error){setError(result.error);return;} if(ok)setMessage(ok); router.refresh(); });
  }

  function runBurst() {
    if(!latestRunId) return;
    setError(null); setMessage(null);
    startTransition(async()=>{
      for(let i=0;i<5;i+=1){ const result=await processNextPdfBatch(latestRunId); if(result.error){setError(result.error);router.refresh();return;} }
      setMessage("최대 50페이지 처리를 요청했습니다. 완료된 수치는 새로고침된 진행률에서 확인하세요.");
      router.refresh();
    });
  }

  return <div className="space-y-3">
    {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
    {blockedByWarnings && <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">처리되지 않은 실패 페이지가 있습니다. 새 추출을 시작하기 전에 실패 페이지를 먼저 재시도해 주세요.</p>}
    <div className="flex flex-wrap gap-2">
      {canStartNew && <button type="button" disabled={isPending} onClick={()=>runAction(()=>startPdfTextExtractionRun(sourceDocumentId),"PDF 원문 추출 작업을 시작했습니다.")} className="bg-navy px-4 py-2 text-sm text-white disabled:opacity-50">{isPending?"처리 중...":latestRunId?"원문 추출 다시 시작":"원문 추출 시작"}</button>}
      {latestRunId && active && <><button type="button" disabled={isPending} onClick={()=>runAction(()=>processNextPdfBatch(latestRunId),"다음 페이지 처리가 완료되었습니다.")} className="border border-navy px-4 py-2 text-sm text-navy disabled:opacity-50">{isPending?"처리 중...":"다음 10페이지 처리"}</button><button type="button" disabled={isPending} onClick={runBurst} className="border border-navy bg-navy/5 px-4 py-2 text-sm text-navy disabled:opacity-50">{isPending?"연속 처리 중...":"최대 50페이지 연속 처리"}</button></>}
      {latestRunId && failedPageCount>0 && <button type="button" disabled={isPending} onClick={()=>runAction(()=>retryFailedPdfPages(latestRunId),"실패 페이지 재처리를 요청했습니다.")} className="border border-amber-500 px-4 py-2 text-sm text-amber-700 disabled:opacity-50">{isPending?"재시도 중...":`실패 페이지 재시도 (${failedPageCount})`}</button>}
    </div>
    <p className="text-xs leading-5 text-silver kr-text">대용량 PDF는 한 번에 서버 제한을 넘지 않도록 나누어 처리합니다. ‘최대 50페이지 연속 처리’를 반복하면 클릭 횟수를 줄일 수 있습니다. 중간에 멈춘 처리도 다음 실행 시 자동으로 복구합니다.</p>
  </div>;
}
