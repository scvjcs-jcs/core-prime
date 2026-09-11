-- =============================================================
-- CORE PRIME — Database Schema (Phase 1)
-- Supabase(PostgreSQL)의 SQL Editor에 전체를 붙여넣고 RUN 하세요.
-- 여러 번 실행해도 안전하도록 대부분 "존재하면 건너뛰기" 형태로 작성했습니다.
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- 공통: updated_at 자동 갱신 트리거 함수
-- -------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================
-- 1. districts (지역)
-- =============================================================
create table if not exists districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  slug text not null unique,
  description text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_districts_updated_at on districts;
create trigger trg_districts_updated_at
  before update on districts
  for each row execute function set_updated_at();

-- =============================================================
-- 2. buildings (건물 — 장기 유지되는 자산 데이터)
-- =============================================================
create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  building_code text unique,
  name text not null,
  name_en text,
  alias text,
  district_id uuid references districts(id) on delete set null,
  address text,
  road_address text,
  jibun_address text,
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  completion_year int,
  basement_floors int,
  above_ground_floors int,
  gross_floor_area numeric,
  land_area numeric,
  building_area numeric,
  efficiency_ratio numeric(5,2),
  parking_total int,
  parking_ratio numeric(6,2),
  elevator_count int,
  freight_elevator_count int,
  building_use text,
  hvac_type text,
  hvac_hours text,
  building_grade text,
  status text not null default 'active',
  is_featured boolean not null default false,
  is_published boolean not null default false,
  slug text not null unique,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_buildings_district_id on buildings(district_id);
create index if not exists idx_buildings_is_published on buildings(is_published);
create index if not exists idx_buildings_slug on buildings(slug);

drop trigger if exists trg_buildings_updated_at on buildings;
create trigger trg_buildings_updated_at
  before update on buildings
  for each row execute function set_updated_at();

-- =============================================================
-- 3. building_images
-- =============================================================
create table if not exists building_images (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  type text not null default 'other'
    check (type in ('exterior','lobby','office','parking','amenity','night','aerial','floor_plan','map','other')),
  url text not null,
  thumbnail_url text,
  title text,
  alt_text text,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_building_images_building_id on building_images(building_id);

-- =============================================================
-- 4. building_transportation
-- =============================================================
create table if not exists building_transportation (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  transport_type text,
  line_name text,
  station_name text,
  walk_minutes int,
  description text
);

create index if not exists idx_building_transportation_building_id on building_transportation(building_id);

-- =============================================================
-- 5. building_parking (건물당 1건)
-- =============================================================
create table if not exists building_parking (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null unique references buildings(id) on delete cascade,
  total_spaces int,
  tenant_default_spaces int,
  visitor_spaces int,
  monthly_fee bigint,
  additional_fee bigint,
  self_parking boolean default false,
  mechanical_parking boolean default false,
  ev_charging boolean default false,
  operating_hours text,
  description text
);

-- =============================================================
-- 6. building_scores (건물당 1건, Prime Score)
-- =============================================================
create table if not exists building_scores (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null unique references buildings(id) on delete cascade,
  location_score int not null default 0 check (location_score between 0 and 100),
  transportation_score int not null default 0 check (transportation_score between 0 and 100),
  building_quality_score int not null default 0 check (building_quality_score between 0 and 100),
  parking_score int not null default 0 check (parking_score between 0 and 100),
  amenities_score int not null default 0 check (amenities_score between 0 and 100),
  corporate_image_score int not null default 0 check (corporate_image_score between 0 and 100),
  employee_access_score int not null default 0 check (employee_access_score between 0 and 100),
  total_score numeric(5,2) not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Prime Score 총점 자동 계산 (7개 항목 평균)
create or replace function calc_building_total_score()
returns trigger as $$
begin
  new.total_score = round(
    (new.location_score + new.transportation_score + new.building_quality_score
     + new.parking_score + new.amenities_score + new.corporate_image_score
     + new.employee_access_score)::numeric / 7.0, 2
  );
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_building_scores_total on building_scores;
create trigger trg_building_scores_total
  before insert or update on building_scores
  for each row execute function calc_building_total_score();

-- =============================================================
-- 7. building_contents (AI 생성 콘텐츠 — Phase 4에서 본격 사용)
-- =============================================================
create table if not exists building_contents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  content_type text not null
    check (content_type in ('intro','blog','seo_desc','sns','kakao','proposal_summary')),
  body text,
  status text not null default 'draft'
    check (status in ('draft','review','approved','published')),
  created_by uuid,
  reviewed_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_building_contents_building_id on building_contents(building_id);

drop trigger if exists trg_building_contents_updated_at on building_contents;
create trigger trg_building_contents_updated_at
  before update on building_contents
  for each row execute function set_updated_at();

-- =============================================================
-- 8. listings (매물 — 수시 변경되는 운영 데이터)
-- =============================================================
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  listing_code text unique,
  building_id uuid not null references buildings(id) on delete cascade,
  floor text,
  gross_area numeric,
  exclusive_area numeric,
  efficiency_ratio numeric(5,2),
  deposit bigint,
  monthly_rent bigint,
  management_fee bigint,
  parking_spaces int,
  additional_parking_fee bigint,
  available_date date,
  lease_term_months int,
  interior_status text,
  restoration_required boolean not null default false,
  status text not null default 'available'
    check (status in ('available','negotiating','contracting','leased','hold','hidden')),
  description text,
  is_featured boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_listings_building_id on listings(building_id);
create index if not exists idx_listings_status on listings(status);

drop trigger if exists trg_listings_updated_at on listings;
create trigger trg_listings_updated_at
  before update on listings
  for each row execute function set_updated_at();

-- =============================================================
-- 9. listing_images
-- =============================================================
create table if not exists listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  url text not null,
  thumbnail_url text,
  sort_order int not null default 0
);

create index if not exists idx_listing_images_listing_id on listing_images(listing_id);

-- =============================================================
-- 10. customers (Phase 3에서 본격 사용)
-- =============================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  contact_name text not null,
  phone text,
  email text,
  headcount int,
  inquiry_channel text,
  status text not null default 'NEW'
    check (status in ('NEW','CONSULTING','PROPOSAL','VISIT','NEGOTIATION','CONTRACT','COMPLETED','HOLD','CLOSED')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_status on customers(status);

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- =============================================================
-- 11. customer_requirements
-- =============================================================
create table if not exists customer_requirements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  preferred_district uuid references districts(id) on delete set null,
  min_exclusive_area numeric,
  max_exclusive_area numeric,
  min_budget bigint,
  max_budget bigint,
  move_in_date date,
  required_parking int,
  preferred_grade text,
  preferred_age int,
  etc_notes text
);

-- =============================================================
-- 12. proposals
-- =============================================================
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_code text unique,
  customer_id uuid not null references customers(id) on delete cascade,
  title text,
  status text not null default 'draft',
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proposals_public_token on proposals(public_token);

drop trigger if exists trg_proposals_updated_at on proposals;
create trigger trg_proposals_updated_at
  before update on proposals
  for each row execute function set_updated_at();

-- =============================================================
-- 13. proposal_buildings
-- =============================================================
create table if not exists proposal_buildings (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  recommendation_rank int,
  recommendation_reason text,
  pros text,
  cons text
);

-- =============================================================
-- 14. admins
-- 비밀번호는 Supabase Auth(로그인 시스템)가 안전하게 암호화하여 별도 보관하므로
-- 이 테이블에는 비밀번호를 저장하지 않습니다. id는 Supabase Auth 사용자 id와 동일합니다.
-- =============================================================
create table if not exists admins (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'ADMIN' check (role in ('SUPER_ADMIN','ADMIN','EDITOR')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 15. site_settings
-- =============================================================
create table if not exists site_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on site_settings;
create trigger trg_site_settings_updated_at
  before update on site_settings
  for each row execute function set_updated_at();

-- =============================================================
-- 권한 확인 헬퍼 함수 (RLS 정책에서 사용)
-- =============================================================
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from admins where id = auth.uid() and is_active = true
  );
$$ language sql stable security definer set search_path = public;

create or replace function is_super_admin()
returns boolean as $$
  select exists (
    select 1 from admins where id = auth.uid() and is_active = true and role = 'SUPER_ADMIN'
  );
$$ language sql stable security definer set search_path = public;

-- =============================================================
-- RLS (Row Level Security) 활성화 + 정책
-- =============================================================
alter table districts enable row level security;
alter table buildings enable row level security;
alter table building_images enable row level security;
alter table building_transportation enable row level security;
alter table building_parking enable row level security;
alter table building_scores enable row level security;
alter table building_contents enable row level security;
alter table listings enable row level security;
alter table listing_images enable row level security;
alter table customers enable row level security;
alter table customer_requirements enable row level security;
alter table proposals enable row level security;
alter table proposal_buildings enable row level security;
alter table admins enable row level security;
alter table site_settings enable row level security;

-- districts: 공개된 지역은 누구나 조회, 관리자는 전체 조회/수정
drop policy if exists districts_public_select on districts;
create policy districts_public_select on districts
  for select using (is_published = true or is_admin());
drop policy if exists districts_admin_write on districts;
create policy districts_admin_write on districts
  for all using (is_admin()) with check (is_admin());

-- buildings: 공개된 건물은 누구나 조회, 관리자는 전체 조회/수정
drop policy if exists buildings_public_select on buildings;
create policy buildings_public_select on buildings
  for select using (is_published = true or is_admin());
drop policy if exists buildings_admin_write on buildings;
create policy buildings_admin_write on buildings
  for all using (is_admin()) with check (is_admin());

-- 아래 하위 테이블들은 Phase 1에서는 관리자만 접근 (공개 페이지 연결은 Phase 2에서 진행)
drop policy if exists building_images_admin_all on building_images;
create policy building_images_admin_all on building_images
  for all using (is_admin()) with check (is_admin());

drop policy if exists building_transportation_admin_all on building_transportation;
create policy building_transportation_admin_all on building_transportation
  for all using (is_admin()) with check (is_admin());

drop policy if exists building_parking_admin_all on building_parking;
create policy building_parking_admin_all on building_parking
  for all using (is_admin()) with check (is_admin());

drop policy if exists building_scores_admin_all on building_scores;
create policy building_scores_admin_all on building_scores
  for all using (is_admin()) with check (is_admin());

drop policy if exists building_contents_admin_all on building_contents;
create policy building_contents_admin_all on building_contents
  for all using (is_admin()) with check (is_admin());

drop policy if exists listings_admin_all on listings;
create policy listings_admin_all on listings
  for all using (is_admin()) with check (is_admin());

drop policy if exists listing_images_admin_all on listing_images;
create policy listing_images_admin_all on listing_images
  for all using (is_admin()) with check (is_admin());

drop policy if exists customers_admin_all on customers;
create policy customers_admin_all on customers
  for all using (is_admin()) with check (is_admin());

drop policy if exists customer_requirements_admin_all on customer_requirements;
create policy customer_requirements_admin_all on customer_requirements
  for all using (is_admin()) with check (is_admin());

drop policy if exists proposals_admin_all on proposals;
create policy proposals_admin_all on proposals
  for all using (is_admin()) with check (is_admin());

drop policy if exists proposal_buildings_admin_all on proposal_buildings;
create policy proposal_buildings_admin_all on proposal_buildings
  for all using (is_admin()) with check (is_admin());

-- admins: 본인 정보는 조회 가능, SUPER_ADMIN만 관리자 계정 관리 가능
drop policy if exists admins_self_select on admins;
create policy admins_self_select on admins
  for select using (id = auth.uid() or is_super_admin());
drop policy if exists admins_super_admin_write on admins;
create policy admins_super_admin_write on admins
  for insert with check (is_super_admin());
drop policy if exists admins_super_admin_update on admins;
create policy admins_super_admin_update on admins
  for update using (is_super_admin()) with check (is_super_admin());
drop policy if exists admins_super_admin_delete on admins;
create policy admins_super_admin_delete on admins
  for delete using (is_super_admin());

-- site_settings: 관리자만
drop policy if exists site_settings_admin_all on site_settings;
create policy site_settings_admin_all on site_settings
  for all using (is_admin()) with check (is_admin());

-- =============================================================
-- 초기 데이터: 11개 업무권역(districts) 시드
-- =============================================================
insert into districts (name, name_en, slug, is_published) values
  ('강남', 'Gangnam', 'gangnam', true),
  ('삼성', 'Samseong', 'samseong', true),
  ('역삼', 'Yeoksam', 'yeoksam', true),
  ('선릉', 'Seolleung', 'seolleung', true),
  ('여의도', 'Yeouido', 'yeouido', true),
  ('광화문', 'Gwanghwamun', 'gwanghwamun', true),
  ('종로', 'Jongno', 'jongno', true),
  ('성수', 'Seongsu', 'seongsu', true),
  ('용산', 'Yongsan', 'yongsan', true),
  ('마포', 'Mapo', 'mapo', true),
  ('판교', 'Pangyo', 'pangyo', true)
on conflict (slug) do nothing;

-- 완료: 여기까지 실행되면 스키마 준비가 끝난 것입니다.
