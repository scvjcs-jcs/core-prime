// 한글 라벨 매핑 모음

export const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  NEW: "신규",
  CONSULTING: "상담중",
  PROPOSAL: "제안중",
  VISIT: "방문예정",
  NEGOTIATION: "협상중",
  CONTRACT: "계약중",
  COMPLETED: "완료",
  HOLD: "보류",
  CLOSED: "종료",
};

export const CUSTOMER_STATUS_ORDER = [
  "NEW",
  "CONSULTING",
  "PROPOSAL",
  "VISIT",
  "NEGOTIATION",
  "CONTRACT",
  "COMPLETED",
  "HOLD",
  "CLOSED",
] as const;

export const LISTING_STATUS_LABEL: Record<string, string> = {
  available: "임대가능",
  negotiating: "협상중",
  contracting: "계약진행중",
  leased: "임대완료",
  hold: "보류",
  hidden: "숨김",
  expired: "만료",
};

export const LISTING_STATUS_ORDER = [
  "available",
  "negotiating",
  "contracting",
  "leased",
  "hold",
  "hidden",
  "expired",
] as const;

// ===== Phase 6 STEP 5: 자료 가져오기(Import) =====

export const SOURCE_DOCUMENT_STATUS_LABEL: Record<string, string> = {
  UPLOADED: "업로드 완료",
  QUEUED: "대기",
  PROCESSING: "처리 중",
  PARSED: "분석 완료",
  REVIEW_REQUIRED: "검수 필요",
  APPROVED: "승인 완료",
  FAILED: "실패",
};

export const SOURCE_DOCUMENT_STATUS_ORDER = [
  "UPLOADED",
  "QUEUED",
  "PROCESSING",
  "PARSED",
  "REVIEW_REQUIRED",
  "APPROVED",
  "FAILED",
] as const;

export const PARSER_TYPE_LABEL: Record<string, string> = {
  CBRE: "CBRE",
  CW: "C&W",
  NAI: "NAI Korea",
  GENERIC: "범용(GENERIC)",
};

// source.code → 기본 추천 parser_type. 실제 sources 테이블의 code 값 기준.
// CBRE / CW / NAI / DIRECT / CORE_PRIME / JLL / SAVILLS / OTHER
export function suggestParserType(sourceCode: string | null | undefined): "CBRE" | "CW" | "NAI" | "GENERIC" {
  switch (sourceCode) {
    case "CBRE":
      return "CBRE";
    case "CW":
      return "CW";
    case "NAI":
      return "NAI";
    default:
      return "GENERIC";
  }
}

// ===== Phase 6 STEP 6A: Parsing State Machine =====
export const PARSING_RUN_STATUS_LABEL: Record<string, string> = {
  QUEUED: "대기",
  PROCESSING: "처리 중",
  COMPLETED: "처리 완료",
  COMPLETED_WITH_WARNINGS: "경고와 함께 완료",
  FAILED: "실행 실패",
  CANCELLED: "취소",
};

export const SOURCE_DOCUMENT_PAGE_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  PROCESSING: "처리 중",
  DONE: "완료",
  FAILED: "실패",
  SKIPPED: "건너뜀",
};
