"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Source, ParserType } from "@/lib/types";
import { PARSER_TYPE_LABEL, suggestParserType } from "@/lib/labels";
import { buildSourcePdfStoragePath, looksLikePdf, MAX_PDF_SIZE_BYTES, MAX_PDF_SIZE_LABEL } from "@/lib/importStorage";
import { checkDuplicateSourceDocument, createSourceDocument } from "@/app/admin/(protected)/imports/actions";

const PARSER_OPTIONS: ParserType[] = ["CBRE", "CW", "NAI", "GENERIC"];
const BUCKET = "source-pdfs";

export default function ImportUploadForm({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [parserType, setParserType] = useState<ParserType>(suggestParserType(sources[0]?.code) as ParserType);
  const [parserTouched, setParserTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const selectedSource = sources.find((s) => s.id === sourceId);

  const ready = Boolean(sourceId && title.trim() && reportDate && file && !error);
  const fileSize = useMemo(() => file ? `${Math.round((file.size / 1024 / 1024) * 10) / 10}MB` : "-", [file]);

  function handleSourceChange(id: string) {
    setSourceId(id);
    if (!parserTouched) {
      const src = sources.find((s) => s.id === id);
      setParserType(suggestParserType(src?.code) as ParserType);
    }
    void maybeCheckDuplicate(id, reportDate, file?.name);
  }
  function handleReportDateChange(value: string) { setReportDate(value); void maybeCheckDuplicate(sourceId, value, file?.name); }
  async function handleFileChange(f: File | null) {
    setError(null); setFile(null); setDuplicateWarning(false);
    if (!f) return;
    const isPdfExt = f.name.toLowerCase().endsWith(".pdf");
    const isPdfMime = f.type === "application/pdf" || f.type === "";
    if (!isPdfExt || !isPdfMime) return setError("PDF 파일만 업로드할 수 있습니다.");
    if (!(await looksLikePdf(f))) return setError("PDF 형식이 아닌 것으로 보입니다. 파일을 다시 확인해 주세요.");
    if (f.size > MAX_PDF_SIZE_BYTES) return setError(`PDF 파일은 최대 ${MAX_PDF_SIZE_LABEL}까지 업로드할 수 있습니다.`);
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
    void maybeCheckDuplicate(sourceId, reportDate, f.name);
  }
  async function maybeCheckDuplicate(sId: string, rDate: string, filename: string | undefined) {
    if (!sId || !rDate || !filename) return setDuplicateWarning(false);
    const { duplicate } = await checkDuplicateSourceDocument(sId, rDate, filename);
    setDuplicateWarning(duplicate);
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!sourceId) return setError("출처사를 선택해 주세요.");
    if (!title.trim()) return setError("자료 제목을 입력해 주세요.");
    if (!reportDate) return setError("자료 기준일을 입력해 주세요.");
    if (!file) return setError("PDF 파일을 선택해 주세요.");
    setUploading(true);
    try {
      const supabase = createClient();
      const path = buildSourcePdfStoragePath({ sourceCode: selectedSource?.code ?? "OTHER", reportDate, uuid: crypto.randomUUID(), originalFilename: file.name });
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) { setError(`PDF 업로드 중 오류가 발생했습니다: ${uploadError.message}`); setUploading(false); return; }
      const result = await createSourceDocument({ source_id: sourceId, title: title.trim(), original_filename: file.name, storage_path: path, report_date: reportDate, parser_type: parserType });
      if (result.error || !result.id) { setError(result.error || "자료 등록 중 오류가 발생했습니다."); setUploading(false); return; }
      router.push(`/admin/imports/${result.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "업로드 중 알 수 없는 오류가 발생했습니다."); setUploading(false); }
  }

  return <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="space-y-4">
      {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {duplicateWarning && !error && <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"><b>중복 가능성:</b> 같은 출처사·기준일·파일명 자료가 이미 있습니다. 신규 자료가 맞는지 확인해 주세요.</p>}

      <section className="border border-silver/25 bg-white p-5">
        <div className="mb-4 flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs text-white">1</span><div><h2 className="font-medium">자료 기본정보</h2><p className="text-xs text-silver">출처사와 기준일만 정확히 지정하면 Parser는 자동 추천됩니다.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block font-medium">출처사</span><select value={sourceId} onChange={(e)=>handleSourceChange(e.target.value)} disabled={uploading} className="w-full border border-silver/40 px-3 py-2.5">{sources.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">자료 기준일</span><input type="date" value={reportDate} onChange={(e)=>handleReportDateChange(e.target.value)} disabled={uploading} className="w-full border border-silver/40 px-3 py-2.5"/></label>
        </div>
        <label className="mt-4 block text-sm"><span className="mb-1 block font-medium">자료 제목</span><input value={title} onChange={(e)=>setTitle(e.target.value)} disabled={uploading} placeholder="예: CBRE 2026년 9월 임대현황" className="w-full border border-silver/40 px-3 py-2.5"/></label>
        <details className="mt-4 border-t border-silver/20 pt-3"><summary className="cursor-pointer text-xs font-medium text-silver">고급 설정 · Parser 직접 선택</summary><label className="mt-3 block text-sm"><span className="mb-1 block font-medium">Parser</span><select value={parserType} onChange={(e)=>{setParserTouched(true);setParserType(e.target.value as ParserType)}} disabled={uploading} className="w-full border border-silver/40 px-3 py-2.5">{PARSER_OPTIONS.map((p)=><option key={p} value={p}>{PARSER_TYPE_LABEL[p]}</option>)}</select></label></details>
      </section>

      <section className="border border-silver/25 bg-white p-5">
        <div className="mb-4 flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs text-white">2</span><div><h2 className="font-medium">PDF 파일 선택</h2><p className="text-xs text-silver">업로드 후에는 원문 추출 → 구조화 → 검수 순서로 진행합니다.</p></div></div>
        <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center border border-dashed border-silver/50 bg-fog/50 px-4 py-6 text-center hover:border-navy">
          <input type="file" accept="application/pdf" disabled={uploading} onChange={(e)=>handleFileChange(e.target.files?.[0]??null)} className="sr-only"/>
          <span className="text-sm font-medium">PDF 파일 선택</span><span className="mt-1 text-xs text-silver">{file ? `${file.name} · ${fileSize}` : `최대 ${MAX_PDF_SIZE_LABEL}`}</span>
        </label>
      </section>

      <button type="submit" disabled={uploading || !ready} className="w-full bg-navy px-5 py-3 text-sm font-medium text-white disabled:opacity-40">{uploading ? "업로드 중..." : "PDF 등록하고 검수 시작"}</button>
    </div>

    <aside className="h-fit border border-navy/20 bg-navy/[.035] p-5 xl:sticky xl:top-4">
      <p className="text-xs uppercase tracking-[.15em] text-silver">등록 전 확인</p><h3 className="mt-2 font-medium">이 자료는 이렇게 처리됩니다</h3>
      <ol className="mt-4 space-y-3 text-xs leading-5"><li><b>1. 원문 추출</b><br/><span className="text-silver">PDF 페이지 텍스트를 안전하게 저장</span></li><li><b>2. 자동 구조화</b><br/><span className="text-silver">건물·공실 후보 생성</span></li><li><b>3. 중복·변경 검수</b><br/><span className="text-silver">기존 DB와 비교 후 사람이 확인</span></li><li><b>4. 승인 반영</b><br/><span className="text-silver">승인 전에는 고객 DB를 변경하지 않음</span></li></ol>
      <div className="mt-5 border-t border-navy/10 pt-4 text-xs"><div className="flex justify-between py-1"><span className="text-silver">출처</span><b>{selectedSource?.name ?? "-"}</b></div><div className="flex justify-between py-1"><span className="text-silver">Parser</span><b>{PARSER_TYPE_LABEL[parserType] ?? parserType}</b></div><div className="flex justify-between py-1"><span className="text-silver">파일</span><b className="max-w-[160px] truncate">{file?.name ?? "미선택"}</b></div></div>
    </aside>
  </form>;
}
