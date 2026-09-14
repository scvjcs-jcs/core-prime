"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Source, ParserType } from "@/lib/types";
import { PARSER_TYPE_LABEL, suggestParserType } from "@/lib/labels";
import {
  buildSourcePdfStoragePath,
  looksLikePdf,
  MAX_PDF_SIZE_BYTES,
  MAX_PDF_SIZE_LABEL,
} from "@/lib/importStorage";
import {
  checkDuplicateSourceDocument,
  createSourceDocument,
} from "@/app/admin/(protected)/imports/actions";

const PARSER_OPTIONS: ParserType[] = ["CBRE", "CW", "NAI", "GENERIC"];
const BUCKET = "source-pdfs";

export default function ImportUploadForm({ sources }: { sources: Source[] }) {
  const router = useRouter();

  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [parserType, setParserType] = useState<ParserType>(
    suggestParserType(sources[0]?.code) as ParserType
  );
  const [parserTouched, setParserTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const selectedSource = sources.find((s) => s.id === sourceId);

  function handleSourceChange(id: string) {
    setSourceId(id);
    if (!parserTouched) {
      const src = sources.find((s) => s.id === id);
      setParserType(suggestParserType(src?.code) as ParserType);
    }
    void maybeCheckDuplicate(id, reportDate, file?.name);
  }

  function handleReportDateChange(value: string) {
    setReportDate(value);
    void maybeCheckDuplicate(sourceId, value, file?.name);
  }

  async function handleFileChange(f: File | null) {
    setError(null);
    setFile(null);
    setDuplicateWarning(false);

    if (!f) return;

    const isPdfExt = f.name.toLowerCase().endsWith(".pdf");
    const isPdfMime = f.type === "application/pdf" || f.type === "";
    if (!isPdfExt || !isPdfMime) {
      setError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    const magicOk = await looksLikePdf(f);
    if (!magicOk) {
      setError("PDF 형식이 아닌 것으로 보입니다. 파일을 다시 확인해 주세요.");
      return;
    }

    if (f.size > MAX_PDF_SIZE_BYTES) {
      setError(`PDF 파일은 최대 ${MAX_PDF_SIZE_LABEL}까지 업로드할 수 있습니다.`);
      return;
    }

    setFile(f);
    void maybeCheckDuplicate(sourceId, reportDate, f.name);
  }

  async function maybeCheckDuplicate(sId: string, rDate: string, filename: string | undefined) {
    if (!sId || !rDate || !filename) {
      setDuplicateWarning(false);
      return;
    }
    const { duplicate } = await checkDuplicateSourceDocument(sId, rDate, filename);
    setDuplicateWarning(duplicate);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourceId) {
      setError("출처사를 선택해 주세요.");
      return;
    }
    if (!title.trim()) {
      setError("자료 제목을 입력해 주세요.");
      return;
    }
    if (!reportDate) {
      setError("자료 기준일을 입력해 주세요.");
      return;
    }
    if (!file) {
      setError("PDF 파일을 선택해 주세요.");
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const path = buildSourcePdfStoragePath({
        sourceCode: selectedSource?.code ?? "OTHER",
        reportDate,
        uuid: crypto.randomUUID(),
        originalFilename: file.name,
      });

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        setError(`PDF 업로드 중 오류가 발생했습니다: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      const result = await createSourceDocument({
        source_id: sourceId,
        title: title.trim(),
        original_filename: file.name,
        storage_path: path,
        report_date: reportDate,
        parser_type: parserType,
      });

      if (result.error || !result.id) {
        // createSourceDocument 내부에서 Storage 정리까지 시도한 상태입니다.
        setError(result.error || "자료 등록 중 오류가 발생했습니다.");
        setUploading(false);
        return;
      }

      router.push(`/admin/imports/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 알 수 없는 오류가 발생했습니다.");
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>
      )}
      {duplicateWarning && !error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
          비슷한 자료가 이미 등록되어 있습니다. (같은 출처사·기준일·파일명) 계속 진행해도 막히지 않지만, 중복이 아닌지 확인해 주세요.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">출처사</label>
        <select
          value={sourceId}
          onChange={(e) => handleSourceChange(e.target.value)}
          disabled={uploading}
          className="w-full border border-silver/40 px-3 py-2 text-sm"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">자료 제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={uploading}
          placeholder="예: 2026년 9월 강남권 오피스 임대 현황"
          className="w-full border border-silver/40 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">자료 기준일</label>
        <input
          type="date"
          value={reportDate}
          onChange={(e) => handleReportDateChange(e.target.value)}
          disabled={uploading}
          className="w-full border border-silver/40 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Parser Type</label>
        <select
          value={parserType}
          onChange={(e) => {
            setParserTouched(true);
            setParserType(e.target.value as ParserType);
          }}
          disabled={uploading}
          className="w-full border border-silver/40 px-3 py-2 text-sm"
        >
          {PARSER_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {PARSER_TYPE_LABEL[p]}
            </option>
          ))}
        </select>
        <p className="text-xs text-silver mt-1">
          출처사에 따라 자동으로 추천되며, 필요하면 직접 변경할 수 있습니다. 이번 단계에서는 실제 분석을 수행하지 않습니다.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">PDF 파일</label>
        <input
          type="file"
          accept="application/pdf"
          disabled={uploading}
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {file && (
          <p className="text-xs text-silver mt-1">
            {file.name} ({Math.round((file.size / 1024 / 1024) * 10) / 10}MB)
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={uploading}
        className="bg-navy text-white px-4 py-2 text-sm disabled:opacity-50"
      >
        {uploading ? "업로드 중..." : "업로드"}
      </button>
    </form>
  );
}
