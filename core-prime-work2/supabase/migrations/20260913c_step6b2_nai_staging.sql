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
