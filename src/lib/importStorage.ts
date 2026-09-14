// 자료 가져오기(Import) PDF 업로드 — Storage 경로/용량 관련 유틸
//
// 경로 규칙: {source_code}/{YYYY}/{MM}/{uuid}-{안전화된 파일명}
// - uuid를 앞에 붙여 동일 파일명이 올라와도 절대 덮어쓰지(overwrite) 않습니다.
// - 원본 파일명(한글 포함)은 그대로 source_documents.original_filename에 저장하고,
//   이 파일의 함수들은 오직 "Storage 경로에 들어갈 파일명"을 안전하게 만드는 데만 사용합니다.

/**
 * Storage 경로에 쓰기 안전한 파일명으로 변환합니다.
 * - 경로 구분자(/, \), 제어문자, 경로 탐색(..)에 쓰일 수 있는 패턴을 제거/치환합니다.
 * - 한글은 그대로 유지합니다 (한글↔영문 변환 없음).
 * - 허용 문자: 한글/영문/숫자/공백/하이픈(-)/언더스코어(_)/점(.)
 * - 과도하게 긴 파일명은 확장자를 보존하며 잘라냅니다.
 */
export function safeFilename(original: string): string {
  if (!original) return "file.pdf";

  const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

  let name = original
    .replace(/[\\/]/g, "_") // 경로 구분자 → 언더스코어
    .replace(CONTROL_CHARS, "") // 제어문자 제거
    .replace(/\.\./g, "."); // 경로 탐색(..) 방지

  // 허용 문자만 남김: 유니코드 문자(한글 포함)/숫자/공백/-/_/.
  name = name.replace(/[^\p{L}\p{N}\s\-_.]/gu, "");

  // 연속 공백/점 정리 + 앞뒤 공백 제거
  name = name.replace(/\s+/g, " ").replace(/\.{2,}/g, ".").trim();

  if (!name || name === ".") name = "file.pdf";

  const MAX_LEN = 100;
  if (name.length > MAX_LEN) {
    const dotIndex = name.lastIndexOf(".");
    const hasExt = dotIndex > 0 && dotIndex < name.length - 1;
    const ext = hasExt ? name.slice(dotIndex) : "";
    const base = hasExt ? name.slice(0, dotIndex) : name;
    name = base.slice(0, Math.max(1, MAX_LEN - ext.length)) + ext;
  }

  return name;
}

/**
 * source-pdfs 버킷에 저장할 경로를 만듭니다.
 * 형태: {source_code}/{YYYY}/{MM}/{uuid}-{안전화된 파일명}
 */
export function buildSourcePdfStoragePath(params: {
  sourceCode: string;
  reportDate: string; // "YYYY-MM-DD"
  uuid: string;
  originalFilename: string;
}): string {
  const { sourceCode, reportDate, uuid, originalFilename } = params;

  const [yyyy, mm] = (reportDate || "").split("-");
  const now = new Date();
  const year = yyyy && /^\d{4}$/.test(yyyy) ? yyyy : String(now.getFullYear());
  const month = mm && /^\d{2}$/.test(mm) ? mm : String(now.getMonth() + 1).padStart(2, "0");

  const codeSegment = (sourceCode || "OTHER").replace(/[^A-Za-z0-9_-]/g, "") || "OTHER";
  const fname = safeFilename(originalFilename);

  return `${codeSegment}/${year}/${month}/${uuid}-${fname}`;
}

// source-pdfs 버킷의 file_size_limit(209715200 bytes = 200MB)과 일치시켜 둡니다.
// 버킷 설정이 바뀌면 이 값도 함께 바꿔야 합니다 (STEP 5 완료 보고서 참고).
export const MAX_PDF_SIZE_BYTES = 200 * 1024 * 1024;
export const MAX_PDF_SIZE_LABEL = "200MB";

/**
 * 파일의 앞부분 바이트를 읽어 PDF 매직 바이트("%PDF-")인지 확인합니다.
 * 확장자/MIME 타입만 믿지 않기 위한 2차 검증입니다.
 */
export async function looksLikePdf(file: File): Promise<boolean> {
  try {
    const head = await file.slice(0, 5).arrayBuffer();
    const bytes = new Uint8Array(head);
    const text = String.fromCharCode(...bytes);
    return text.startsWith("%PDF-");
  } catch {
    return false;
  }
}
