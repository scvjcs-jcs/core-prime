-- CORE PRIME FINAL ONE-TIME APPLY
-- Prerequisite: STEP 6A + STEP 6B-1 already applied to the live Supabase DB.
-- Applies STEP 6B-2 + STEP 7 + final review/publish workflow in one transaction.
begin;
-- STEP 6B-2: NAI Parser 결과를 staging에 원자적으로 교체 저장.
create or replace function public.replace_nai_staging_results(
  p_source_document_id uuid,
  p_parsing_run_id uuid,
  p_parser_version text,
  p_buildings jsonb,
  p_warning_count integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b jsonb; v_l jsonb; v_bid uuid; v_bc int := 0; v_lc int := 0;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_parser_version not like 'NAI-%' then raise exception '지원하지 않는 NAI parser version입니다.'; end if;
  if not exists (
    select 1 from public.parsing_runs r where r.id=p_parsing_run_id and r.source_document_id=p_source_document_id
      and r.parser_type='NAI' and r.parser_version='TEXT-EXTRACT-v1.0.0' and r.status='COMPLETED'
  ) then raise exception '완료된 NAI PDF Text Extraction Run이 필요합니다.'; end if;

  delete from public.staging_listings where parsing_run_id=p_parsing_run_id;
  delete from public.staging_buildings where parsing_run_id=p_parsing_run_id;

  for v_b in select * from jsonb_array_elements(coalesce(p_buildings,'[]'::jsonb)) loop
    insert into public.staging_buildings(
      source_document_id, parsing_run_id, raw_building_name, normalized_building_name,
      primary_source_page, extracted_data, matched_building_id, match_status, review_status
    ) values (
      p_source_document_id, p_parsing_run_id, v_b->>'raw_building_name', v_b->>'normalized_building_name',
      nullif(v_b->>'primary_source_page','')::int, coalesce(v_b->'extracted_data','{}'::jsonb), null, 'UNMATCHED', 'PENDING'
    ) returning id into v_bid;
    v_bc := v_bc + 1;
    for v_l in select * from jsonb_array_elements(coalesce(v_b->'listings','[]'::jsonb)) loop
      insert into public.staging_listings(
        staging_building_id, parsing_run_id, floor, unit, source_page, extracted_data,
        change_type, review_status, matched_building_id, matched_listing_id
      ) values (
        v_bid, p_parsing_run_id, nullif(v_l->>'floor',''), nullif(v_l->>'unit',''),
        nullif(v_l->>'source_page','')::int, coalesce(v_l->'extracted_data','{}'::jsonb),
        'UNCLASSIFIED','PENDING',null,null
      );
      v_lc := v_lc + 1;
    end loop;
  end loop;

  update public.source_documents set total_buildings_detected=v_bc, total_listings_detected=v_lc,
    warning_count=coalesce(p_warning_count,0), parser_version=p_parser_version where id=p_source_document_id;
  return jsonb_build_object('buildings',v_bc,'listings',v_lc,'warnings',coalesce(p_warning_count,0));
end; $$;
revoke all on function public.replace_nai_staging_results(uuid,uuid,text,jsonb,integer) from public;
grant execute on function public.replace_nai_staging_results(uuid,uuid,text,jsonb,integer) to authenticated;

-- STEP 7: staging_buildings match_status를 명확한 4단계로 통일합니다.
-- 기존 데이터가 있으면 현재 값도 확인 후 적용하세요. STEP 6B-2 기본값 UNMATCHED는 그대로 허용됩니다.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.staging_buildings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%match_status%'
  loop
    execute format('alter table public.staging_buildings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.staging_buildings
  add constraint staging_buildings_match_status_check
  check (match_status in ('UNMATCHED','AUTO_MATCHED','REVIEW_REQUIRED','NEW_CANDIDATE','MATCHED','MANUAL_MATCHED','AMBIGUOUS','REVIEW_NEEDED'));

create index if not exists idx_staging_buildings_match_status
  on public.staging_buildings(parsing_run_id, match_status);

-- CORE PRIME final workflow: generic semantic staging + listing diff + reviewed publish.
-- Prerequisite: STEP 6A/6B-1 infrastructure and STEP 6B-2/7 migrations.

create or replace function public.replace_semantic_staging_results(
  p_source_document_id uuid,
  p_parsing_run_id uuid,
  p_parser_version text,
  p_buildings jsonb,
  p_warning_count integer default 0
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_b jsonb; v_l jsonb; v_bid uuid; v_bc int:=0; v_lc int:=0;
  v_parser text;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select parser_type into v_parser from public.parsing_runs
   where id=p_parsing_run_id and source_document_id=p_source_document_id
     and parser_version='TEXT-EXTRACT-v1.0.0' and status='COMPLETED';
  if v_parser is null then raise exception '완료된 PDF Text Extraction Run이 필요합니다.'; end if;
  if (v_parser='NAI' and p_parser_version not like 'NAI-%')
     or (v_parser='CBRE' and p_parser_version not like 'CBRE-%')
     or (v_parser='CW' and p_parser_version not like 'CW-%') then
    raise exception '문서 Parser Type과 semantic parser가 일치하지 않습니다.';
  end if;

  delete from public.staging_listings where parsing_run_id=p_parsing_run_id;
  delete from public.staging_buildings where parsing_run_id=p_parsing_run_id;

  for v_b in select * from jsonb_array_elements(coalesce(p_buildings,'[]'::jsonb)) loop
    insert into public.staging_buildings(
      source_document_id,parsing_run_id,raw_building_name,normalized_building_name,
      primary_source_page,extracted_data,matched_building_id,match_status,review_status
    ) values(
      p_source_document_id,p_parsing_run_id,v_b->>'raw_building_name',v_b->>'normalized_building_name',
      nullif(v_b->>'primary_source_page','')::int,coalesce(v_b->'extracted_data','{}'::jsonb),null,'UNMATCHED','PENDING'
    ) returning id into v_bid;
    v_bc:=v_bc+1;
    for v_l in select * from jsonb_array_elements(coalesce(v_b->'listings','[]'::jsonb)) loop
      insert into public.staging_listings(
        staging_building_id,parsing_run_id,floor,unit,source_page,extracted_data,
        change_type,review_status,matched_building_id,matched_listing_id
      ) values(
        v_bid,p_parsing_run_id,nullif(v_l->>'floor',''),nullif(v_l->>'unit',''),
        nullif(v_l->>'source_page','')::int,coalesce(v_l->'extracted_data','{}'::jsonb),
        'UNCLASSIFIED','PENDING',null,null
      );
      v_lc:=v_lc+1;
    end loop;
  end loop;

  update public.source_documents set total_buildings_detected=v_bc,total_listings_detected=v_lc,
    warning_count=coalesce(p_warning_count,0),parser_version=p_parser_version,status='REVIEW_REQUIRED'
    where id=p_source_document_id;
  return jsonb_build_object('buildings',v_bc,'listings',v_lc,'warnings',coalesce(p_warning_count,0));
end $$;
revoke all on function public.replace_semantic_staging_results(uuid,uuid,text,jsonb,integer) from public;
grant execute on function public.replace_semantic_staging_results(uuid,uuid,text,jsonb,integer) to authenticated;

create or replace function public.set_staging_building_match(
  p_staging_building_id uuid,
  p_building_id uuid
) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if not exists(select 1 from public.buildings where id=p_building_id and deleted_at is null) then
    raise exception '유효한 건물을 찾을 수 없습니다.';
  end if;
  update public.staging_buildings set matched_building_id=p_building_id,match_status='MANUAL_MATCHED',match_score=1,match_reason='관리자 수동 매칭'
    where id=p_staging_building_id;
  if not found then raise exception 'Staging 건물을 찾을 수 없습니다.'; end if;
  update public.staging_listings sl set matched_building_id=p_building_id
   where sl.staging_building_id=p_staging_building_id;
end $$;
revoke all on function public.set_staging_building_match(uuid,uuid) from public;
grant execute on function public.set_staging_building_match(uuid,uuid) to authenticated;

create or replace function public.classify_import_listing_diff(p_source_document_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_run uuid; v_source uuid; r record; b record; c record; v_count int; v_listing uuid; v_same boolean;
  v_new int:=0; v_updated int:=0; v_unchanged int:=0; v_conflict int:=0; v_removed int:=0;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select source_id into v_source from public.source_documents where id=p_source_document_id;
  select id into v_run from public.parsing_runs where source_document_id=p_source_document_id and parser_version='TEXT-EXTRACT-v1.0.0'
   order by created_at desc limit 1;
  if v_run is null then raise exception 'Extraction Run을 찾을 수 없습니다.'; end if;

  -- 재실행 시 시스템이 만든 POSSIBLY_REMOVED 행만 지워 idempotent하게 재생성한다.
  delete from public.staging_listings
   where parsing_run_id=v_run and change_type='POSSIBLY_REMOVED'
     and extracted_data->>'_system_generated'='true';

  update public.staging_listings sl set matched_building_id=sb.matched_building_id
  from public.staging_buildings sb where sl.staging_building_id=sb.id and sl.parsing_run_id=v_run;

  for r in select * from public.staging_listings where parsing_run_id=v_run loop
    if r.matched_building_id is null then
      update public.staging_listings set change_type='CONFLICT',matched_listing_id=null where id=r.id;
      v_conflict:=v_conflict+1; continue;
    end if;
    select count(*),(array_agg(id))[1] into v_count,v_listing from public.listings
      where building_id=r.matched_building_id and lower(coalesce(floor,''))=lower(coalesce(r.floor,''))
        and lower(coalesce(unit,''))=lower(coalesce(r.unit,'')) and status<>'expired';
    if v_count=0 then
      update public.staging_listings set change_type='NEW',matched_listing_id=null where id=r.id; v_new:=v_new+1;
    elsif v_count>1 then
      update public.staging_listings set change_type='CONFLICT',matched_listing_id=null where id=r.id; v_conflict:=v_conflict+1;
    else
      select
        coalesce(gross_area_py,0)=coalesce(nullif(r.extracted_data->'gross_area_py'->>'value','')::numeric,0)
        and coalesce(exclusive_area_py,0)=coalesce(nullif(r.extracted_data->'exclusive_area_py'->>'value','')::numeric,0)
        and coalesce(deposit_per_py,0)=coalesce(nullif(r.extracted_data->'deposit_per_py'->>'value','')::bigint,0)
        and coalesce(rent_per_py,0)=coalesce(nullif(r.extracted_data->'rent_per_py'->>'value','')::bigint,0)
        and coalesce(maintenance_per_py,0)=coalesce(nullif(r.extracted_data->'maintenance_per_py'->>'value','')::bigint,0)
        and coalesce(move_in_text,'')=coalesce(r.extracted_data->'move_in_text'->>'value','')
      into v_same from public.listings where id=v_listing;
      if v_same then
        update public.staging_listings set change_type='UNCHANGED',matched_listing_id=v_listing where id=r.id; v_unchanged:=v_unchanged+1;
      else
        update public.staging_listings set change_type='UPDATED',matched_listing_id=v_listing where id=r.id; v_updated:=v_updated+1;
      end if;
    end if;
  end loop;

  -- 같은 출처에서 이전에 관측되었지만 이번 자료에 보이지 않는 공실은 삭제하지 않고 POSSIBLY_REMOVED로 만든다.
  for b in select id, matched_building_id from public.staging_buildings where parsing_run_id=v_run and matched_building_id is not null loop
    for c in
      select l.* from public.listings l
       where l.building_id=b.matched_building_id and l.source_id=v_source
         and l.status in ('available','negotiating','contracting','hold')
         and not exists (
           select 1 from public.staging_listings sl
            where sl.parsing_run_id=v_run and sl.matched_listing_id=l.id
         )
    loop
      insert into public.staging_listings(
        staging_building_id,parsing_run_id,floor,unit,source_page,extracted_data,
        change_type,review_status,matched_building_id,matched_listing_id
      ) values(
        b.id,v_run,c.floor,c.unit,null,
        jsonb_build_object(
          '_system_generated','true',
          '_reason','이전 자료에는 있었지만 이번 자료에서 확인되지 않음',
          '_previous',jsonb_build_object(
            'gross_area_py',c.gross_area_py,
            'exclusive_area_py',c.exclusive_area_py,
            'rent_per_py',c.rent_per_py,
            'maintenance_per_py',c.maintenance_per_py
          )
        ),
        'POSSIBLY_REMOVED','PENDING',c.building_id,c.id
      );
      v_removed:=v_removed+1;
    end loop;
  end loop;

  update public.source_documents set changed_listings_count=v_updated+v_new+v_removed where id=p_source_document_id;
  return jsonb_build_object('new',v_new,'updated',v_updated,'unchanged',v_unchanged,'conflict',v_conflict,'possibly_removed',v_removed);
end $$;
revoke all on function public.classify_import_listing_diff(uuid) from public;
grant execute on function public.classify_import_listing_diff(uuid) to authenticated;

create or replace function public.resolve_possible_removal(
  p_staging_listing_id uuid,
  p_resolution text
) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_resolution not in ('KEEP','EXPIRED','LEASED','HIDDEN') then raise exception '지원하지 않는 처리 방식입니다.'; end if;
  update public.staging_listings
     set extracted_data = coalesce(extracted_data,'{}'::jsonb) || jsonb_build_object('_removal_resolution',p_resolution)
   where id=p_staging_listing_id and change_type='POSSIBLY_REMOVED';
  if not found then raise exception '처리할 공실 후보를 찾을 수 없습니다.'; end if;
end $$;
revoke all on function public.resolve_possible_removal(uuid,text) from public;
grant execute on function public.resolve_possible_removal(uuid,text) to authenticated;

create or replace function public.create_building_from_staging(p_staging_building_id uuid)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  s public.staging_buildings%rowtype; v_id uuid; v_slug text; v_parking int;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into s from public.staging_buildings where id=p_staging_building_id for update;
  if not found then raise exception 'Staging 건물을 찾을 수 없습니다.'; end if;
  if s.matched_building_id is not null then return s.matched_building_id; end if;
  if coalesce(s.raw_building_name,'')='' then raise exception '건물명이 없어 신규 등록할 수 없습니다.'; end if;

  v_slug := 'import-' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
  insert into public.buildings(
    name,normalized_name,road_address,address,completion_year,gross_floor_area,
    above_ground_floors,basement_floors,efficiency_ratio,elevator_count,
    building_use,slug,is_published,status,data_last_verified_at
  ) values(
    s.raw_building_name,s.normalized_building_name,
    s.extracted_data->'road_address'->>'value',s.extracted_data->'road_address'->>'value',
    nullif(s.extracted_data->'completion_year'->>'value','')::int,
    nullif(s.extracted_data->'gross_floor_area_sqm'->>'value','')::numeric,
    nullif(s.extracted_data->'above_ground_floors'->>'value','')::int,
    nullif(s.extracted_data->'basement_floors'->>'value','')::int,
    nullif(s.extracted_data->'efficiency_ratio'->>'value','')::numeric,
    nullif(s.extracted_data->'passenger_elevators'->>'value','')::int,
    s.extracted_data->'building_use'->>'value',v_slug,false,'active',now()
  ) returning id into v_id;

  v_parking := nullif(s.extracted_data->'parking_total'->>'value','')::int;
  if v_parking is not null then
    insert into public.building_parking(building_id,total_spaces) values(v_id,v_parking)
    on conflict(building_id) do update set total_spaces=excluded.total_spaces;
  end if;

  update public.staging_buildings set matched_building_id=v_id,match_status='MANUAL_MATCHED',match_score=1,match_reason='Staging에서 신규 건물 생성' where id=s.id;
  update public.staging_listings set matched_building_id=v_id where staging_building_id=s.id;
  insert into public.audit_logs(actor_type,actor_id,entity_type,entity_id,action,after_data)
    values('ADMIN',auth.uid(),'building',v_id,'CREATE',jsonb_build_object('source','STAGING_IMPORT','staging_building_id',s.id));
  return v_id;
end $$;
revoke all on function public.create_building_from_staging(uuid) from public;
grant execute on function public.create_building_from_staging(uuid) to authenticated;

create or replace function public.approve_import_batch(p_source_document_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_run uuid; v_source uuid; v_report date; r record; v_insert int:=0; v_update int:=0; v_same int:=0;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select source_id,report_date into v_source,v_report from public.source_documents where id=p_source_document_id for update;
  select id into v_run from public.parsing_runs where source_document_id=p_source_document_id and parser_version='TEXT-EXTRACT-v1.0.0' order by created_at desc limit 1;
  if v_run is null then raise exception 'Extraction Run을 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.staging_buildings where parsing_run_id=v_run and matched_building_id is null) then
    raise exception '매칭되지 않은 건물이 있습니다. 먼저 건물 매칭을 완료하세요.';
  end if;
  if exists(select 1 from public.staging_listings where parsing_run_id=v_run and change_type in ('UNCLASSIFIED','CONFLICT')) then
    raise exception '미분류 또는 충돌 매물이 있습니다. 먼저 Diff 검수를 완료하세요.';
  end if;
  if exists(select 1 from public.staging_listings where parsing_run_id=v_run and change_type='POSSIBLY_REMOVED' and coalesce(extracted_data->>'_removal_resolution','')='') then
    raise exception '종료 가능성이 있는 공실의 처리 방식을 먼저 선택하세요.';
  end if;

  for r in select * from public.staging_listings where parsing_run_id=v_run order by source_page,id loop
    if r.change_type='NEW' then
      insert into public.listings(
        building_id,floor,unit,gross_area,gross_area_py,exclusive_area,exclusive_area_py,
        deposit_per_py,rent_per_py,maintenance_per_py,noc_per_py,move_in_text,
        status,is_published,source_id,source_document_id,source_page,report_date,verified_at
      ) values(
        r.matched_building_id,r.floor,r.unit,
        nullif(r.extracted_data->'gross_area_sqm'->>'value','')::numeric,
        nullif(r.extracted_data->'gross_area_py'->>'value','')::numeric,
        nullif(r.extracted_data->'exclusive_area_sqm'->>'value','')::numeric,
        nullif(r.extracted_data->'exclusive_area_py'->>'value','')::numeric,
        nullif(r.extracted_data->'deposit_per_py'->>'value','')::bigint,
        nullif(r.extracted_data->'rent_per_py'->>'value','')::bigint,
        nullif(r.extracted_data->'maintenance_per_py'->>'value','')::bigint,
        nullif(r.extracted_data->'noc_per_py'->>'value','')::bigint,
        r.extracted_data->'move_in_text'->>'value','available',true,v_source,p_source_document_id,r.source_page,v_report,now()
      );
      v_insert:=v_insert+1;
    elsif r.change_type='UPDATED' then
      update public.listings set
        gross_area=coalesce(nullif(r.extracted_data->'gross_area_sqm'->>'value','')::numeric,gross_area),
        gross_area_py=coalesce(nullif(r.extracted_data->'gross_area_py'->>'value','')::numeric,gross_area_py),
        exclusive_area=coalesce(nullif(r.extracted_data->'exclusive_area_sqm'->>'value','')::numeric,exclusive_area),
        exclusive_area_py=coalesce(nullif(r.extracted_data->'exclusive_area_py'->>'value','')::numeric,exclusive_area_py),
        deposit_per_py=coalesce(nullif(r.extracted_data->'deposit_per_py'->>'value','')::bigint,deposit_per_py),
        rent_per_py=coalesce(nullif(r.extracted_data->'rent_per_py'->>'value','')::bigint,rent_per_py),
        maintenance_per_py=coalesce(nullif(r.extracted_data->'maintenance_per_py'->>'value','')::bigint,maintenance_per_py),
        noc_per_py=coalesce(nullif(r.extracted_data->'noc_per_py'->>'value','')::bigint,noc_per_py),
        move_in_text=coalesce(r.extracted_data->'move_in_text'->>'value',move_in_text),
        source_id=v_source,source_document_id=p_source_document_id,source_page=r.source_page,report_date=v_report,verified_at=now()
      where id=r.matched_listing_id;
      v_update:=v_update+1;
    elsif r.change_type='UNCHANGED' then
      update public.listings set source_id=v_source,source_document_id=p_source_document_id,source_page=r.source_page,report_date=v_report,verified_at=now()
       where id=r.matched_listing_id;
      v_same:=v_same+1;
    elsif r.change_type='POSSIBLY_REMOVED' then
      if r.extracted_data->>'_removal_resolution'='EXPIRED' then
        update public.listings set status='expired',is_published=false,verified_at=now() where id=r.matched_listing_id;
      elsif r.extracted_data->>'_removal_resolution'='LEASED' then
        update public.listings set status='leased',is_published=false,verified_at=now() where id=r.matched_listing_id;
      elsif r.extracted_data->>'_removal_resolution'='HIDDEN' then
        update public.listings set status='hidden',is_published=false,verified_at=now() where id=r.matched_listing_id;
      elsif r.extracted_data->>'_removal_resolution'='KEEP' then
        update public.listings set verified_at=now() where id=r.matched_listing_id;
      end if;
    end if;
    update public.staging_listings set review_status='APPROVED' where id=r.id;
  end loop;
  update public.staging_buildings set review_status='APPROVED' where parsing_run_id=v_run;
  update public.source_documents set status='APPROVED',processing_completed_at=now() where id=p_source_document_id;
  insert into public.audit_logs(actor_type,actor_id,entity_type,entity_id,action,after_data)
    values('ADMIN',auth.uid(),'source_document',p_source_document_id,'UPDATE',jsonb_build_object('operation','IMPORT_APPROVED','inserted',v_insert,'updated',v_update,'unchanged',v_same));
  return jsonb_build_object('inserted',v_insert,'updated',v_update,'unchanged',v_same);
end $$;
revoke all on function public.approve_import_batch(uuid) from public;
grant execute on function public.approve_import_batch(uuid) to authenticated;

create or replace function public.resolve_listing_conflict(
  p_staging_listing_id uuid,
  p_action text,
  p_listing_id uuid default null
) returns void
language plpgsql security definer set search_path=''
as $$
declare
  s public.staging_listings%rowtype;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into s from public.staging_listings where id=p_staging_listing_id for update;
  if not found or s.change_type<>'CONFLICT' then raise exception '충돌 매물을 찾을 수 없습니다.'; end if;
  if p_action='AS_NEW' then
    update public.staging_listings set change_type='NEW',matched_listing_id=null where id=s.id;
  elsif p_action='MATCH_EXISTING' then
    if p_listing_id is null or not exists(select 1 from public.listings where id=p_listing_id and building_id=s.matched_building_id) then
      raise exception '같은 건물의 유효한 기존 매물을 선택하세요.';
    end if;
    update public.staging_listings set change_type='UPDATED',matched_listing_id=p_listing_id where id=s.id;
  else
    raise exception '지원하지 않는 처리 방식입니다.';
  end if;
end $$;
revoke all on function public.resolve_listing_conflict(uuid,text,uuid) from public;
grant execute on function public.resolve_listing_conflict(uuid,text,uuid) to authenticated;
commit;
