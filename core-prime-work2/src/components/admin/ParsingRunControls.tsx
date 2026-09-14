"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  processNextDummyBatch,
  retryFailedDummyPages,
  startDummyParsingRun,
} from "@/app/admin/(protected)/imports/actions";
import type { ParsingRunStatus } from "@/lib/types";

type Props = {
  sourceDocumentId: string;
  latestRunId: string | null;
  latestRunStatus: ParsingRunStatus | null;
  failedPageCount: number;
};

export default function ParsingRunControls({
  sourceDocumentId,
  latestRunId,
  latestRunStatus,
  failedPageCount,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = latestRunStatus === "QUEUED" || latestRunStatus === "PROCESSING";
  // STEP 6A 정책 보강: COMPLETED_WITH_WARNINGS 상태에서는 새 Run을 시작할 수 없습니다.
  // (이전 Run의 실패 페이지를 먼저 재시도로 해결해야 합니다. DB RPC에서도 동일하게 막습니다.)
  const blockedByWarnings = latestRunStatus === "COMPLETED_WITH_WARNINGS";
  const canStartNew = !latestRunId || (!active && !blockedByWarnings);

  function runAction(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">
          {error}
        </p>
      )}

      {blockedByWarnings && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
          이전 분석에 처리되지 않은 실패 페이지가 있습니다. 새 Run을 시작하기 전에 먼저 아래 재시도를 완료해주세요.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {canStartNew && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => startDummyParsingRun(sourceDocumentId))}
            className="bg-navy text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            {isPending ? "처리 중..." : latestRunId ? "새 테스트 Run 시작" : "테스트 분석 시작"}
          </button>
        )}

        {latestRunId && active && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => processNextDummyBatch(latestRunId))}
            className="border border-navy text-navy px-4 py-2 text-sm disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "다음 테스트 배치 처리"}
          </button>
        )}

        {latestRunId && failedPageCount > 0 && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => retryFailedDummyPages(latestRunId))}
            className="border border-amber-500 text-amber-700 px-4 py-2 text-sm disabled:opacity-50"
          >
            {isPending ? "재시도 중..." : `실패 페이지 재시도 (${failedPageCount})`}
          </button>
        )}
      </div>

      <p className="text-xs text-silver">
        테스트용 Dummy Processor입니다. 실제 PDF 파일의 내용은 읽거나 분석하지 않습니다.
      </p>
    </div>
  );
}
