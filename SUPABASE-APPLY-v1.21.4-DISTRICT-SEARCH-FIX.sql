-- CORE PRIME v1.21.4
-- 업무권역 검색 안정화
-- 1) 기존 import 건물의 비어 있는 district_id 자동 보정
-- 2) 앞으로 신규/수정 건물에서 district_id가 비어 있으면 주소/건물명으로 자동 추론
-- 수동으로 지정된 district_id는 절대 덮어쓰지 않습니다.

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
  -- 더 구체적인 권역을 먼저 판정합니다.
  if v_text ~ '(역삼동|역삼역|역삼)' then
    v_slug := 'yeoksam';
  elsif v_text ~ '(삼성동|삼성역|코엑스|봉은사)' then
    v_slug := 'samseong';
  elsif v_text ~ '(선릉역|선릉|대치동)' then
    v_slug := 'seolleung';
  elsif v_text ~ '(여의도동|여의도)' then
    v_slug := 'yeouido';
  elsif v_text ~ '(광화문|세종대로|새문안로|신문로|도렴동|내수동|중학동)' then
    v_slug := 'gwanghwamun';
  elsif v_text ~ '(종로구|종로[0-9]*가|율곡로|삼일대로)' then
    v_slug := 'jongno';
  elsif v_text ~ '(성수동|성수)' then
    v_slug := 'seongsu';
  elsif v_text ~ '(용산구|한강대로|이태원로)' then
    v_slug := 'yongsan';
  elsif v_text ~ '(마포구|마포대로|공덕동|상암동)' then
    v_slug := 'mapo';
  elsif v_text ~ '(판교|삼평동|백현동|대왕판교로)' then
    v_slug := 'pangyo';
  elsif v_text ~ '(강남구|테헤란로|도산대로|학동로|언주로|영동대로)' then
    v_slug := 'gangnam';
  else
    return null;
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

-- 기존 데이터 보정: district_id가 비어 있는 건물만 채웁니다.
update public.buildings b
   set district_id = public.infer_building_district_id(b.name, b.road_address, b.address)
 where b.deleted_at is null
   and b.district_id is null
   and public.infer_building_district_id(b.name, b.road_address, b.address) is not null;

-- 점검용 결과: 실행 후 아래 숫자를 확인할 수 있습니다.
select
  count(*) filter (where deleted_at is null) as total_buildings,
  count(*) filter (where deleted_at is null and district_id is not null) as mapped_buildings,
  count(*) filter (where deleted_at is null and district_id is null) as unmapped_buildings
from public.buildings;
