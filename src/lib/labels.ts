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
};

export const LISTING_STATUS_ORDER = [
  "available",
  "negotiating",
  "contracting",
  "leased",
  "hold",
  "hidden",
] as const;
