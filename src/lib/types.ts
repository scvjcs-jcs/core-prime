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
