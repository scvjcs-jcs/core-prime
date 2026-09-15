-- CORE PRIME v1.15.1 Morning Integrated Apply
-- Applies DB changes introduced from v1.12 through v1.15.
-- v1.13 and v1.15 require no DB schema changes.
-- Safe to run more than once: objects/columns use IF NOT EXISTS and policy is recreated.

begin;

-- ============================================================
-- v1.12 — Prime Score recommendation assistant
-- ============================================================
create table if not exists public.prime_score_recommendations (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null unique references public.buildings(id) on delete cascade,
  location_score int not null check (location_score between 0 and 100),
  transportation_score int not null check (transportation_score between 0 and 100),
  building_quality_score int not null check (building_quality_score between 0 and 100),
  parking_score int not null check (parking_score between 0 and 100),
  amenities_score int not null check (amenities_score between 0 and 100),
  corporate_image_score int not null check (corporate_image_score between 0 and 100),
  employee_access_score int not null check (employee_access_score between 0 and 100),
  total_score numeric(5,2) not null check (total_score between 0 and 100),
  confidence int not null check (confidence between 0 and 100),
  coverage int not null check (coverage between 0 and 100),
  algorithm_version text not null,
  reasons jsonb not null default '{}'::jsonb,
  inputs_snapshot jsonb not null default '{}'::jsonb,
  generated_by uuid,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prime_score_recommendations enable row level security;

drop policy if exists prime_score_recommendations_admin_all on public.prime_score_recommendations;
create policy prime_score_recommendations_admin_all on public.prime_score_recommendations
  for all using (is_admin()) with check (is_admin());

grant select, insert, update, delete on public.prime_score_recommendations to authenticated;

create index if not exists idx_prime_score_recommendations_building_id
  on public.prime_score_recommendations(building_id);

-- ============================================================
-- v1.14 — CBRE building facts enrichment
-- ============================================================
alter table public.buildings
  add column if not exists completion_month int,
  add column if not exists elevator_detail text,
  add column if not exists typical_floor_leasable_area_sqm numeric,
  add column if not exists typical_floor_leasable_area_py numeric,
  add column if not exists typical_floor_exclusive_area_sqm numeric,
  add column if not exists typical_floor_exclusive_area_py numeric;

alter table public.building_parking
  add column if not exists free_parking_text text,
  add column if not exists paid_parking_text text;

comment on column public.buildings.elevator_detail is '원본 임대자료의 엘리베이터 구성 설명';
comment on column public.buildings.typical_floor_leasable_area_sqm is '기준층 임대면적 ㎡';
comment on column public.buildings.typical_floor_leasable_area_py is '기준층 임대면적 평';
comment on column public.buildings.typical_floor_exclusive_area_sqm is '기준층 전용면적 ㎡';
comment on column public.buildings.typical_floor_exclusive_area_py is '기준층 전용면적 평';
comment on column public.building_parking.free_parking_text is '원본 자료 무료주차 조건';
comment on column public.building_parking.paid_parking_text is '원본 자료 유료주차 조건';

commit;
