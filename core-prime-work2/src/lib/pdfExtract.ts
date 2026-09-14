// CORE PRIME PDF text extraction helper.
// 역할: private PDF를 페이지 단위로 읽어 원문 텍스트만 충실히 보존합니다.
// 건물/임대조건 해석은 semantic parser가 담당합니다.

import { getDocumentProxy } from "unpdf";

export type PageExtractionResult = {
  pageNumber: number; // PDF viewer 기준 1-based
  text: string;
  noText: boolean;
};

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function cleanExtractedText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(CONTROL_CHAR_REGEX, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]{3,}/g, "  ")
    .trim();
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await getDocumentProxy(bytes);
  const totalPages = pdf.numPages;
  if (!totalPages || totalPages < 1) throw new Error("PDF 페이지 수를 확인할 수 없습니다.");
  return totalPages;
}

/**
 * 핵심: 매 배치마다 300페이지 전체를 다시 text extraction 하지 않습니다.
 * PDF proxy는 열되, 실제 getTextContent()는 claim된 1-based 페이지에 대해서만 호출합니다.
 */
export async function extractPdfPagesText(
  bytes: Uint8Array,
  pageNumbers: number[]
): Promise<PageExtractionResult[]> {
  const pdf = await getDocumentProxy(bytes);
  const uniquePages = [...new Set(pageNumbers)].sort((a, b) => a - b);
  const results: PageExtractionResult[] = [];

  for (const pageNumber of uniquePages) {
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`PDF 페이지 범위를 벗어났습니다: ${pageNumber}`);
    }

    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const raw = (content.items as Array<Record<string, unknown>>)
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    const cleaned = cleanExtractedText(raw);
    results.push({ pageNumber, text: cleaned, noText: cleaned.length === 0 });
  }

  return results;
}
