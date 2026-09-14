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
