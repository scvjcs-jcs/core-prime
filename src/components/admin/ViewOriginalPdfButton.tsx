"use client";

import { useState } from "react";
import { getSignedPdfUrl } from "@/app/admin/(protected)/imports/actions";

export default function ViewOriginalPdfButton({ sourceDocumentId }: { sourceDocumentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await getSignedPdfUrl(sourceDocumentId);
    setLoading(false);

    if (result.error || !result.url) {
      setError(result.error || "파일을 열 수 없습니다.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors disabled:opacity-50"
      >
        {loading ? "불러오는 중..." : "원본 PDF 보기"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <p className="text-xs text-silver mt-2">
        PDF는 비공개로 보관되며, 버튼을 누를 때마다 2분간만 유효한 열람 링크가 새로 발급됩니다.
      </p>
    </div>
  );
}
