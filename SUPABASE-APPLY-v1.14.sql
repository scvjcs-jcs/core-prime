-- CORE PRIME v1.14 - CBRE 건물 기본정보 확장
-- 기존 값을 삭제/변경하지 않고, 상세 건물정보용 컬럼만 추가합니다.

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
