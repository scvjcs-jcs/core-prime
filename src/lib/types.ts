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

export type BuildingScores = {
  building_id?: string;
  location_score: number;
  transportation_score: number;
  building_quality_score: number;
  parking_score: number;
  amenities_score: number;
  corporate_image_score: number;
  employee_access_score: number;
  total_score?: number;
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
  | "hidden";

export type Listing = {
  id: string;
  listing_code: string | null;
  building_id: string;
  floor: string | null;
  gross_area: number | null;
  exclusive_area: number | null;
  efficiency_ratio: number | null;
  deposit: number | null;
  monthly_rent: number | null;
  management_fee: number | null;
  parking_spaces: number | null;
  additional_parking_fee: number | null;
  available_date: string | null;
  lease_term_months: number | null;
  interior_status: string | null;
  restoration_required: boolean;
  status: ListingStatus;
  description: string | null;
  is_featured: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};
