-- CORE PRIME v1.22.1 · 검색/공개준비/콘텐츠센터 통합 SQL
-- 재실행 안전: 이미 v1.21.4 권역 SQL을 실행했어도 다시 실행 가능합니다.

-- ============================================================
-- 1) 업무권역 자동 추론 / 기존 누락 보정
-- ============================================================
create or replace function public.infer_building_district_id(
  p_name text,
  p_road_address text,
  p_address text
)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text := lower(concat_ws(' ', coalesce(p_name,''), coalesce(p_road_address,''), coalesce(p_address,'')));
  v_slug text;
  v_id uuid;
begin
  if v_text ~ '(역삼동|역삼역|역삼)' then v_slug := 'yeoksam';
  elsif v_text ~ '(삼성동|삼성역|코엑스|봉은사)' then v_slug := 'samseong';
  elsif v_text ~ '(선릉역|선릉|대치동)' then v_slug := 'seolleung';
  elsif v_text ~ '(여의도동|여의도)' then v_slug := 'yeouido';
  elsif v_text ~ '(광화문|세종대로|새문안로|신문로|도렴동|내수동|중학동)' then v_slug := 'gwanghwamun';
  elsif v_text ~ '(종로구|종로[0-9]*가|율곡로|삼일대로)' then v_slug := 'jongno';
  elsif v_text ~ '(성수동|성수)' then v_slug := 'seongsu';
  elsif v_text ~ '(용산구|한강대로|이태원로)' then v_slug := 'yongsan';
  elsif v_text ~ '(마포구|마포대로|공덕동|상암동)' then v_slug := 'mapo';
  elsif v_text ~ '(판교|삼평동|백현동|대왕판교로)' then v_slug := 'pangyo';
  elsif v_text ~ '(강남구|테헤란로|도산대로|학동로|언주로|영동대로)' then v_slug := 'gangnam';
  else return null;
  end if;

  select id into v_id
    from public.districts
   where slug = v_slug
     and is_published = true
   limit 1;
  return v_id;
end;
$$;

create or replace function public.set_building_district_if_missing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.district_id is null then
    new.district_id := public.infer_building_district_id(new.name, new.road_address, new.address);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_buildings_infer_district on public.buildings;
create trigger trg_buildings_infer_district
before insert or update of name, road_address, address, district_id
on public.buildings
for each row
execute function public.set_building_district_if_missing();

update public.buildings b
   set district_id = public.infer_building_district_id(b.name, b.road_address, b.address)
 where b.deleted_at is null
   and b.district_id is null
   and public.infer_building_district_id(b.name, b.road_address, b.address) is not null;

-- ============================================================
-- 2) 네이버 블로그 콘텐츠센터 컬럼/인덱스
-- ============================================================
alter table public.building_contents add column if not exists title text;
alter table public.building_contents add column if not exists platform text;
alter table public.building_contents add column if not exists template_key text;
alter table public.building_contents add column if not exists tags text[] not null default '{}';
alter table public.building_contents add column if not exists published_url text;
alter table public.building_contents add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

create index if not exists idx_building_contents_platform_status on public.building_contents(platform, status);
create index if not exists idx_building_contents_published_at on public.building_contents(published_at desc);

comment on column public.building_contents.platform is '콘텐츠 대상 플랫폼. v1.22: naver_blog';
comment on column public.building_contents.template_key is 'building_intro / vacancy_update / comparison';
comment on column public.building_contents.source_snapshot is '원고 생성 당시 검증 데이터 기준과 건물/공실 참조 스냅샷';

-- ============================================================
-- 3) 실행 직후 확인용 집계
-- ============================================================
select
  count(*) filter (where deleted_at is null) as total_buildings,
  count(*) filter (where deleted_at is null and is_published = true) as published_buildings,
  count(*) filter (where deleted_at is null and is_published = false) as private_buildings,
  count(*) filter (where deleted_at is null and district_id is not null) as mapped_buildings,
  count(*) filter (where deleted_at is null and district_id is null) as unmapped_buildings
from public.buildings;
