-- CORE PRIME v1.10.1
-- 정확한 원 단위 총액 보존 + import diff/approve 연동
-- 기존 데이터는 변경하지 않고 컬럼/함수만 확장합니다.

alter table public.listings add column if not exists deposit_total_won bigint;
alter table public.listings add column if not exists monthly_rent_total_won bigint;
alter table public.listings add column if not exists management_fee_total_won bigint;

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
        and coalesce(deposit_total_won,0)=coalesce(nullif(r.extracted_data->'deposit_total_won'->>'value','')::bigint,0)
        and coalesce(monthly_rent_total_won,0)=coalesce(nullif(r.extracted_data->'monthly_rent_total_won'->>'value','')::bigint,0)
        and coalesce(management_fee_total_won,0)=coalesce(nullif(r.extracted_data->'management_fee_total_won'->>'value','')::bigint,0)
        and coalesce(move_in_text,'')=coalesce(r.extracted_data->'move_in_text'->>'value','')
      into v_same from public.listings where id=v_listing;
      if v_same then
        update public.staging_listings set change_type='UNCHANGED',matched_listing_id=v_listing where id=r.id; v_unchanged:=v_unchanged+1;
      else
        update public.staging_listings set change_type='UPDATED',matched_listing_id=v_listing where id=r.id; v_updated:=v_updated+1;
      end if;
    end if;
  end loop;

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
            'maintenance_per_py',c.maintenance_per_py,
            'deposit_total_won',c.deposit_total_won,
            'monthly_rent_total_won',c.monthly_rent_total_won,
            'management_fee_total_won',c.management_fee_total_won
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

create or replace function public.approve_import_batch(p_source_document_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_run uuid; v_source uuid; v_report date; r record;
  v_insert int:=0; v_update int:=0; v_same int:=0;
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
        deposit_total_won,monthly_rent_total_won,management_fee_total_won,
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
        r.extracted_data->'move_in_text'->>'value',
        nullif(r.extracted_data->'deposit_total_won'->>'value','')::bigint,
        nullif(r.extracted_data->'monthly_rent_total_won'->>'value','')::bigint,
        nullif(r.extracted_data->'management_fee_total_won'->>'value','')::bigint,
        'available',true,v_source,p_source_document_id,r.source_page,v_report,now()
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
        deposit_total_won=coalesce(nullif(r.extracted_data->'deposit_total_won'->>'value','')::bigint,deposit_total_won),
        monthly_rent_total_won=coalesce(nullif(r.extracted_data->'monthly_rent_total_won'->>'value','')::bigint,monthly_rent_total_won),
        management_fee_total_won=coalesce(nullif(r.extracted_data->'management_fee_total_won'->>'value','')::bigint,management_fee_total_won),
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
