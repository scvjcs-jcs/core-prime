-- CORE PRIME / STEP 6B-1 — 실제 PDF Text Extraction (DB 레이어)
-- 전제: STEP 6A DB Infra(parsing_runs, source_document_pages 등)와
-- STEP 6A Dummy State Machine(start_dummy_parsing_run 등)이 이미 적용되어 있음.
--
-- 이 migration은:
--   1) STEP 6A에서 발견된 설계 틈(새 Run이 COMPLETED_WITH_WARNINGS 상태에서도 생성 가능했던 문제)을
--      start_dummy_parsing_run과 새 실제 extraction 함수 양쪽에 동일하게 적용한다.
--   2) 실제 PDF text extraction을 위한 2-phase(claim/complete) RPC를 추가한다.
--      (Postgres RPC는 PDF 바이너리를 파싱할 수 없으므로, 텍스트 추출 자체는 Node 쪽에서 수행하고
--       DB는 claim(선점)과 complete(결과 반영/집계)만 담당한다.)

-- -----------------------------------------------------------------------------
-- 0) 공용: "새 Run 생성 가능 여부" 체크를 위한 작은 헬퍼
--    COMPLETED_WITH_WARNINGS 상태의 최신 run이 있으면 새 run 생성을 막는다.
--    (QUEUED/PROCESSING 중복은 기존 partial unique index가 계속 막는다.)
-- -----------------------------------------------------------------------------
create or replace function public._check_can_start_new_run(p_source_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest_status text;
begin
  select status into v_latest_status
  from public.parsing_runs
  where source_document_id = p_source_document_id
  order by created_at desc
  limit 1;

  if v_latest_status = 'COMPLETED_WITH_WARNINGS' then
    raise exception '이전 분석에 아직 처리되지 않은 실패 페이지가 있습니다. 먼저 재시도로 해결해주세요.' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) start_dummy_parsing_run 정책 보강 (STEP 6A 재적용)
--    COMPLETED_WITH_WARNINGS 상태에서는 새 테스트 Run도 막는다.
-- -----------------------------------------------------------------------------
create or replace function public.start_dummy_parsing_run(
  p_source_document_id uuid,
  p_total_pages integer default 20
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_parser_type text;
  v_run_id uuid;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  if p_total_pages is null or p_total_pages < 1 or p_total_pages > 1000 then
    raise exception '테스트 페이지 수가 올바르지 않습니다.' using errcode = '22023';
  end if;

  perform public._check_can_start_new_run(p_source_document_id);

  select coalesce(parser_type, 'GENERIC')
    into v_parser_type
  from public.source_documents
  where id = p_source_document_id
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  begin
    insert into public.parsing_runs (
      source_document_id, parser_type, parser_version, status,
      current_page, processed_pages, error_page_count, total_pages,
      context_state, triggered_by
    )
    values (
      p_source_document_id, v_parser_type, 'DUMMY-v1', 'QUEUED',
      0, 0, 0, p_total_pages, '{}'::jsonb, v_user_id
    )
    returning id into v_run_id;
  exception when unique_violation then
    raise exception '이미 진행 중인 분석이 있습니다.' using errcode = '23505';
  end;

  begin
    insert into public.source_document_pages (
      parsing_run_id, source_document_id, page_number, status, attempt_count
    )
    select v_run_id, p_source_document_id, gs, 'PENDING', 0
    from generate_series(1, p_total_pages) gs;

    update public.source_documents
    set status = 'QUEUED', current_page = 0, processed_pages = 0,
        error_message = null, processing_started_at = null, processing_completed_at = null
    where id = p_source_document_id;

    insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
    values ('ADMIN', v_user_id, 'parsing_run', v_run_id, 'PARSING_RUN_CREATED',
      jsonb_build_object('source_document_id', p_source_document_id, 'parser_type', v_parser_type,
        'parser_version', 'DUMMY-v1', 'status', 'QUEUED', 'total_pages', p_total_pages));
  exception when others then
    update public.parsing_runs set status = 'FAILED', error_message = sqlerrm, completed_at = now() where id = v_run_id;
    update public.source_documents set status = 'FAILED', error_message = sqlerrm, processing_completed_at = now() where id = p_source_document_id;
    insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
    values ('ADMIN', v_user_id, 'parsing_run', v_run_id, 'PARSING_FAILED',
      jsonb_build_object('source_document_id', p_source_document_id, 'error', sqlerrm));
    return v_run_id;
  end;

  return v_run_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) 실제 PDF Text Extraction Run 생성
--    Node가 이미 PDF를 다운로드해서 실제 page count를 확인한 뒤 호출한다.
--    parser_type = source_document.parser_type (문서 종류), parser_version = TEXT-EXTRACT-v1.0.0 (추출 엔진 버전).
-- -----------------------------------------------------------------------------
create or replace function public.start_pdf_text_extraction_run(
  p_source_document_id uuid,
  p_total_pages integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_parser_type text;
  v_run_id uuid;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  if p_total_pages is null or p_total_pages < 1 or p_total_pages > 5000 then
    raise exception '실제 PDF 페이지 수가 올바르지 않습니다.' using errcode = '22023';
  end if;

  perform public._check_can_start_new_run(p_source_document_id);

  select coalesce(parser_type, 'GENERIC')
    into v_parser_type
  from public.source_documents
  where id = p_source_document_id
  for update;

  if not found then
    raise exception '자료를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  begin
    insert into public.parsing_runs (
      source_document_id, parser_type, parser_version, status,
      current_page, processed_pages, error_page_count, total_pages,
      context_state, triggered_by
    )
    values (
      p_source_document_id, v_parser_type, 'TEXT-EXTRACT-v1.0.0', 'QUEUED',
      0, 0, 0, p_total_pages, '{}'::jsonb, v_user_id
    )
    returning id into v_run_id;
  exception when unique_violation then
    raise exception '이미 진행 중인 분석이 있습니다.' using errcode = '23505';
  end;

  begin
    insert into public.source_document_pages (
      parsing_run_id, source_document_id, page_number, status, attempt_count
    )
    select v_run_id, p_source_document_id, gs, 'PENDING', 0
    from generate_series(1, p_total_pages) gs;

    -- 실제 PDF 페이지 수 확인에 성공했을 때만 page_count를 갱신한다.
    update public.source_documents
    set status = 'QUEUED', page_count = p_total_pages, current_page = 0, processed_pages = 0,
        error_message = null, processing_started_at = null, processing_completed_at = null
    where id = p_source_document_id;

    insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
    values ('ADMIN', v_user_id, 'parsing_run', v_run_id, 'PARSING_RUN_CREATED',
      jsonb_build_object('source_document_id', p_source_document_id, 'parser_type', v_parser_type,
        'parser_version', 'TEXT-EXTRACT-v1.0.0', 'status', 'QUEUED', 'total_pages', p_total_pages));
  exception when others then
    update public.parsing_runs set status = 'FAILED', error_message = sqlerrm, completed_at = now() where id = v_run_id;
    update public.source_documents set status = 'FAILED', error_message = sqlerrm, processing_completed_at = now() where id = p_source_document_id;
    insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
    values ('ADMIN', v_user_id, 'parsing_run', v_run_id, 'PARSING_FAILED',
      jsonb_build_object('source_document_id', p_source_document_id, 'error', sqlerrm));
    return v_run_id;
  end;

  return v_run_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) claim_pdf_pages — 다음 PENDING(+ stale PROCESSING 복구분) 페이지를 최대 N개 선점.
--    실제 텍스트 추출은 여기서 하지 않는다 (Node가 claim 결과를 받아서 처리).
--    claim할 PENDING이 하나도 없고(=stale 복구분도 없고) PROCESSING도 0이면
--    바로 종료 판정까지 수행한다 (이 경우 Node가 추가로 할 일이 없음).
-- -----------------------------------------------------------------------------
create or replace function public.claim_pdf_pages(
  p_parsing_run_id uuid,
  p_batch_size integer default 5,
  p_stale_minutes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.parsing_runs%rowtype;
  v_claimed jsonb;
  v_pending integer;
  v_processing integer;
  v_done integer;
  v_failed integer;
  v_new_status text;
  v_doc_status text;
  v_completed_now boolean := false;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 50 then
    raise exception '배치 크기가 올바르지 않습니다.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_parsing_run_id::text));

  select * into v_run
  from public.parsing_runs
  where id = p_parsing_run_id
  for update;

  if not found then
    raise exception 'Parsing Run을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if v_run.status not in ('QUEUED','PROCESSING') then
    raise exception '현재 상태에서는 페이지를 처리할 수 없습니다.' using errcode = '22023';
  end if;

  begin
    if v_run.status = 'QUEUED' then
      update public.parsing_runs set status = 'PROCESSING', started_at = coalesce(started_at, now()) where id = v_run.id;
      update public.source_documents set status = 'PROCESSING', processing_started_at = coalesce(processing_started_at, now()) where id = v_run.source_document_id;
      insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
      values ('ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_STARTED',
        jsonb_build_object('source_document_id', v_run.source_document_id, 'status', 'PROCESSING'));
      v_run.status := 'PROCESSING'; -- 이번 호출의 반환값도 최신 상태를 반영하도록 로컬 변수 동기화
    end if;

    -- stale PROCESSING 복구: claim 전에 오래된 PROCESSING을 PENDING으로 되돌린다.
    update public.source_document_pages
    set status = 'PENDING'
    where parsing_run_id = v_run.id
      and status = 'PROCESSING'
      and updated_at < now() - (p_stale_minutes || ' minutes')::interval;

    -- PENDING 페이지 선점 (claim). 텍스트 추출은 Node가 수행, 여기서는 선점만.
    with claimable as (
      select id, page_number
      from public.source_document_pages
      where parsing_run_id = v_run.id
        and status = 'PENDING'
      order by page_number asc
      limit p_batch_size
      for update skip locked
    ),
    claimed as (
      update public.source_document_pages p
      set status = 'PROCESSING', attempt_count = p.attempt_count + 1, error_message = null
      from claimable c
      where p.id = c.id
      returning p.id, p.page_number, p.attempt_count
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'page_number', page_number, 'attempt_count', attempt_count) order by page_number), '[]'::jsonb)
    into v_claimed
    from claimed;

    select
      count(*) filter (where status = 'DONE'),
      count(*) filter (where status = 'FAILED'),
      count(*) filter (where status = 'PENDING'),
      count(*) filter (where status = 'PROCESSING')
    into v_done, v_failed, v_pending, v_processing
    from public.source_document_pages
    where parsing_run_id = v_run.id;

    -- claim한 게 없고(= 방금 claimed가 비었고) 더 진행 중인 것도 없으면 바로 종료 판정.
    if jsonb_array_length(v_claimed) = 0 and v_pending = 0 and v_processing = 0 then
      v_completed_now := true;
      if v_failed > 0 then
        v_new_status := 'COMPLETED_WITH_WARNINGS';
        v_doc_status := 'REVIEW_REQUIRED';
      else
        v_new_status := 'COMPLETED';
        v_doc_status := 'PARSED';
      end if;

      update public.parsing_runs
      set status = v_new_status, processed_pages = v_done, error_page_count = v_failed, completed_at = now()
      where id = v_run.id;

      update public.source_documents
      set status = v_doc_status, processed_pages = v_done, processing_completed_at = now(),
          error_message = case when v_failed > 0 then v_failed || '개 페이지 처리 실패' else null end
      where id = v_run.source_document_id;

      insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
      values ('ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_COMPLETED',
        jsonb_build_object('source_document_id', v_run.source_document_id, 'status', v_new_status,
          'processed_pages', v_done, 'error_page_count', v_failed));
    end if;

    return jsonb_build_object(
      'run_id', v_run.id,
      'pages', v_claimed,
      'run_status', coalesce(v_new_status, v_run.status),
      'pending_pages', v_pending,
      'processing_pages', v_processing + jsonb_array_length(v_claimed)
    );
  exception when others then
    update public.parsing_runs set status = 'FAILED', error_message = sqlerrm, completed_at = now() where id = v_run.id;
    update public.source_documents set status = 'FAILED', error_message = sqlerrm, processing_completed_at = now() where id = v_run.source_document_id;
    insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
    values ('ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_FAILED',
      jsonb_build_object('source_document_id', v_run.source_document_id, 'error', sqlerrm));
    return jsonb_build_object('run_id', v_run.id, 'pages', '[]'::jsonb, 'run_status', 'FAILED', 'error_message', sqlerrm);
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) complete_pdf_page_batch — Node가 claim한 페이지들의 실제 추출 결과를 반영 + 집계.
--    p_page_results 형식: [{ "page_id": "uuid", "success": true, "extracted_text": "...", "no_text": false, "error_message": null }, ...]
-- -----------------------------------------------------------------------------
create or replace function public.complete_pdf_page_batch(
  p_parsing_run_id uuid,
  p_page_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.parsing_runs%rowtype;
  v_item jsonb;
  v_done integer;
  v_failed integer;
  v_pending integer;
  v_processing integer;
  v_max_attempted integer;
  v_new_status text;
  v_doc_status text;
  v_completed_now boolean := false;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  if p_page_results is null or jsonb_typeof(p_page_results) <> 'array' then
    raise exception '처리 결과 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_parsing_run_id::text));

  select * into v_run
  from public.parsing_runs
  where id = p_parsing_run_id
  for update;

  if not found then
    raise exception 'Parsing Run을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if v_run.status not in ('QUEUED','PROCESSING') then
    raise exception '현재 상태에서는 결과를 반영할 수 없습니다.' using errcode = '22023';
  end if;

  begin
    for v_item in select * from jsonb_array_elements(p_page_results)
    loop
      if (v_item->>'success')::boolean is true then
        update public.source_document_pages
        set
          status = 'DONE',
          extracted_text = v_item->>'extracted_text',
          warnings = case when coalesce((v_item->>'no_text')::boolean, false)
                       then '["NO_TEXT"]'::jsonb else '[]'::jsonb end,
          error_message = null,
          processed_at = now()
        where id = (v_item->>'page_id')::uuid
          and parsing_run_id = v_run.id;
      else
        update public.source_document_pages
        set
          status = 'FAILED',
          error_message = coalesce(v_item->>'error_message', '추출 실패'),
          processed_at = now()
        where id = (v_item->>'page_id')::uuid
          and parsing_run_id = v_run.id;
      end if;
    end loop;

    select
      count(*) filter (where status = 'DONE'),
      count(*) filter (where status = 'FAILED'),
      count(*) filter (where status = 'PENDING'),
      count(*) filter (where status = 'PROCESSING'),
      coalesce(max(page_number) filter (where attempt_count > 0), 0)
    into v_done, v_failed, v_pending, v_processing, v_max_attempted
    from public.source_document_pages
    where parsing_run_id = v_run.id;

    if v_pending = 0 and v_processing = 0 then
      v_completed_now := true;
      if v_failed > 0 then
        v_new_status := 'COMPLETED_WITH_WARNINGS';
        v_doc_status := 'REVIEW_REQUIRED';
      else
        v_new_status := 'COMPLETED';
        v_doc_status := 'PARSED';
      end if;
    else
      v_new_status := 'PROCESSING';
      v_doc_status := 'PROCESSING';
    end if;

    update public.parsing_runs
    set
      status = v_new_status,
      current_page = greatest(current_page, v_max_attempted),
      processed_pages = v_done,
      error_page_count = v_failed,
      completed_at = case when v_completed_now then now() else null end
    where id = v_run.id;

    update public.source_documents
    set
      status = v_doc_status,
      current_page = greatest(coalesce(current_page, 0), v_max_attempted),
      processed_pages = v_done,
      processing_completed_at = case when v_completed_now then now() else null end,
      error_message = case when v_failed > 0 then v_failed || '개 페이지 처리 실패' else null end
    where id = v_run.source_document_id;

    if v_completed_now then
      insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
      values ('ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_COMPLETED',
        jsonb_build_object('source_document_id', v_run.source_document_id, 'status', v_new_status,
          'processed_pages', v_done, 'error_page_count', v_failed));
    end if;

    return jsonb_build_object(
      'run_id', v_run.id,
      'status', v_new_status,
      'processed_pages', v_done,
      'error_page_count', v_failed,
      'pending_pages', v_pending,
      'current_page', greatest(v_run.current_page, v_max_attempted)
    );
  exception when others then
    update public.parsing_runs set status = 'FAILED', error_message = sqlerrm, completed_at = now() where id = v_run.id;
    update public.source_documents set status = 'FAILED', error_message = sqlerrm, processing_completed_at = now() where id = v_run.source_document_id;
    insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
    values ('ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_FAILED',
      jsonb_build_object('source_document_id', v_run.source_document_id, 'error', sqlerrm));
    return jsonb_build_object('run_id', v_run.id, 'status', 'FAILED', 'error_message', sqlerrm);
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) retry_failed_pdf_pages — FAILED 페이지를 claim (claim_pdf_pages와 동일한 모양으로 반환).
--    Node가 이 결과로 실제 재추출 후 complete_pdf_page_batch를 다시 호출해서 마무리한다.
-- -----------------------------------------------------------------------------
create or replace function public.retry_failed_pdf_pages(
  p_parsing_run_id uuid,
  p_batch_size integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.parsing_runs%rowtype;
  v_claimed jsonb;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 50 then
    raise exception '재시도 배치 크기가 올바르지 않습니다.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_parsing_run_id::text));

  select * into v_run
  from public.parsing_runs
  where id = p_parsing_run_id
  for update;

  if not found then
    raise exception 'Parsing Run을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if v_run.status not in ('PROCESSING','COMPLETED_WITH_WARNINGS') then
    raise exception '현재 상태에서는 실패 페이지를 재시도할 수 없습니다.' using errcode = '22023';
  end if;

  -- COMPLETED_WITH_WARNINGS에서 재시도를 시작하면, 다시 처리 중 상태로 되돌린다
  -- (claim_pdf_pages/complete_pdf_page_batch가 QUEUED/PROCESSING만 받아들이므로).
  if v_run.status = 'COMPLETED_WITH_WARNINGS' then
    update public.parsing_runs set status = 'PROCESSING', completed_at = null where id = v_run.id;
    update public.source_documents set status = 'PROCESSING', processing_completed_at = null where id = v_run.source_document_id;
  end if;

  with claimable as (
    select id, page_number
    from public.source_document_pages
    where parsing_run_id = v_run.id
      and status = 'FAILED'
    order by page_number asc
    limit p_batch_size
    for update skip locked
  ),
  claimed as (
    update public.source_document_pages p
    set status = 'PROCESSING', attempt_count = p.attempt_count + 1, error_message = null
    from claimable c
    where p.id = c.id
    returning p.id, p.page_number, p.attempt_count
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'page_number', page_number, 'attempt_count', attempt_count) order by page_number), '[]'::jsonb)
  into v_claimed
  from claimed;

  return jsonb_build_object('run_id', v_run.id, 'pages', v_claimed);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) fail_pdf_parsing_run — PDF 다운로드/추출 자체가 Run 생성 후 치명적으로 실패했을 때
--    run 전체를 FAILED로 명시적으로 마킹 (애매하게 PROCESSING으로 남기지 않기 위함).
-- -----------------------------------------------------------------------------
create or replace function public.fail_pdf_parsing_run(
  p_parsing_run_id uuid,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.parsing_runs%rowtype;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  select * into v_run from public.parsing_runs where id = p_parsing_run_id for update;
  if not found then
    raise exception 'Parsing Run을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  update public.parsing_runs
  set status = 'FAILED', error_message = coalesce(p_error_message, 'PDF 처리 실패'), completed_at = now()
  where id = v_run.id;

  update public.source_documents
  set status = 'FAILED', error_message = coalesce(p_error_message, 'PDF 처리 실패'), processing_completed_at = now()
  where id = v_run.source_document_id;

  insert into public.audit_logs (actor_type, actor_id, entity_type, entity_id, action, after_data)
  values ('ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_FAILED',
    jsonb_build_object('source_document_id', v_run.source_document_id, 'error', coalesce(p_error_message, 'PDF 처리 실패')));

  return jsonb_build_object('run_id', v_run.id, 'status', 'FAILED');
end;
$$;

grant execute on function public.start_pdf_text_extraction_run(uuid, integer) to authenticated;
grant execute on function public.claim_pdf_pages(uuid, integer, integer) to authenticated;
grant execute on function public.complete_pdf_page_batch(uuid, jsonb) to authenticated;
grant execute on function public.retry_failed_pdf_pages(uuid, integer) to authenticated;
grant execute on function public.fail_pdf_parsing_run(uuid, text) to authenticated;
