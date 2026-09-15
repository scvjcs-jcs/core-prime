"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParserType } from "@/lib/types";
import { getPdfPageCount, extractPdfPagesText, type PageExtractionResult } from "@/lib/pdfExtract";
import { parseNAIPages, NAI_PARSER_VERSION } from "@/lib/parsers/nai/NAIParser";
import { parseCBREPages, CBRE_PARSER_VERSION } from "@/lib/parsers/cbre/CBREParser";
import { parseCWPages, CW_PARSER_VERSION } from "@/lib/parsers/cw/CWParser";
import { matchBuilding, type AliasForMatch, type ExistingBuildingForMatch } from "@/lib/matching/buildingMatcher";

const BUCKET = "source-pdfs";
const PDF_BATCH_SIZE = 10;

// 관리자 본인 여부를 서버에서 직접 재확인합니다.
// 클라이언트가 보낸 uploaded_by 값을 절대 신뢰하지 않고, 매번 현재 로그인 사용자를 기준으로 확인합니다.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, admin: null as null, error: "로그인이 필요합니다." };
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("id, name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!admin || !admin.is_active) {
    return { supabase, admin: null as null, error: "관리자 권한이 없는 계정입니다." };
  }

  return { supabase, admin, error: null as null };
}

export type CreateSourceDocumentPayload = {
  source_id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  report_date: string; // YYYY-MM-DD
  parser_type: ParserType | null;
};

/**
 * 같은 출처사 + 기준일 + 원본파일명 조합이 이미 등록되어 있는지 확인합니다.
 * 강제로 막지는 않고, 화면에서 경고 문구를 보여주기 위한 참고용입니다.
 */
export async function checkDuplicateSourceDocument(
  sourceId: string,
  reportDate: string,
  originalFilename: string
): Promise<{ duplicate: boolean }> {
  if (!sourceId || !reportDate || !originalFilename) return { duplicate: false };

  const { supabase, admin } = await requireAdmin();
  if (!admin) return { duplicate: false };

  const { count } = await supabase
    .from("source_documents")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId)
    .eq("report_date", reportDate)
    .eq("original_filename", originalFilename);

  return { duplicate: (count ?? 0) > 0 };
}

/**
 * PDF는 이미 Storage(source-pdfs)에 업로드된 상태에서 호출됩니다.
 * 이 액션은 메타데이터(source_documents) 생성 + 감사로그 기록만 담당합니다.
 * DB insert가 실패하면, 방금 올라간 Storage 파일을 정리(삭제)까지 시도합니다.
 */
export async function createSourceDocument(
  payload: CreateSourceDocumentPayload
): Promise<{ error?: string; id?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) {
    return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  }

  if (!payload.source_id || !payload.title || !payload.original_filename || !payload.storage_path || !payload.report_date) {
    return { error: "필수 입력값이 누락되었습니다." };
  }

  const { data, error } = await supabase
    .from("source_documents")
    .insert({
      source_id: payload.source_id,
      title: payload.title,
      original_filename: payload.original_filename,
      storage_path: payload.storage_path,
      report_date: payload.report_date,
      parser_type: payload.parser_type,
      uploaded_by: admin.id,
      // status는 DB 기본값(UPLOADED)을 그대로 사용합니다.
    })
    .select("id")
    .single();

  if (error || !data) {
    // DB insert 실패 — 방금 올라간 Storage 원본 파일을 정리합니다 (고아 파일 방지).
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([payload.storage_path]);
    if (removeError) {
      // 정리 자체도 실패한 경우: 작업은 실패로 처리하고, storage_path를 로그에 남겨
      // 나중에 관리자가 Storage에서 직접 찾아 정리할 수 있게 합니다.
      // (이번 STEP에서는 별도의 오류 로그 테이블을 새로 만들지 않습니다.)
      console.error(
        "[imports] source_documents insert 실패 + Storage cleanup도 실패 — 고아 파일 가능성. storage_path:",
        payload.storage_path,
        "insert error:",
        error?.message,
        "remove error:",
        removeError.message
      );
    }
    return { error: error?.message || "자료 등록 중 오류가 발생했습니다." };
  }

  // 감사 로그 기록 (민감정보 제외, 최소 메타데이터만)
  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_type: "ADMIN",
    actor_id: admin.id,
    entity_type: "source_document",
    entity_id: data.id,
    action: "CREATE",
    after_data: {
      source_id: payload.source_id,
      title: payload.title,
      report_date: payload.report_date,
      parser_type: payload.parser_type,
      storage_path: payload.storage_path,
    },
  });
  if (auditError) {
    // 감사 로그 실패는 등록 자체를 되돌리지 않습니다 (best-effort).
    console.error("[imports] audit_logs 기록 실패:", auditError.message);
  }

  revalidatePath("/admin/imports");
  return { id: data.id };
}

/**
 * source-pdfs는 private 버킷입니다. 공개 URL을 절대 만들지 않고,
 * "보기" 버튼을 누른 시점에만 짧은 유효시간의 signed URL을 발급합니다.
 * signed URL은 DB에 저장하지 않습니다.
 */
export async function getSignedPdfUrl(sourceDocumentId: string): Promise<{ error?: string; url?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) {
    return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  }

  const { data: doc, error: docError } = await supabase
    .from("source_documents")
    .select("storage_path")
    .eq("id", sourceDocumentId)
    .maybeSingle();

  if (docError || !doc?.storage_path) {
    return { error: "원본 파일 경로를 찾을 수 없습니다." };
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 120); // 2분

  if (error || !data?.signedUrl) {
    return { error: error?.message || "파일 열람 URL 발급 중 오류가 발생했습니다." };
  }

  return { url: data.signedUrl };
}

// ===== STEP 6A: Dummy Parsing State Machine =====
// 실제 PDF를 읽지 않습니다. DB 상태 전이와 동시성/재시도 흐름만 검증합니다.

function normalizeRpcError(message: string | undefined): string {
  if (!message) return "처리 중 오류가 발생했습니다.";
  if (message.includes("already") || message.includes("진행 중인 분석")) {
    return "이미 진행 중인 분석이 있습니다.";
  }
  return message;
}

export async function startDummyParsingRun(
  sourceDocumentId: string
): Promise<{ error?: string; runId?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  if (!sourceDocumentId) return { error: "자료 ID가 없습니다." };

  const { data, error } = await supabase.rpc("start_dummy_parsing_run", {
    p_source_document_id: sourceDocumentId,
    p_total_pages: 20,
  });

  if (error) return { error: normalizeRpcError(error.message) };

  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/imports");
  return { runId: typeof data === "string" ? data : undefined };
}

export async function processNextDummyBatch(
  parsingRunId: string
): Promise<{ error?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  if (!parsingRunId) return { error: "Parsing Run ID가 없습니다." };

  const { data: run, error: runError } = await supabase
    .from("parsing_runs")
    .select("source_document_id")
    .eq("id", parsingRunId)
    .maybeSingle();

  if (runError || !run) return { error: "Parsing Run을 찾을 수 없습니다." };

  const { error } = await supabase.rpc("process_next_dummy_batch", {
    p_parsing_run_id: parsingRunId,
    p_batch_size: 5,
  });

  if (error) return { error: normalizeRpcError(error.message) };

  revalidatePath(`/admin/imports/${run.source_document_id}`);
  revalidatePath("/admin/imports");
  return {};
}

// ===== STEP 6B-1: 실제 PDF Text Extraction =====
// STEP 6A Dummy Processor와는 parser_version이 다른 별도의 Run입니다 (TEXT-EXTRACT-v1.0.0).
// 이 구간에서는 "페이지별 원문 텍스트를 정확히 꺼내는 것"까지만 합니다.
// 페이지 원문 추출 결과는 이후 출처사별 구조화·검수 파이프라인에서 사용합니다.

/**
 * Run 생성 전에 먼저 원본 PDF를 실제로 다운로드해서 페이지 수를 확인합니다.
 * 다운로드/페이지 수 확인 자체가 실패하면 Run을 생성하지 않고 에러만 돌려줍니다
 * (애매하게 Run만 만들어놓고 멈추는 상태를 방지).
 */
export async function startPdfTextExtractionRun(
  sourceDocumentId: string
): Promise<{ error?: string; runId?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  if (!sourceDocumentId) return { error: "자료 ID가 없습니다." };

  const { data: doc, error: docError } = await supabase
    .from("source_documents")
    .select("storage_path")
    .eq("id", sourceDocumentId)
    .maybeSingle();

  if (docError || !doc?.storage_path) {
    return { error: "원본 PDF 파일 경로를 찾을 수 없습니다." };
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(doc.storage_path);

  if (downloadError || !fileData) {
    return { error: "원본 PDF 파일을 다운로드할 수 없습니다: " + (downloadError?.message ?? "") };
  }

  let totalPages: number;
  try {
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    totalPages = await getPdfPageCount(bytes);
  } catch (e) {
    return {
      error: "PDF 페이지 수를 확인하는 중 오류가 발생했습니다: " + (e instanceof Error ? e.message : String(e)),
    };
  }

  const { data, error } = await supabase.rpc("start_pdf_text_extraction_run", {
    p_source_document_id: sourceDocumentId,
    p_total_pages: totalPages,
  });

  if (error) return { error: normalizeRpcError(error.message) };

  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/imports");
  return { runId: typeof data === "string" ? data : undefined };
}

type PdfClaimPage = { id: string; page_number: number; attempt_count: number };
type PdfClaimResponse = { run_id: string; pages: PdfClaimPage[] };

/**
 * claim된 페이지들을 실제로 PDF에서 추출해서 complete_pdf_page_batch로 반영합니다.
 * claim/다운로드/추출 중 치명적인 오류가 발생하면 fail_pdf_parsing_run으로 Run을
 * 명시적으로 FAILED 처리합니다 (PROCESSING 상태로 애매하게 방치하지 않기 위함).
 */
async function downloadAndCompletePdfPages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsingRunId: string,
  sourceDocumentId: string,
  claimedPages: PdfClaimPage[]
): Promise<{ error?: string }> {
  if (claimedPages.length === 0) {
    revalidatePath(`/admin/imports/${sourceDocumentId}`);
    revalidatePath("/admin/imports");
    return {};
  }

  const { data: doc, error: docError } = await supabase
    .from("source_documents")
    .select("storage_path")
    .eq("id", sourceDocumentId)
    .maybeSingle();

  if (docError || !doc?.storage_path) {
    await supabase.rpc("fail_pdf_parsing_run", {
      p_parsing_run_id: parsingRunId,
      p_error_message: "원본 PDF 파일 경로를 찾을 수 없습니다.",
    });
    revalidatePath(`/admin/imports/${sourceDocumentId}`);
    return { error: "원본 PDF 파일 경로를 찾을 수 없습니다." };
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(doc.storage_path);

  if (downloadError || !fileData) {
    await supabase.rpc("fail_pdf_parsing_run", {
      p_parsing_run_id: parsingRunId,
      p_error_message: "원본 PDF 파일 다운로드 실패: " + (downloadError?.message ?? ""),
    });
    revalidatePath(`/admin/imports/${sourceDocumentId}`);
    return { error: "원본 PDF 파일을 다운로드할 수 없습니다." };
  }

  let extracted: PageExtractionResult[];
  try {
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    extracted = await extractPdfPagesText(
      bytes,
      claimedPages.map((p) => p.page_number)
    );
  } catch (e) {
    await supabase.rpc("fail_pdf_parsing_run", {
      p_parsing_run_id: parsingRunId,
      p_error_message: "PDF 텍스트 추출 중 오류: " + (e instanceof Error ? e.message : String(e)),
    });
    revalidatePath(`/admin/imports/${sourceDocumentId}`);
    return { error: "PDF 텍스트 추출 중 오류가 발생했습니다." };
  }

  const textByPageNumber = new Map(extracted.map((r) => [r.pageNumber, r]));

  const pageResults = claimedPages.map((p) => {
    const result = textByPageNumber.get(p.page_number);
    if (!result) {
      return { page_id: p.id, success: false, error_message: "추출 결과를 찾을 수 없습니다." };
    }
    return {
      page_id: p.id,
      success: true,
      extracted_text: result.text,
      no_text: result.noText,
    };
  });

  const { error: completeError } = await supabase.rpc("complete_pdf_page_batch", {
    p_parsing_run_id: parsingRunId,
    p_page_results: pageResults,
  });

  if (completeError) return { error: normalizeRpcError(completeError.message) };

  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/imports");
  return {};
}

export async function processNextPdfBatch(parsingRunId: string): Promise<{ error?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  if (!parsingRunId) return { error: "Parsing Run ID가 없습니다." };

  const { data: run, error: runError } = await supabase
    .from("parsing_runs")
    .select("source_document_id")
    .eq("id", parsingRunId)
    .maybeSingle();

  if (runError || !run) return { error: "Parsing Run을 찾을 수 없습니다." };

  const { data: claimData, error: claimError } = await supabase.rpc("claim_pdf_pages", {
    p_parsing_run_id: parsingRunId,
    p_batch_size: PDF_BATCH_SIZE,
  });

  if (claimError) return { error: normalizeRpcError(claimError.message) };

  const claim = (claimData ?? { run_id: parsingRunId, pages: [] }) as PdfClaimResponse;

  return downloadAndCompletePdfPages(supabase, parsingRunId, run.source_document_id, claim.pages ?? []);
}

export async function retryFailedPdfPages(parsingRunId: string): Promise<{ error?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  if (!parsingRunId) return { error: "Parsing Run ID가 없습니다." };

  const { data: run, error: runError } = await supabase
    .from("parsing_runs")
    .select("source_document_id")
    .eq("id", parsingRunId)
    .maybeSingle();

  if (runError || !run) return { error: "Parsing Run을 찾을 수 없습니다." };

  const { data: claimData, error: claimError } = await supabase.rpc("retry_failed_pdf_pages", {
    p_parsing_run_id: parsingRunId,
    p_batch_size: PDF_BATCH_SIZE,
  });

  if (claimError) return { error: normalizeRpcError(claimError.message) };

  const claim = (claimData ?? { run_id: parsingRunId, pages: [] }) as PdfClaimResponse;

  return downloadAndCompletePdfPages(supabase, parsingRunId, run.source_document_id, claim.pages ?? []);
}

export async function retryFailedDummyPages(
  parsingRunId: string
): Promise<{ error?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  if (!parsingRunId) return { error: "Parsing Run ID가 없습니다." };

  const { data: run, error: runError } = await supabase
    .from("parsing_runs")
    .select("source_document_id")
    .eq("id", parsingRunId)
    .maybeSingle();

  if (runError || !run) return { error: "Parsing Run을 찾을 수 없습니다." };

  const { error } = await supabase.rpc("retry_failed_dummy_pages", {
    p_parsing_run_id: parsingRunId,
    p_batch_size: 5,
  });

  if (error) return { error: normalizeRpcError(error.message) };

  revalidatePath(`/admin/imports/${run.source_document_id}`);
  revalidatePath("/admin/imports");
  return {};
}


// ===== STEP 6B-2: NAI semantic parser -> staging =====
export async function generateNaiStaging(sourceDocumentId: string): Promise<{ error?: string; buildings?: number; listings?: number; warnings?: number }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  if (!sourceDocumentId) return { error: "자료 ID가 없습니다." };

  const { data: doc } = await supabase
    .from("source_documents")
    .select("id, parser_type")
    .eq("id", sourceDocumentId)
    .maybeSingle();
  if (!doc || doc.parser_type !== "NAI") return { error: "NAI 문서만 NAI Parser를 실행할 수 있습니다." };

  const { data: run } = await supabase
    .from("parsing_runs")
    .select("id, status, parser_version")
    .eq("source_document_id", sourceDocumentId)
    .eq("parser_type", "NAI")
    .eq("parser_version", "TEXT-EXTRACT-v1.0.0")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run || run.status !== "COMPLETED") return { error: "완료된 NAI PDF Text Extraction Run이 필요합니다." };

  const { data: pageRows, error: pageError } = await supabase
    .from("source_document_pages")
    .select("page_number, extracted_text, status")
    .eq("parsing_run_id", run.id)
    .eq("status", "DONE")
    .order("page_number", { ascending: true });
  if (pageError) return { error: pageError.message };

  const parsed = parseNAIPages((pageRows ?? []).map((p) => ({ page_number: p.page_number, extracted_text: p.extracted_text })));
  if (parsed.buildings.length === 0) return { error: "NAI 건물 후보를 찾지 못했습니다. PDF 추출 텍스트를 먼저 확인해 주세요." };

  const payload = parsed.buildings.map((b) => ({
    raw_building_name: b.raw_building_name,
    normalized_building_name: b.normalized_building_name,
    primary_source_page: b.primary_source_page,
    extracted_data: { ...b.extracted_data, _warnings: b.warnings, _semantic_parser: NAI_PARSER_VERSION },
    listings: b.listings.map((l) => ({ ...l, extracted_data: { ...l.extracted_data, _warnings: l.warnings } })),
  }));

  const { data, error } = await supabase.rpc("replace_nai_staging_results", {
    p_source_document_id: sourceDocumentId,
    p_parsing_run_id: run.id,
    p_parser_version: NAI_PARSER_VERSION,
    p_buildings: payload,
    p_warning_count: parsed.warning_count,
  });
  if (error) return { error: normalizeRpcError(error.message) };
  const result = (data ?? {}) as { buildings?: number; listings?: number; warnings?: number };
  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/imports");
  return result;
}


// ===== Final semantic parser entrypoint: NAI / CBRE / C&W =====
export async function generateSemanticStaging(sourceDocumentId: string): Promise<{ error?: string; buildings?: number; listings?: number; warnings?: number }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  const { data: doc } = await supabase.from("source_documents").select("id, parser_type").eq("id", sourceDocumentId).maybeSingle();
  if (!doc || !doc.parser_type || !["NAI", "CBRE", "CW"].includes(doc.parser_type)) {
    return { error: "NAI, CBRE, C&W 문서만 현재 semantic parser를 지원합니다." };
  }
  const { data: run } = await supabase.from("parsing_runs").select("id,status,parser_version,parser_type,total_pages,processed_pages")
    .eq("source_document_id", sourceDocumentId)
    .eq("parser_version", "TEXT-EXTRACT-v1.0.0")
    .eq("parser_type", doc.parser_type)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run || run.status !== "COMPLETED") return { error: `완료된 ${doc.parser_type} PDF Text Extraction Run이 필요합니다.` };

  const { data: pageRows, error: pageError } = await supabase.from("source_document_pages")
    .select("page_number,extracted_text,status").eq("parsing_run_id", run.id).eq("status", "DONE").order("page_number");
  if (pageError) return { error: pageError.message };
  const pages = (pageRows ?? []).map((p) => ({ page_number: p.page_number, extracted_text: p.extracted_text }));
  if (pages.length === 0) return { error: "저장된 PDF 원문 페이지가 없습니다. 원문 추출 결과를 확인해 주세요." };
  if (run.total_pages && pages.length < run.total_pages) return { error: `원문 추출이 완전하지 않습니다. ${pages.length}/${run.total_pages}페이지만 DONE 상태입니다.` };

  const parsed = doc.parser_type === "NAI" ? parseNAIPages(pages) : doc.parser_type === "CBRE" ? parseCBREPages(pages) : parseCWPages(pages);
  const version = doc.parser_type === "NAI" ? NAI_PARSER_VERSION : doc.parser_type === "CBRE" ? CBRE_PARSER_VERSION : CW_PARSER_VERSION;
  if (parsed.buildings.length === 0) {
    const leasePages = pages.filter((p) => /Office\s*\|\s*For Lease/i.test(p.extracted_text ?? "")).length;
    const samplePages = pages.filter((p) => (p.extracted_text ?? "").trim()).slice(0, 3).map((p) => p.page_number).join(", ");
    return { error: `${doc.parser_type} 건물 후보를 찾지 못했습니다. 원문 ${pages.length}페이지 중 Office | For Lease 감지 ${leasePages}페이지입니다. 텍스트가 있는 예시 페이지: ${samplePages || "없음"}. 기존 Staging은 유지되었습니다.` };
  }

  const parsedListingCount = parsed.buildings.reduce((sum, b) => sum + b.listings.length, 0);
  // Large CBRE packages should never silently replace staging with a clearly broken result.
  // This is deliberately conservative: it catches the observed 367p / 12-listing failure without
  // assuming an exact market vacancy count for future monthly packages.
  if (doc.parser_type === "CBRE" && pages.length >= 200) {
    const parsedBuildingCount = parsed.buildings.length;
    const minListings = pages.length >= 300 ? 200 : 50;
    const minBuildings = pages.length >= 300 ? 150 : 50;
    if (parsedListingCount < minListings || parsedBuildingCount < minBuildings) {
      return { error: `CBRE 구조화 품질검사 실패: ${pages.length}페이지에서 건물 ${parsedBuildingCount}개 / 공실 ${parsedListingCount}건만 감지되었습니다. 안전 기준은 건물 ${minBuildings}개 이상 / 공실 ${minListings}건 이상입니다. 기존 Staging은 변경하지 않았습니다.` };
    }
  }

  const payload = parsed.buildings.map((b) => ({
    raw_building_name: b.raw_building_name, normalized_building_name: b.normalized_building_name, primary_source_page: b.primary_source_page,
    extracted_data: { ...b.extracted_data, _warnings: b.warnings, _semantic_parser: version },
    listings: b.listings.map((l) => ({ ...l, extracted_data: { ...l.extracted_data, _warnings: l.warnings } })),
  }));
  const { data, error } = await supabase.rpc("replace_semantic_staging_results", {
    p_source_document_id: sourceDocumentId, p_parsing_run_id: run.id, p_parser_version: version, p_buildings: payload, p_warning_count: parsed.warning_count,
  });
  if (error) return { error: normalizeRpcError(error.message) };
  revalidatePath(`/admin/imports/${sourceDocumentId}`); revalidatePath("/admin/imports");
  return (data ?? {}) as { buildings?: number; listings?: number; warnings?: number };
}

export async function setManualBuildingMatch(sourceDocumentId: string, stagingBuildingId: string, buildingId: string): Promise<{ error?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  const { error } = await supabase.rpc("set_staging_building_match", { p_staging_building_id: stagingBuildingId, p_building_id: buildingId });
  if (error) return { error: normalizeRpcError(error.message) };
  revalidatePath(`/admin/imports/${sourceDocumentId}`); return {};
}

export async function classifyImportDiff(sourceDocumentId: string): Promise<{ error?: string; newCount?: number; updated?: number; unchanged?: number; conflict?: number }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  const { data, error } = await supabase.rpc("classify_import_listing_diff", { p_source_document_id: sourceDocumentId });
  if (error) return { error: normalizeRpcError(error.message) };
  const r = (data ?? {}) as Record<string, number>; revalidatePath(`/admin/imports/${sourceDocumentId}`);
  return { newCount: r.new ?? 0, updated: r.updated ?? 0, unchanged: r.unchanged ?? 0, conflict: r.conflict ?? 0 };
}

export async function approveImportBatch(sourceDocumentId: string): Promise<{ error?: string; inserted?: number; updated?: number; unchanged?: number }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  const { data, error } = await supabase.rpc("approve_import_batch", { p_source_document_id: sourceDocumentId });
  if (error) return { error: normalizeRpcError(error.message) };
  revalidatePath(`/admin/imports/${sourceDocumentId}`); revalidatePath("/admin/imports"); revalidatePath("/admin/listings"); revalidatePath("/buildings");
  return (data ?? {}) as { inserted?: number; updated?: number; unchanged?: number };
}

export async function bulkCreateBuildingsFromStaging(
  sourceDocumentId: string,
  stagingBuildingIds: string[]
): Promise<{ error?: string; created?: number; linkedExisting?: number; skippedReview?: number; alreadyMatched?: number; failed?: number }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  const ids = [...new Set(stagingBuildingIds.filter(Boolean))];
  if (ids.length === 0) return { error: "일괄 등록할 신규 건물을 선택해 주세요." };
  if (ids.length > 300) return { error: "한 번에 최대 300개까지 처리할 수 있습니다." };

  const { data, error } = await supabase.rpc("bulk_create_buildings_from_staging", {
    p_source_document_id: sourceDocumentId,
    p_staging_building_ids: ids,
  });
  if (error) return { error: normalizeRpcError(error.message) };
  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/imports");
  revalidatePath("/admin/buildings");
  return {
    created: Number(r.created ?? 0),
    linkedExisting: Number(r.linked_existing ?? 0),
    skippedReview: Number(r.skipped_review ?? 0),
    alreadyMatched: Number(r.already_matched ?? 0),
    failed: Number(r.failed ?? 0),
  };
}

export async function createBuildingFromStaging(sourceDocumentId: string, stagingBuildingId: string): Promise<{ error?: string; buildingId?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  const { data, error } = await supabase.rpc("create_building_from_staging", { p_staging_building_id: stagingBuildingId });
  if (error) return { error: normalizeRpcError(error.message) };
  revalidatePath(`/admin/imports/${sourceDocumentId}`); revalidatePath("/admin/buildings");
  return { buildingId: typeof data === "string" ? data : undefined };
}

export async function resolvePossibleRemoval(sourceDocumentId: string, stagingListingId: string, resolution: "KEEP"|"EXPIRED"|"LEASED"|"HIDDEN"): Promise<{ error?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  const { error } = await supabase.rpc("resolve_possible_removal", { p_staging_listing_id: stagingListingId, p_resolution: resolution });
  if (error) return { error: normalizeRpcError(error.message) };
  revalidatePath(`/admin/imports/${sourceDocumentId}`); return {};
}

export async function resolveListingConflict(sourceDocumentId: string, stagingListingId: string, action: "AS_NEW"|"MATCH_EXISTING", listingId?: string): Promise<{ error?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  const { error } = await supabase.rpc("resolve_listing_conflict", { p_staging_listing_id: stagingListingId, p_action: action, p_listing_id: listingId ?? null });
  if (error) return { error: normalizeRpcError(error.message) };
  revalidatePath(`/admin/imports/${sourceDocumentId}`); return {};
}


// ===== STEP 7: staging building -> canonical building candidate matching =====
function extractedString(extracted: unknown, key: string): string | null {
  if (!extracted || typeof extracted !== "object") return null;
  const field = (extracted as Record<string, unknown>)[key];
  if (!field || typeof field !== "object") return null;
  const value = (field as Record<string, unknown>).value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readAliasRows(rows: Record<string, unknown>[]): AliasForMatch[] {
  const aliases: AliasForMatch[] = [];
  for (const row of rows) {
    const buildingId = typeof row.building_id === "string" ? row.building_id : null;
    if (!buildingId) continue;
    const candidateKeys = ["alias", "alias_name", "name", "normalized_alias", "normalized_name"];
    for (const key of candidateKeys) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) aliases.push({ building_id: buildingId, alias: value.trim() });
    }
  }
  return aliases;
}

export async function runBuildingMatching(sourceDocumentId: string): Promise<{
  error?: string;
  autoMatched?: number;
  reviewRequired?: number;
  newCandidates?: number;
}> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  if (!sourceDocumentId) return { error: "자료 ID가 없습니다." };

  const { data: run } = await supabase
    .from("parsing_runs")
    .select("id, status, parser_version")
    .eq("source_document_id", sourceDocumentId)
    .eq("parser_version", "TEXT-EXTRACT-v1.0.0")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run || run.status !== "COMPLETED") return { error: "완료된 PDF Text Extraction Run이 필요합니다." };

  const { data: stagingRows, error: stagingError } = await supabase
    .from("staging_buildings")
    .select("id, raw_building_name, normalized_building_name, extracted_data")
    .eq("source_document_id", sourceDocumentId)
    .eq("parsing_run_id", run.id)
    .order("primary_source_page", { ascending: true });

  if (stagingError) return { error: stagingError.message };
  if (!stagingRows || stagingRows.length === 0) return { error: "먼저 Staging 건물 후보를 생성해 주세요." };

  const { data: buildingRows, error: buildingError } = await supabase
    .from("buildings")
    .select("id, name, name_en, alias, normalized_name, road_address, jibun_address, deleted_at")
    .is("deleted_at", null);
  if (buildingError) return { error: buildingError.message };

  // building_aliases의 과거 실제 컬럼명이 배포본마다 다를 가능성이 있어 * 로 읽고
  // 알려진 alias 계열 문자열 컬럼만 안전하게 사용합니다. 테이블 조회가 실패하면 legacy buildings.alias만으로 계속 진행합니다.
  const aliasQuery = await supabase.from("building_aliases").select("*");
  const aliases = aliasQuery.error ? [] : readAliasRows((aliasQuery.data ?? []) as Record<string, unknown>[]);

  let autoMatched = 0;
  let reviewRequired = 0;
  let newCandidates = 0;

  for (const row of stagingRows) {
    const extractedData = (row.extracted_data ?? {}) as Record<string, unknown>;
    const decision = matchBuilding({
      rawName: row.raw_building_name ?? "",
      normalizedName: extractedString(extractedData, "building_name_kr") ?? row.normalized_building_name,
      roadAddress: extractedString(extractedData, "road_address"),
      buildings: (buildingRows ?? []) as ExistingBuildingForMatch[],
      aliases,
    });

    if (decision.status === "AUTO_MATCHED") autoMatched += 1;
    else if (decision.status === "REVIEW_REQUIRED") reviewRequired += 1;
    else newCandidates += 1;

    const nextExtracted = {
      ...extractedData,
      _match: {
        engine: "BUILDING-MATCH-v1.0.0",
        matched_at: new Date().toISOString(),
        status: decision.status,
        score: decision.score,
        reason: decision.reason,
        candidates: decision.candidates,
      },
    };

    const { error: updateError } = await supabase
      .from("staging_buildings")
      .update({
        matched_building_id: decision.matched_building_id,
        match_status: decision.status,
        match_score: decision.score,
        match_reason: decision.reason,
        extracted_data: nextExtracted,
      })
      .eq("id", row.id)
      .eq("parsing_run_id", run.id);

    if (updateError) return { error: `건물 매칭 결과 저장 실패: ${updateError.message}` };
  }

  await supabase
    .from("source_documents")
    .update({ matched_buildings_count: autoMatched, new_buildings_count: newCandidates })
    .eq("id", sourceDocumentId);

  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/imports");
  return { autoMatched, reviewRequired, newCandidates };
}

export type ListingCorrectionPayload = {
  floor?: string | null;
  unit?: string | null;
  gross_area?: number | null;
  gross_area_py?: number | null;
  exclusive_area?: number | null;
  exclusive_area_py?: number | null;
  deposit_per_py?: number | null;
  rent_per_py?: number | null;
  maintenance_per_py?: number | null;
  noc_per_py?: number | null;
  deposit_total_won?: number | null;
  monthly_rent_total_won?: number | null;
  management_fee_total_won?: number | null;
  move_in_text?: string | null;
  status?: string;
  is_published?: boolean;
};

export async function applyListingCorrection(
  sourceDocumentId: string,
  stagingListingId: string,
  patch: ListingCorrectionPayload,
  note?: string
): Promise<{ error?: string; listingId?: string; status?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  if (!sourceDocumentId || !stagingListingId) return { error: "정정할 공실 정보가 없습니다." };

  const { data, error } = await supabase.rpc("apply_listing_correction", {
    p_staging_listing_id: stagingListingId,
    p_patch: patch,
    p_note: note?.trim() || null,
  });
  if (error) return { error: normalizeRpcError(error.message) };

  const result = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/listings");
  revalidatePath("/buildings");
  return {
    listingId: typeof result.listing_id === "string" ? result.listing_id : undefined,
    status: typeof result.status === "string" ? result.status : undefined,
  };
}

export async function verifyListingWarningNoChange(
  sourceDocumentId: string,
  stagingListingId: string,
  note?: string
): Promise<{ error?: string; listingId?: string; status?: string }> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };
  if (!sourceDocumentId || !stagingListingId) return { error: "검토할 공실 정보가 없습니다." };

  const { data, error } = await supabase.rpc("verify_listing_warning_no_change", {
    p_staging_listing_id: stagingListingId,
    p_note: note?.trim() || null,
  });
  if (error) return { error: normalizeRpcError(error.message) };

  const result = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  revalidatePath("/admin/listings");
  return {
    listingId: typeof result.listing_id === "string" ? result.listing_id : undefined,
    status: typeof result.status === "string" ? result.status : undefined,
  };
}

function extractedFieldValue<T = unknown>(data: Record<string, unknown>, key: string): T | null {
  const field = data[key];
  if (!field || typeof field !== "object") return null;
  const value = (field as Record<string, unknown>).value;
  return (value === undefined || value === null || value === "") ? null : value as T;
}

function normalizeTitleForJoin(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s·._\-()[\]{}]/g, "");
}

function parseFirstStation(accessText: string | null): { line_name: string | null; station_name: string | null; description: string | null } | null {
  if (!accessText?.trim()) return null;
  const line = accessText.match(/((?:\d+(?:,\d+)*|[가-힣A-Za-z]+)호선)/)?.[1] ?? null;
  const station = accessText.match(/([가-힣A-Za-z0-9·]+역)/)?.[1] ?? null;
  return { line_name: line, station_name: station, description: accessText.trim() };
}

const CBRE_FACTS_ENRICHMENT_VERSION = "CBRE-BUILDING-FACTS-v1.20.0";

type CbreFactsProgress = {
  error?: string;
  nextOffset?: number;
  totalBuildings?: number;
  done?: boolean;
};

function valuesEquivalent(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") return false;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a), nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 0.0001;
  }
  return String(a).trim() === String(b).trim();
}

function looksLikeContaminatedParkingText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.replace(/\s+/g, " ").trim();
  return /(?:임대면적|전용면적)\s*\([\d,.]+\s*평\)/i.test(v)
    || /(?:무료주차|유료주차|기준층|Availabilities)/i.test(v)
    || /전용면적\s*층당\s*[\d,.]+\s*대/i.test(v);
}

function factPairWarning(data: Record<string, unknown>, sqmKey: string, pyKey: string, label: string): string | null {
  const sqm = extractedFieldValue<number>(data, sqmKey);
  const py = extractedFieldValue<number>(data, pyKey);
  if (sqm == null || py == null || sqm <= 0 || py <= 0) return null;
  const ratio = sqm / py;
  return ratio < 3.20 || ratio > 3.42 ? `${label} ㎡/평 환산값 불일치` : null;
}

export async function getCbreBuildingFactsEnrichmentProgress(sourceDocumentId: string): Promise<CbreFactsProgress> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  const { data: run } = await supabase
    .from("parsing_runs")
    .select("id,status")
    .eq("source_document_id", sourceDocumentId)
    .eq("parser_version", "TEXT-EXTRACT-v1.0.0")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run || run.status !== "COMPLETED") return { error: "완료된 PDF 원문 추출 결과가 필요합니다." };

  const { count } = await supabase
    .from("staging_buildings")
    .select("id", { count: "exact", head: true })
    .eq("source_document_id", sourceDocumentId)
    .eq("parsing_run_id", run.id);
  const totalBuildings = count ?? 0;

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("after_data,created_at")
    .eq("entity_type", "source_document")
    .eq("entity_id", sourceDocumentId)
    .eq("action", "ENRICH_CBRE_BUILDING_FACTS")
    .order("created_at", { ascending: false })
    .limit(40);

  // The newest compatible log is the checkpoint for the CURRENT run. Do not take a max
  // across older completed runs, or an interrupted second run could incorrectly look complete.
  const latestCompatible = (logs ?? []).find((row) => {
    const d = (row.after_data ?? {}) as Record<string, unknown>;
    return d.enrichment_version === CBRE_FACTS_ENRICHMENT_VERSION;
  });
  if (!latestCompatible) return { nextOffset: 0, totalBuildings, done: false };

  const latestData = (latestCompatible.after_data ?? {}) as Record<string, unknown>;
  const latestTo = Number(latestData.processed_to ?? 0);
  const latestDone = latestData.done === true;
  // A completed run intentionally starts at 0 when the admin explicitly runs enrichment again.
  const nextOffset = latestDone || (Number.isFinite(latestTo) && latestTo >= totalBuildings)
    ? 0
    : (Number.isFinite(latestTo) ? Math.max(0, latestTo) : 0);
  return { nextOffset, totalBuildings, done: false };
}

/**
 * CBRE 기본정보 보강 v1.20
 * - 전체 367페이지를 매 배치마다 다시 읽지 않고, 현재 12개 staging 건물의 원본 페이지만 읽습니다.
 * - 빈 값 우선 보강을 유지합니다.
 * - 이전 CBRE 자동보강값과 현재 canonical 값이 정확히 같고, 새 파서가 더 깨끗한 값을 추출한 경우에만
 *   해당 자동보강값을 교정합니다. 관리자 수동입력으로 보이는 값은 덮어쓰지 않습니다.
 */
export async function enrichCbreBuildingFacts(
  sourceDocumentId: string,
  offset = 0,
  limit = 12,
): Promise<{
  error?: string;
  parsedBuildings?: number;
  matchedBuildings?: number;
  updatedBuildings?: number;
  correctedBuildings?: number;
  parkingUpdated?: number;
  transportAdded?: number;
  reviewNeeded?: number;
  skipped?: number;
  processedFrom?: number;
  processedTo?: number;
  totalBuildings?: number;
  nextOffset?: number;
  done?: boolean;
}> {
  const { supabase, admin, error: authError } = await requireAdmin();
  if (!admin) return { error: authError ?? "관리자 권한이 없는 계정입니다." };

  const { data: doc, error: docError } = await supabase
    .from("source_documents")
    .select("id,parser_type,report_date")
    .eq("id", sourceDocumentId)
    .maybeSingle();
  if (docError || !doc) return { error: docError?.message ?? "자료를 찾을 수 없습니다." };
  if (doc.parser_type !== "CBRE") return { error: "CBRE 자료에서만 건물 기본정보 보강을 실행할 수 있습니다." };

  const { data: run } = await supabase
    .from("parsing_runs")
    .select("id,status")
    .eq("source_document_id", sourceDocumentId)
    .eq("parser_version", "TEXT-EXTRACT-v1.0.0")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run || run.status !== "COMPLETED") return { error: "완료된 PDF 원문 추출 결과가 필요합니다." };

  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.min(20, Math.max(1, Math.floor(limit))) : 12;

  const { data: stagingRows, error: stagingError, count } = await supabase
    .from("staging_buildings")
    .select("id,raw_building_name,normalized_building_name,primary_source_page,matched_building_id,extracted_data", { count: "exact" })
    .eq("source_document_id", sourceDocumentId)
    .eq("parsing_run_id", run.id)
    .order("primary_source_page", { ascending: true })
    .order("id", { ascending: true })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (stagingError) return { error: stagingError.message };

  const totalBuildings = count ?? 0;
  if (totalBuildings < 100) return { error: `CBRE staging 품질검사 실패: 건물 ${totalBuildings}개. 기존 데이터는 변경하지 않았습니다.` };
  const batch = stagingRows ?? [];
  const sourcePages = [...new Set(batch.map((s) => Number(s.primary_source_page)).filter((x) => Number.isFinite(x) && x > 0))];
  const { data: pages, error: pageError } = sourcePages.length ? await supabase
    .from("source_document_pages")
    .select("page_number,extracted_text")
    .eq("parsing_run_id", run.id)
    .in("page_number", sourcePages) : { data: [], error: null };
  if (pageError) return { error: pageError.message };
  const pageText = new Map<number, string | null>((pages ?? []).map((p: { page_number: number; extracted_text: string | null }) => [p.page_number, p.extracted_text]));

  const buildingIds = [...new Set(batch.map((s) => s.matched_building_id).filter((x): x is string => Boolean(x)))];
  const { data: currentRows, error: currentRowsError } = buildingIds.length ? await supabase
    .from("buildings")
    .select("id,road_address,completion_year,completion_month,basement_floors,above_ground_floors,gross_floor_area,efficiency_ratio,elevator_count,elevator_detail,typical_floor_leasable_area_sqm,typical_floor_leasable_area_py,typical_floor_exclusive_area_sqm,typical_floor_exclusive_area_py")
    .in("id", buildingIds) : { data: [], error: null };
  if (currentRowsError) return { error: currentRowsError.message };
  const currentById = new Map<string, any>((currentRows ?? []).map((row: any) => [row.id, row]));

  const { data: parkingRows, error: parkingRowsError } = buildingIds.length ? await supabase
    .from("building_parking")
    .select("id,building_id,total_spaces,free_parking_text,paid_parking_text")
    .in("building_id", buildingIds) : { data: [], error: null };
  if (parkingRowsError) return { error: parkingRowsError.message };
  const parkingByBuilding = new Map<string, any>((parkingRows ?? []).map((row: any) => [row.building_id, row]));

  const { data: transportRows, error: transportRowsError } = buildingIds.length ? await supabase
    .from("building_transportation")
    .select("building_id")
    .in("building_id", buildingIds) : { data: [], error: null };
  if (transportRowsError) return { error: transportRowsError.message };
  const hasTransportation = new Set<string>((transportRows ?? []).map((row: any) => row.building_id));

  let matchedBuildings = 0;
  let updatedBuildings = 0;
  let correctedBuildings = 0;
  let parkingUpdated = 0;
  let transportAdded = 0;
  let reviewNeeded = 0;
  let skipped = 0;

  for (const s of batch) {
    if (!s.matched_building_id) { skipped += 1; continue; }
    const text = pageText.get(Number(s.primary_source_page));
    if (!text?.trim()) { skipped += 1; continue; }

    const parsed = parseCBREPages([{ page_number: Number(s.primary_source_page), extracted_text: text }]);
    let pb = parsed.buildings.find((x) => normalizeTitleForJoin(x.raw_building_name) === normalizeTitleForJoin(s.raw_building_name));
    if (!pb && parsed.buildings.length === 1) pb = parsed.buildings[0];
    if (!pb) { skipped += 1; continue; }
    matchedBuildings += 1;

    const richer = pb.extracted_data as Record<string, unknown>;
    const oldExtracted = (s.extracted_data ?? {}) as Record<string, unknown>;
    const oldFactsVersion = typeof oldExtracted._building_facts_version === "string" ? oldExtracted._building_facts_version : null;
    const hasPreviousAutoFacts = Boolean(oldFactsVersion?.startsWith("CBRE-BUILDING-FACTS-"));
    let correctedThisBuilding = false;
    const factWarnings = [
      factPairWarning(richer, "gross_floor_area_sqm", "gross_floor_area_py", "연면적"),
      factPairWarning(richer, "typical_floor_leasable_sqm", "typical_floor_leasable_py", "기준층 임대면적"),
      factPairWarning(richer, "typical_floor_exclusive_sqm", "typical_floor_exclusive_py", "기준층 전용면적"),
    ].filter((x): x is string => Boolean(x));
    if (factWarnings.length) reviewNeeded += 1;

    const mergedStaging = {
      ...oldExtracted,
      ...richer,
      _building_facts_version: CBRE_FACTS_ENRICHMENT_VERSION,
      _building_fact_warnings: factWarnings,
    };

    const current = currentById.get(s.matched_building_id);
    if (!current) { skipped += 1; continue; }

    // Canonical building fields remain fill-only. We intentionally do not overwrite a populated
    // building field because it may have been manually reviewed/edited by an administrator.
    const patch: Record<string, unknown> = {};
    const fill = (column: string, currentValue: unknown, key: string, allowPreviousAutoCorrection = false) => {
      const next = extractedFieldValue(richer, key);
      if (next === null) return;
      if (currentValue === null || currentValue === undefined || currentValue === "") {
        patch[column] = next;
        return;
      }
      // Only correct a populated canonical field when we can prove it still equals the value
      // previously written by CORE PRIME's own enrichment. This protects later admin edits.
      if (allowPreviousAutoCorrection && hasPreviousAutoFacts) {
        const previousAutoValue = extractedFieldValue(oldExtracted, key);
        if (previousAutoValue !== null
          && valuesEquivalent(currentValue, previousAutoValue)
          && !valuesEquivalent(previousAutoValue, next)) {
          patch[column] = next;
          correctedThisBuilding = true;
        }
      }
    };
    fill("completion_year", current.completion_year, "completion_year");
    fill("completion_month", current.completion_month, "completion_month");
    fill("basement_floors", current.basement_floors, "basement_floors");
    fill("above_ground_floors", current.above_ground_floors, "above_ground_floors");
    fill("gross_floor_area", current.gross_floor_area, "gross_floor_area_sqm");
    fill("efficiency_ratio", current.efficiency_ratio, "efficiency_ratio");
    // v1.14.3 had a few PDF row-order edge cases in elevator values/details. Safe-correct only
    // when the current DB value is still exactly the prior auto-extracted value.
    fill("elevator_count", current.elevator_count, "elevator_count", true);
    fill("elevator_detail", current.elevator_detail, "elevator_detail", true);
    fill("typical_floor_leasable_area_sqm", current.typical_floor_leasable_area_sqm, "typical_floor_leasable_sqm");
    fill("typical_floor_leasable_area_py", current.typical_floor_leasable_area_py, "typical_floor_leasable_py");
    fill("typical_floor_exclusive_area_sqm", current.typical_floor_exclusive_area_sqm, "typical_floor_exclusive_sqm");
    fill("typical_floor_exclusive_area_py", current.typical_floor_exclusive_area_py, "typical_floor_exclusive_py");
    if (Object.keys(patch).length > 0) {
      patch.data_last_verified_at = doc.report_date || new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("buildings").update(patch).eq("id", current.id);
      if (error) return { error: `건물 기본정보 저장 실패: ${error.message}` };
      updatedBuildings += 1;
    }

    const parking = parkingByBuilding.get(current.id) ?? null;
    const totalSpaces = extractedFieldValue<number>(richer, "parking_total");
    const freeParkingText = extractedFieldValue<string>(richer, "free_parking_text");
    const paidParkingText = extractedFieldValue<string>(richer, "paid_parking_text");
    const oldFreeParking = extractedFieldValue<string>(oldExtracted, "free_parking_text");
    const oldPaidParking = extractedFieldValue<string>(oldExtracted, "paid_parking_text");
    if (parking) {
      const pp: Record<string, unknown> = {};
      if (parking.total_spaces == null && totalSpaces != null) pp.total_spaces = totalSpaces;
      else if (hasPreviousAutoFacts && totalSpaces != null) {
        const oldParkingTotal = extractedFieldValue<number>(oldExtracted, "parking_total");
        if (oldParkingTotal != null
          && valuesEquivalent(parking.total_spaces, oldParkingTotal)
          && !valuesEquivalent(oldParkingTotal, totalSpaces)) {
          pp.total_spaces = totalSpaces;
          correctedThisBuilding = true;
        }
      }
      if (!parking.free_parking_text && freeParkingText) pp.free_parking_text = freeParkingText;
      else if (oldFreeParking && freeParkingText
        && valuesEquivalent(parking.free_parking_text, oldFreeParking)
        && looksLikeContaminatedParkingText(oldFreeParking)
        && !valuesEquivalent(oldFreeParking, freeParkingText)) {
        pp.free_parking_text = freeParkingText;
        correctedThisBuilding = true;
      }
      if (!parking.paid_parking_text && paidParkingText) pp.paid_parking_text = paidParkingText;
      else if (oldPaidParking && paidParkingText
        && valuesEquivalent(parking.paid_parking_text, oldPaidParking)
        && looksLikeContaminatedParkingText(oldPaidParking)
        && !valuesEquivalent(oldPaidParking, paidParkingText)) {
        pp.paid_parking_text = paidParkingText;
        correctedThisBuilding = true;
      }
      if (Object.keys(pp).length > 0) {
        const { error } = await supabase.from("building_parking").update(pp).eq("id", parking.id);
        if (error) return { error: `주차정보 저장 실패: ${error.message}` };
        parkingUpdated += 1;
      }
    } else if (totalSpaces != null || freeParkingText || paidParkingText) {
      const { error } = await supabase.from("building_parking").insert({ building_id: current.id, total_spaces: totalSpaces, free_parking_text: freeParkingText, paid_parking_text: paidParkingText });
      if (error) return { error: `주차정보 생성 실패: ${error.message}` };
      parkingUpdated += 1;
    }

    const subwayText = extractedFieldValue<string>(richer, "subway_access_text");
    if (subwayText && /역/.test(subwayText) && !hasTransportation.has(current.id)) {
      const t = parseFirstStation(subwayText);
      if (t) {
        const { error } = await supabase.from("building_transportation").insert({ building_id: current.id, transport_type: "지하철", ...t });
        if (!error) {
          transportAdded += 1;
          hasTransportation.add(current.id);
        }
      }
    }

    if (correctedThisBuilding) correctedBuildings += 1;

    // Staging is written last so a mid-building failure cannot destroy the previous-auto-value
    // evidence needed for a safe correction on retry.
    const { error: stagingUpdateError } = await supabase.from("staging_buildings").update({ extracted_data: mergedStaging }).eq("id", s.id);
    if (stagingUpdateError) return { error: `staging 보강정보 저장 실패: ${stagingUpdateError.message}` };
  }

  const nextOffset = Math.min(safeOffset + batch.length, totalBuildings);
  const done = nextOffset >= totalBuildings;
  await supabase.from("audit_logs").insert({
    actor_type: "ADMIN",
    actor_id: admin.id,
    action: "ENRICH_CBRE_BUILDING_FACTS",
    entity_type: "source_document",
    entity_id: sourceDocumentId,
    after_data: {
      enrichment_version: CBRE_FACTS_ENRICHMENT_VERSION,
      parser_version: CBRE_PARSER_VERSION,
      parsed_buildings: totalBuildings,
      processed_from: safeOffset,
      processed_to: nextOffset,
      matched_buildings: matchedBuildings,
      updated_buildings: updatedBuildings,
      corrected_buildings: correctedBuildings,
      parking_updated: parkingUpdated,
      transport_added: transportAdded,
      review_needed: reviewNeeded,
      skipped,
      done,
    },
  });

  revalidatePath(`/admin/imports/${sourceDocumentId}`);
  if (done) {
    revalidatePath("/admin/buildings");
    revalidatePath("/buildings");
  }
  return {
    parsedBuildings: totalBuildings,
    matchedBuildings,
    updatedBuildings,
    correctedBuildings,
    parkingUpdated,
    transportAdded,
    reviewNeeded,
    skipped,
    processedFrom: safeOffset,
    processedTo: nextOffset,
    totalBuildings,
    nextOffset,
    done,
  };
}
