-- CORE PRIME v1.12 — Prime Score 자동추천 + 관리자 확정
-- 기존 building_scores 값은 변경하지 않습니다.

create table if not exists prime_score_recommendations (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null unique references buildings(id) on delete cascade,
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

alter table prime_score_recommendations enable row level security;

drop policy if exists prime_score_recommendations_admin_all on prime_score_recommendations;
create policy prime_score_recommendations_admin_all on prime_score_recommendations
  for all using (is_admin()) with check (is_admin());

grant select, insert, update, delete on prime_score_recommendations to authenticated;

create index if not exists idx_prime_score_recommendations_building_id
  on prime_score_recommendations(building_id);
