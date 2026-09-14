-- CORE PRIME v1.11: approved import listing correction / individual re-approval

create table if not exists public.listing_correction_reviews (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  staging_listing_id uuid not null unique references public.staging_listings(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','APPLIED','VERIFIED_NO_CHANGE')),
  warning_snapshot jsonb not null default '[]'::jsonb,
  before_data jsonb,
  corrected_data jsonb,
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_listing_correction_reviews_source_document on public.listing_correction_reviews(source_document_id);
create index if not exists idx_listing_correction_reviews_status on public.listing_correction_reviews(status);

alter table public.listing_correction_reviews enable row level security;
drop policy if exists "admin all listing_correction_reviews" on public.listing_correction_reviews;
create policy "admin all listing_correction_reviews" on public.listing_correction_reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public._resolve_canonical_listing_for_staging(p_staging_listing_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.staging_listings%rowtype;
  v_source_document_id uuid;
  v_listing_id uuid;
  v_count int;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into s from public.staging_listings where id=p_staging_listing_id;
  if not found then raise exception 'Staging 공실을 찾을 수 없습니다.'; end if;

  if s.matched_listing_id is not null then
    return s.matched_listing_id;
  end if;

  select source_document_id into v_source_document_id
  from public.staging_buildings where id=s.staging_building_id;
  if v_source_document_id is null then raise exception '원본 자료를 찾을 수 없습니다.'; end if;
  if s.matched_building_id is null then raise exception '매칭된 건물이 없습니다.'; end if;

  select count(*), min(id::text)::uuid into v_count, v_listing_id
  from public.listings
  where building_id=s.matched_building_id
    and source_document_id=v_source_document_id
    and source_page is not distinct from s.source_page
    and coalesce(floor,'')=coalesce(s.floor,'')
    and coalesce(unit,'')=coalesce(s.unit,'');

  if v_count=0 then
    raise exception '승인된 실제 공실을 자동으로 연결하지 못했습니다. 건물/층/원본 페이지를 확인하세요.';
  elsif v_count>1 then
    raise exception '같은 조건의 실제 공실이 %건 있어 자동 연결할 수 없습니다. 개별 공실에서 먼저 확인하세요.', v_count;
  end if;

  update public.staging_listings set matched_listing_id=v_listing_id where id=s.id;
  return v_listing_id;
end $$;

revoke all on function public._resolve_canonical_listing_for_staging(uuid) from public;
grant execute on function public._resolve_canonical_listing_for_staging(uuid) to authenticated;

create or replace function public.apply_listing_correction(
  p_staging_listing_id uuid,
  p_patch jsonb,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.staging_listings%rowtype;
  v_listing_id uuid;
  v_source_document_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_warnings jsonb;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception '수정값 형식이 올바르지 않습니다.'; end if;

  select * into s from public.staging_listings where id=p_staging_listing_id for update;
  if not found then raise exception 'Staging 공실을 찾을 수 없습니다.'; end if;
  select source_document_id into v_source_document_id from public.staging_buildings where id=s.staging_building_id;
  v_listing_id := public._resolve_canonical_listing_for_staging(p_staging_listing_id);

  select to_jsonb(l.*) into v_before from public.listings l where l.id=v_listing_id for update;
  if v_before is null then raise exception '실제 공실을 찾을 수 없습니다.'; end if;

  update public.listings set
    floor = case when p_patch ? 'floor' then nullif(trim(p_patch->>'floor'),'') else floor end,
    unit = case when p_patch ? 'unit' then nullif(trim(p_patch->>'unit'),'') else unit end,
    gross_area = case when p_patch ? 'gross_area' then nullif(p_patch->>'gross_area','')::numeric else gross_area end,
    gross_area_py = case when p_patch ? 'gross_area_py' then nullif(p_patch->>'gross_area_py','')::numeric else gross_area_py end,
    exclusive_area = case when p_patch ? 'exclusive_area' then nullif(p_patch->>'exclusive_area','')::numeric else exclusive_area end,
    exclusive_area_py = case when p_patch ? 'exclusive_area_py' then nullif(p_patch->>'exclusive_area_py','')::numeric else exclusive_area_py end,
    deposit_per_py = case when p_patch ? 'deposit_per_py' then nullif(p_patch->>'deposit_per_py','')::bigint else deposit_per_py end,
    rent_per_py = case when p_patch ? 'rent_per_py' then nullif(p_patch->>'rent_per_py','')::bigint else rent_per_py end,
    maintenance_per_py = case when p_patch ? 'maintenance_per_py' then nullif(p_patch->>'maintenance_per_py','')::bigint else maintenance_per_py end,
    noc_per_py = case when p_patch ? 'noc_per_py' then nullif(p_patch->>'noc_per_py','')::bigint else noc_per_py end,
    deposit_total_won = case when p_patch ? 'deposit_total_won' then nullif(p_patch->>'deposit_total_won','')::bigint else deposit_total_won end,
    monthly_rent_total_won = case when p_patch ? 'monthly_rent_total_won' then nullif(p_patch->>'monthly_rent_total_won','')::bigint else monthly_rent_total_won end,
    management_fee_total_won = case when p_patch ? 'management_fee_total_won' then nullif(p_patch->>'management_fee_total_won','')::bigint else management_fee_total_won end,
    move_in_text = case when p_patch ? 'move_in_text' then nullif(trim(p_patch->>'move_in_text'),'') else move_in_text end,
    status = case when p_patch ? 'status' then p_patch->>'status' else status end,
    is_published = case when p_patch ? 'is_published' then (p_patch->>'is_published')::boolean else is_published end,
    verified_at = now(),
    updated_at = now()
  where id=v_listing_id;

  select to_jsonb(l.*) into v_after from public.listings l where l.id=v_listing_id;
  v_warnings := coalesce(s.extracted_data->'_warnings','[]'::jsonb);

  insert into public.listing_correction_reviews(
    source_document_id,staging_listing_id,listing_id,status,warning_snapshot,before_data,corrected_data,note,reviewed_by,reviewed_at,updated_at
  ) values(
    v_source_document_id,s.id,v_listing_id,'APPLIED',v_warnings,v_before,v_after,p_note,auth.uid(),now(),now()
  ) on conflict(staging_listing_id) do update set
    listing_id=excluded.listing_id,status='APPLIED',warning_snapshot=excluded.warning_snapshot,
    before_data=excluded.before_data,corrected_data=excluded.corrected_data,note=excluded.note,
    reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,updated_at=now();

  update public.staging_listings set
    matched_listing_id=v_listing_id,
    extracted_data=jsonb_set(coalesce(extracted_data,'{}'::jsonb),'{_correction}',jsonb_build_object('status','APPLIED','listing_id',v_listing_id,'reviewed_at',now(),'reviewed_by',auth.uid()),true)
  where id=s.id;

  insert into public.audit_logs(actor_type,actor_id,entity_type,entity_id,action,before_data,after_data,source_document_id)
  values('ADMIN',auth.uid(),'listing',v_listing_id,'UPDATE',v_before,v_after,v_source_document_id);

  return jsonb_build_object('listing_id',v_listing_id,'status','APPLIED');
end $$;

revoke all on function public.apply_listing_correction(uuid,jsonb,text) from public;
grant execute on function public.apply_listing_correction(uuid,jsonb,text) to authenticated;

create or replace function public.verify_listing_warning_no_change(
  p_staging_listing_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.staging_listings%rowtype;
  v_listing_id uuid;
  v_source_document_id uuid;
  v_before jsonb;
  v_warnings jsonb;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into s from public.staging_listings where id=p_staging_listing_id for update;
  if not found then raise exception 'Staging 공실을 찾을 수 없습니다.'; end if;
  select source_document_id into v_source_document_id from public.staging_buildings where id=s.staging_building_id;
  v_listing_id := public._resolve_canonical_listing_for_staging(p_staging_listing_id);
  select to_jsonb(l.*) into v_before from public.listings l where l.id=v_listing_id;
  v_warnings := coalesce(s.extracted_data->'_warnings','[]'::jsonb);

  insert into public.listing_correction_reviews(
    source_document_id,staging_listing_id,listing_id,status,warning_snapshot,before_data,corrected_data,note,reviewed_by,reviewed_at,updated_at
  ) values(
    v_source_document_id,s.id,v_listing_id,'VERIFIED_NO_CHANGE',v_warnings,v_before,v_before,p_note,auth.uid(),now(),now()
  ) on conflict(staging_listing_id) do update set
    listing_id=excluded.listing_id,status='VERIFIED_NO_CHANGE',warning_snapshot=excluded.warning_snapshot,
    before_data=excluded.before_data,corrected_data=excluded.corrected_data,note=excluded.note,
    reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,updated_at=now();

  update public.staging_listings set
    matched_listing_id=v_listing_id,
    extracted_data=jsonb_set(coalesce(extracted_data,'{}'::jsonb),'{_correction}',jsonb_build_object('status','VERIFIED_NO_CHANGE','listing_id',v_listing_id,'reviewed_at',now(),'reviewed_by',auth.uid()),true)
  where id=s.id;

  insert into public.audit_logs(actor_type,actor_id,entity_type,entity_id,action,after_data,source_document_id)
  values('ADMIN',auth.uid(),'listing',v_listing_id,'UPDATE',jsonb_build_object('operation','WARNING_VERIFIED_NO_CHANGE','staging_listing_id',s.id,'note',p_note),v_source_document_id);

  return jsonb_build_object('listing_id',v_listing_id,'status','VERIFIED_NO_CHANGE');
end $$;

revoke all on function public.verify_listing_warning_no_change(uuid,text) from public;
grant execute on function public.verify_listing_warning_no_change(uuid,text) to authenticated;
