// DB 테이블과 매칭되는 타입 정의 (Phase 1 범위)

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR";

export type Admin = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type District = {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  description: string | null;
  is_published: boolean;
};

export type Building = {
  id: string;
  building_code: string | null;
  name: string;
  name_en: string | null;
  alias: string | null;
  district_id: string | null;
  address: string | null;
  road_address: string | null;
  jibun_address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  completion_year: number | null;
  basement_floors: number | null;
  above_ground_floors: number | null;
  gross_floor_area: number | null;
  land_area: number | null;
  building_area: number | null;
  efficiency_ratio: number | null;
  parking_total: number | null;
  parking_ratio: number | null;
  elevator_count: number | null;
  freight_elevator_count: number | null;
  building_use: string | null;
  hvac_type: string | null;
  hvac_hours: string | null;
  building_grade: string | null;
  status: string;
  is_featured: boolean;
  is_published: boolean;
  slug: string;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
  normalized_name: string | null;
  data_last_verified_at: string | null;
  // 소프트 삭제(보관) 시각. NULL이면 정상, 값이 있으면 삭제(보관)됨 — 실제 DELETE는 하지 않음.
  deleted_at: string | null;
};

export type BuildingTransportation = {
  id?: string;
  building_id?: string;
  transport_type: string | null;
  line_name: string | null;
  station_name: string | null;
  walk_minutes: number | null;
  description: string | null;
};

export type BuildingParking = {
  building_id?: string;
  total_spaces: number | null;
  tenant_default_spaces: number | null;
  visitor_spaces: number | null;
  monthly_fee: number | null;
  additional_fee: number | null;
  self_parking: boolean;
  mechanical_parking: boolean;
  ev_charging: boolean;
  operating_hours: string | null;
  description: string | null;
};

// Prime Score 공개 상태 — building_scores.status 단일 기준.
// NOT_EVALUATED(평가 전, 고객 비노출) / DRAFT(초안, 관리자만) / PUBLISHED(공개, 고객 노출)
export type BuildingScoreStatus = "NOT_EVALUATED" | "DRAFT" | "PUBLISHED";

export type BuildingScores = {
  building_id?: string;
  // 세부 점수는 입력하지 않으면 NULL("미입력")입니다. 0점과 "미입력"은 다른 의미입니다.
  location_score: number | null;
  transportation_score: number | null;
  building_quality_score: number | null;
  parking_score: number | null;
  amenities_score: number | null;
  corporate_image_score: number | null;
  employee_access_score: number | null;
  total_score?: number | null;
  status: BuildingScoreStatus;
};

export type BuildingImageType =
  | "exterior"
  | "lobby"
  | "office"
  | "parking"
  | "amenity"
  | "night"
  | "aerial"
  | "floor_plan"
  | "map"
  | "other";

export type BuildingImage = {
  id: string;
  building_id: string;
  type: BuildingImageType;
  url: string;
  thumbnail_url: string | null;
  title: string | null;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
  is_published: boolean;
  created_at: string;
};

// ===== Phase 3: 고객 상담(CRM) + 매물(Listings) =====

export type CustomerStatus =
  | "NEW"
  | "CONSULTING"
  | "PROPOSAL"
  | "VISIT"
  | "NEGOTIATION"
  | "CONTRACT"
  | "COMPLETED"
  | "HOLD"
  | "CLOSED";

export type Customer = {
  id: string;
  company_name: string | null;
  contact_name: string;
  phone: string | null;
  email: string | null;
  headcount: number | null;
  inquiry_channel: string | null;
  status: CustomerStatus;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerRequirement = {
  id?: string;
  customer_id?: string;
  preferred_district: string | null;
  min_exclusive_area: number | null;
  max_exclusive_area: number | null;
  min_budget: number | null;
  max_budget: number | null;
  move_in_date: string | null;
  required_parking: number | null;
  preferred_grade: string | null;
  preferred_age: number | null;
  etc_notes: string | null;
};

export type ListingStatus =
  | "available"
  | "negotiating"
  | "contracting"
  | "leased"
  | "hold"
  | "hidden"
  | "expired";

export type Listing = {
  id: string;
  listing_code: string | null;
  building_id: string;
  floor: string | null;
  unit: string | null;
  gross_area: number | null;
  gross_area_py: number | null;
  exclusive_area: number | null;
  exclusive_area_py: number | null;
  efficiency_ratio: number | null;
  deposit: number | null;
  deposit_per_py: number | null;
  monthly_rent: number | null;
  rent_per_py: number | null;
  management_fee: number | null;
  maintenance_per_py: number | null;
  noc_per_py: number | null;
  parking_spaces: number | null;
  additional_parking_fee: number | null;
  available_date: string | null;
  move_in_text: string | null;
  rent_free: string | null;
  fit_out_period: string | null;
  lease_term_months: number | null;
  interior_status: string | null;
  restoration_required: boolean;
  status: ListingStatus;
  description: string | null;
  is_featured: boolean;
  is_published: boolean;
  // 출처/검증 — Import(PDF 자동 입력)가 채우는 필드. source_id가 NULL이면 관리자 수동 입력입니다.
  source_id: string | null;
  source_document_id: string | null;
  source_page: number | null;
  report_date: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

// ===== Phase 4: 제안서(Proposal) =====

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected";

export type Proposal = {
  id: string;
  proposal_code: string | null;
  customer_id: string;
  title: string | null;
  status: ProposalStatus;
  public_token: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalBuilding = {
  id?: string;
  proposal_id?: string;
  building_id: string;
  listing_id: string | null;
  recommendation_rank: number | null;
  recommendation_reason: string | null;
  pros: string | null;
  cons: string | null;
};

// 공개 링크(get_proposal_by_token RPC)가 돌려주는 형태
export type PublicProposal = {
  id: string;
  proposal_code: string | null;
  title: string | null;
  status: ProposalStatus;
  created_at: string;
  expires_at: string | null;
  customer_name: string;
  company_name: string | null;
  buildings: {
    proposal_building_id: string;
    building_id: string;
    name: string;
    slug: string;
    address: string | null;
    building_grade: string | null;
    completion_year: number | null;
    recommendation_rank: number | null;
    recommendation_reason: string | null;
    pros: string | null;
    cons: string | null;
    image_url: string | null;
    total_score: number | null;
    listing: {
      floor: string | null;
      exclusive_area: number | null;
      deposit: number | null;
      monthly_rent: number | null;
      management_fee: number | null;
    } | null;
  }[];
};

// ===== Phase 5: AI 콘텐츠 생성 =====

// DB의 building_contents_content_type_check 제약조건과 반드시 일치해야 합니다.
export type ContentType = "intro" | "blog" | "sns";

export type BuildingContent = {
  id: string;
  building_id: string;
  content_type: ContentType;
  body: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

// ===== Phase 6 STEP 5: 자료 가져오기(Import) — 업로드/등록 관리 =====
// 주의: 이번 STEP은 "PDF를 안전하게 등록하고 관리"하는 화면까지만입니다.
// PDF 내용 분석/파싱/staging 적재는 STEP 6 이후입니다.

// DB의 sources_type_check 제약조건과 반드시 일치해야 합니다.
export type SourceType = "BROKER" | "OWNER_DIRECT" | "CORE_PRIME_DIRECT" | "OTHER";

export type Source = {
  id: string;
  name: string;
  code: string;
  type: SourceType;
  priority: number;
  is_active: boolean;
};

// DB의 source_documents_status_check 제약조건과 반드시 일치해야 합니다.
export type SourceDocumentStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PROCESSING"
  | "PARSED"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "FAILED";

// DB의 source_documents_parser_type_check 제약조건과 반드시 일치해야 합니다.
// NULL = 아직 파서 타입을 지정하지 않음.
export type ParserType = "CBRE" | "CW" | "NAI" | "GENERIC";

export type SourceDocument = {
  id: string;
  source_id: string;
  title: string;
  original_filename: string;
  storage_path: string | null;
  report_date: string;
  page_count: number | null;
  status: SourceDocumentStatus;
  current_page: number | null;
  processed_pages: number | null;
  error_message: string | null;
  total_buildings_detected: number | null;
  total_listings_detected: number | null;
  new_buildings_count: number | null;
  matched_buildings_count: number | null;
  changed_listings_count: number | null;
  warning_count: number | null;
  parser_type: ParserType | null;
  parser_version: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

// ===== Phase 6 STEP 6A: Parsing State Machine =====
// 실제 PDF 파싱 전, 문서별 분석 실행(run)과 페이지 처리 상태를 추적합니다.
export type ParsingRunStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "FAILED"
  | "CANCELLED";

export type ParsingRun = {
  id: string;
  source_document_id: string;
  parser_type: ParserType;
  parser_version: string;
  status: ParsingRunStatus;
  started_at: string | null;
  completed_at: string | null;
  current_page: number;
  processed_pages: number;
  error_page_count: number;
  total_pages: number | null;
  context_state: Record<string, unknown>;
  error_message: string | null;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceDocumentPageStatus =
  | "PENDING"
  | "PROCESSING"
  | "DONE"
  | "FAILED"
  | "SKIPPED";

export type SourceDocumentPage = {
  id: string;
  parsing_run_id: string;
  source_document_id: string;
  page_number: number;
  status: SourceDocumentPageStatus;
  attempt_count: number;
  extracted_text: string | null;
  error_message: string | null;
  warnings: unknown[];
  context_before: Record<string, unknown> | null;
  context_after: Record<string, unknown> | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};
