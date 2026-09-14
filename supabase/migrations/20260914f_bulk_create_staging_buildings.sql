-- CORE PRIME: safe bulk creation of NEW_CANDIDATE staging buildings.
-- Existing/review-required candidates are never blindly created.

create or replace function public.bulk_create_buildings_from_staging(
  p_source_document_id uuid,
  p_staging_building_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.staging_buildings%rowtype;
  v_id uuid;
  v_existing uuid;
  v_existing_count int;
  v_slug text;
  v_parking int;
  v_created int := 0;
  v_linked_existing int := 0;
  v_skipped_review int := 0;
  v_already_matched int := 0;
  v_failed int := 0;
  v_failed_ids jsonb := '[]'::jsonb;
  v_norm text;
  v_addr text;
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_source_document_id is null or p_staging_building_ids is null or cardinality(p_staging_building_ids)=0 then
    raise exception '일괄 등록할 건물을 선택해 주세요.';
  end if;

  if cardinality(p_staging_building_ids) > 300 then
    raise exception '한 번에 최대 300개까지 처리할 수 있습니다.';
  end if;

  -- 같은 자료에서 두 관리자/두 브라우저 탭이 동시에 일괄등록해도
  -- 중복 건물이 생성되지 않도록 source_document 단위로 직렬화한다.
  perform pg_advisory_xact_lock(hashtext('bulk_create_buildings_from_staging:' || p_source_document_id::text));

  for s in
    select *
      from public.staging_buildings
     where id = any(p_staging_building_ids)
       and source_document_id = p_source_document_id
     order by primary_source_page, created_at
     for update
  loop
    if s.matched_building_id is not null then
      v_already_matched := v_already_matched + 1;
      continue;
    end if;

    -- Fuzzy/review candidates must be resolved by a human. Only safe NEW_CANDIDATE rows are bulk-created.
    if coalesce(s.match_status,'') <> 'NEW_CANDIDATE' then
      v_skipped_review := v_skipped_review + 1;
      continue;
    end if;

    if coalesce(trim(s.raw_building_name),'') = '' then
      v_failed := v_failed + 1;
      v_failed_ids := v_failed_ids || jsonb_build_array(s.id);
      continue;
    end if;

    v_norm := nullif(trim(coalesce(s.normalized_building_name,'')), '');
    v_addr := nullif(trim(coalesce(s.extracted_data->'road_address'->>'value','')), '');

    -- 등록 직전 canonical 중복 재검사.
    -- 1) 도로명주소가 있으면 주소 일치를 가장 강한 키로 사용한다.
    -- 2) 주소가 없는 staging만 normalized_name 단독 자동연결을 허용한다.
    --    주소가 있는데 서로 다른 경우, 같은 이름만으로 자동연결하면 동명이건물 오매칭 위험이 있다.
    v_existing := null;
    v_existing_count := 0;

    if v_addr is not null then
      select count(*)
        into v_existing_count
        from public.buildings
       where deleted_at is null
         and trim(coalesce(road_address,'')) = v_addr;

      select id
        into v_existing
        from public.buildings
       where deleted_at is null
         and trim(coalesce(road_address,'')) = v_addr
       order by id::text
       limit 1;

      -- 주소 일치는 없지만 같은 이름의 기존 건물이 있으면 자동 생성하지 않고 검토로 보낸다.
      if v_existing_count = 0 and v_norm is not null and exists (
        select 1 from public.buildings
         where deleted_at is null and normalized_name = v_norm
      ) then
        update public.staging_buildings
           set match_status='REVIEW_REQUIRED',
               match_reason='동일 건물명이 있으나 도로명주소가 달라 관리자 확인 필요'
         where id=s.id;
        v_skipped_review := v_skipped_review + 1;
        continue;
      end if;
    elsif v_norm is not null then
      select count(*)
        into v_existing_count
        from public.buildings
       where deleted_at is null
         and normalized_name = v_norm;

      select id
        into v_existing
        from public.buildings
       where deleted_at is null
         and normalized_name = v_norm
       order by id::text
       limit 1;
    end if;

    if v_existing_count = 1 and v_existing is not null then
      update public.staging_buildings
         set matched_building_id=v_existing,
             match_status='AUTO_MATCHED',
             match_score=1,
             match_reason='일괄 신규등록 직전 중복 재검사로 기존 건물 연결'
       where id=s.id;
      update public.staging_listings set matched_building_id=v_existing where staging_building_id=s.id;
      v_linked_existing := v_linked_existing + 1;
      continue;
    elsif v_existing_count > 1 then
      update public.staging_buildings
         set match_status='REVIEW_REQUIRED',
             match_reason='일괄 신규등록 직전 중복 재검사에서 복수 기존 건물 후보 발견'
       where id=s.id;
      v_skipped_review := v_skipped_review + 1;
      continue;
    end if;

    begin
      v_slug := 'import-' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
      insert into public.buildings(
        name,normalized_name,road_address,address,completion_year,gross_floor_area,
        above_ground_floors,basement_floors,efficiency_ratio,elevator_count,
        building_use,slug,is_published,status,data_last_verified_at
      ) values(
        s.raw_building_name,s.normalized_building_name,
        s.extracted_data->'road_address'->>'value',s.extracted_data->'road_address'->>'value',
        case when coalesce(s.extracted_data->'completion_year'->>'value','') ~ '^\d{4}$' then (s.extracted_data->'completion_year'->>'value')::int else null end,
        case when replace(coalesce(s.extracted_data->'gross_floor_area_sqm'->>'value',''),',','') ~ '^\d+(\.\d+)?$' then replace(s.extracted_data->'gross_floor_area_sqm'->>'value',',','')::numeric else null end,
        case when coalesce(s.extracted_data->'above_ground_floors'->>'value','') ~ '^\d+$' then (s.extracted_data->'above_ground_floors'->>'value')::int else null end,
        case when coalesce(s.extracted_data->'basement_floors'->>'value','') ~ '^\d+$' then (s.extracted_data->'basement_floors'->>'value')::int else null end,
        case when replace(coalesce(s.extracted_data->'efficiency_ratio'->>'value',''),',','') ~ '^\d+(\.\d+)?$' then replace(s.extracted_data->'efficiency_ratio'->>'value',',','')::numeric else null end,
        case when coalesce(s.extracted_data->'passenger_elevators'->>'value','') ~ '^\d+$' then (s.extracted_data->'passenger_elevators'->>'value')::int else null end,
        s.extracted_data->'building_use'->>'value',v_slug,false,'active',now()
      ) returning id into v_id;

      v_parking := case when coalesce(s.extracted_data->'parking_total'->>'value','') ~ '^\d+$' then (s.extracted_data->'parking_total'->>'value')::int else null end;
      if v_parking is not null then
        insert into public.building_parking(building_id,total_spaces) values(v_id,v_parking)
        on conflict(building_id) do update set total_spaces=excluded.total_spaces;
      end if;

      update public.staging_buildings
         set matched_building_id=v_id,match_status='MANUAL_MATCHED',match_score=1,
             match_reason='신규 후보 일괄등록(비공개)'
       where id=s.id;
      update public.staging_listings set matched_building_id=v_id where staging_building_id=s.id;

      insert into public.audit_logs(actor_type,actor_id,entity_type,entity_id,action,after_data)
      values('ADMIN',auth.uid(),'building',v_id,'CREATE',jsonb_build_object(
        'source','STAGING_IMPORT_BULK',
        'staging_building_id',s.id,
        'source_document_id',p_source_document_id,
        'is_published',false
      ));
      v_created := v_created + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_failed_ids := v_failed_ids || jsonb_build_array(s.id);
    end;
  end loop;

  update public.source_documents d
     set matched_buildings_count=(select count(*) from public.staging_buildings sb where sb.source_document_id=p_source_document_id and sb.matched_building_id is not null),
         new_buildings_count=(select count(*) from public.staging_buildings sb where sb.source_document_id=p_source_document_id and sb.match_status='NEW_CANDIDATE' and sb.matched_building_id is null)
   where d.id=p_source_document_id;

  return jsonb_build_object(
    'created',v_created,
    'linked_existing',v_linked_existing,
    'skipped_review',v_skipped_review,
    'already_matched',v_already_matched,
    'failed',v_failed,
    'failed_ids',v_failed_ids
  );
end $$;

revoke all on function public.bulk_create_buildings_from_staging(uuid,uuid[]) from public;
grant execute on function public.bulk_create_buildings_from_staging(uuid,uuid[]) to authenticated;
