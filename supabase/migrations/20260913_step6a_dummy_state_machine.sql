-- CORE PRIME / STEP 6A — Application State Machine (Dummy)
-- 전제: parsing_runs, source_document_pages 및 관련 composite FK/index/RLS(STEP 6A DB Infra)가
-- 이미 DB에 적용되어 있음. 이 migration은 그 위에 RPC 함수 3개만 추가한다.
-- 실제 PDF를 읽지 않는다. 상태 전이 / 동시성 / 재시도 / run-level 실패 처리 구조만 검증한다.

-- -----------------------------------------------------------------------------
-- 1) Dummy run 생성 + 1..N 페이지 초기화
--    - page 초기화 자체가 실패하면(otherwise 포착 못한 예외) run을 FAILED로 마킹한다.
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
      source_document_id,
      parser_type,
      parser_version,
      status,
      current_page,
      processed_pages,
      error_page_count,
      total_pages,
      context_state,
      triggered_by
    )
    values (
      p_source_document_id,
      v_parser_type,
      'DUMMY-v1',
      'QUEUED',
      0,
      0,
      0,
      p_total_pages,
      '{}'::jsonb,
      v_user_id
    )
    returning id into v_run_id;
  exception when unique_violation then
    raise exception '이미 진행 중인 분석이 있습니다.' using errcode = '23505';
  end;

  -- run row는 이미 커밋 대상으로 존재한다. 이후 초기화 단계가 예기치 않게 실패해도
  -- run 자체가 사라지지 않고 FAILED로 남도록 별도 블록으로 감싼다.
  begin
    insert into public.source_document_pages (
      parsing_run_id,
      source_document_id,
      page_number,
      status,
      attempt_count
    )
    select
      v_run_id,
      p_source_document_id,
      gs,
      'PENDING',
      0
    from generate_series(1, p_total_pages) gs;

    update public.source_documents
    set
      status = 'QUEUED',
      current_page = 0,
      processed_pages = 0,
      error_message = null,
      processing_started_at = null,
      processing_completed_at = null
    where id = p_source_document_id;

    insert into public.audit_logs (
      actor_type, actor_id, entity_type, entity_id, action, after_data
    ) values (
      'ADMIN', v_user_id, 'parsing_run', v_run_id, 'PARSING_RUN_CREATED',
      jsonb_build_object(
        'source_document_id', p_source_document_id,
        'parser_type', v_parser_type,
        'parser_version', 'DUMMY-v1',
        'status', 'QUEUED',
        'total_pages', p_total_pages
      )
    );
  exception when others then
    update public.parsing_runs
    set status = 'FAILED', error_message = sqlerrm, completed_at = now()
    where id = v_run_id;

    update public.source_documents
    set status = 'FAILED', error_message = sqlerrm, processing_completed_at = now()
    where id = p_source_document_id;

    insert into public.audit_logs (
      actor_type, actor_id, entity_type, entity_id, action, after_data
    ) values (
      'ADMIN', v_user_id, 'parsing_run', v_run_id, 'PARSING_FAILED',
      jsonb_build_object('source_document_id', p_source_document_id, 'error', sqlerrm)
    );

    return v_run_id;
  end;

  return v_run_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) 다음 PENDING 페이지를 최대 N개 선점/처리
--    - 같은 run에 대한 호출은 advisory xact lock으로 직렬화.
--    - page 8은 첫 시도(attempt_count=0)에서만 의도적으로 실패.
--    - 페이지 루프/집계/상태갱신 중 예기치 않은 오류가 나면 run 전체를 FAILED로 마킹한다
--      (page-level FAILED와 run-level FAILED를 구분: 이건 run-level).
-- -----------------------------------------------------------------------------
create or replace function public.process_next_dummy_batch(
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
  v_page record;
  v_before jsonb;
  v_after jsonb;
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
    raise exception '현재 상태에서는 다음 배치를 처리할 수 없습니다.' using errcode = '22023';
  end if;

  -- 여기서부터가 "실제 처리" 구간. 예기치 않은 오류는 run-level FAILED로 귀결시킨다.
  begin
    if v_run.status = 'QUEUED' then
      update public.parsing_runs
      set status = 'PROCESSING', started_at = coalesce(started_at, now())
      where id = v_run.id;

      update public.source_documents
      set status = 'PROCESSING', processing_started_at = coalesce(processing_started_at, now())
      where id = v_run.source_document_id;

      insert into public.audit_logs (
        actor_type, actor_id, entity_type, entity_id, action, after_data
      ) values (
        'ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_STARTED',
        jsonb_build_object('source_document_id', v_run.source_document_id, 'status', 'PROCESSING')
      );
    end if;

    -- PENDING만 페이지 번호 순으로 선택. FAILED는 재시도 액션이 별도로 담당.
    for v_page in
      select id, page_number, attempt_count
      from public.source_document_pages
      where parsing_run_id = v_run.id
        and status = 'PENDING'
      order by page_number asc
      limit p_batch_size
      for update skip locked
    loop
      select context_state into v_before
      from public.parsing_runs
      where id = v_run.id;

      update public.source_document_pages
      set
        status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        context_before = coalesce(v_before, '{}'::jsonb),
        error_message = null
      where id = v_page.id;

      -- Dummy failure: page 8, first attempt only.
      if v_page.page_number = 8 and v_page.attempt_count = 0 then
        update public.source_document_pages
        set
          status = 'FAILED',
          error_message = 'Dummy test failure',
          context_after = coalesce(v_before, '{}'::jsonb),
          processed_at = now()
        where id = v_page.id;
      else
        v_after := jsonb_build_object('dummy_last_page', v_page.page_number);

        update public.source_document_pages
        set
          status = 'DONE',
          error_message = null,
          context_after = v_after,
          processed_at = now()
        where id = v_page.id;

        update public.parsing_runs
        set context_state = v_after
        where id = v_run.id;
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
      insert into public.audit_logs (
        actor_type, actor_id, entity_type, entity_id, action, after_data
      ) values (
        'ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_COMPLETED',
        jsonb_build_object(
          'source_document_id', v_run.source_document_id,
          'status', v_new_status,
          'processed_pages', v_done,
          'error_page_count', v_failed
        )
      );
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
    -- run-level 치명적 오류: 특정 페이지 실패(위 page-8 분기)와는 별개로,
    -- 처리 구간 자체가 예기치 않게 실패한 경우에만 여기로 온다.
    update public.parsing_runs
    set status = 'FAILED', error_message = sqlerrm, completed_at = now()
    where id = v_run.id;

    update public.source_documents
    set status = 'FAILED', error_message = sqlerrm, processing_completed_at = now()
    where id = v_run.source_document_id;

    insert into public.audit_logs (
      actor_type, actor_id, entity_type, entity_id, action, after_data
    ) values (
      'ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_FAILED',
      jsonb_build_object('source_document_id', v_run.source_document_id, 'error', sqlerrm)
    );

    return jsonb_build_object(
      'run_id', v_run.id,
      'status', 'FAILED',
      'error_message', sqlerrm
    );
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) FAILED 페이지 최대 N개 재시도
--    Dummy에서는 실패 페이지가 재시도 시 성공한다.
-- -----------------------------------------------------------------------------
create or replace function public.retry_failed_dummy_pages(
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
  v_page record;
  v_before jsonb;
  v_after jsonb;
  v_done integer;
  v_failed integer;
  v_pending integer;
  v_processing integer;
  v_new_status text;
  v_doc_status text;
  v_terminal boolean;
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

  begin
    for v_page in
      select id, page_number
      from public.source_document_pages
      where parsing_run_id = v_run.id
        and status = 'FAILED'
      order by page_number asc
      limit p_batch_size
      for update skip locked
    loop
      select context_before into v_before
      from public.source_document_pages
      where id = v_page.id;

      update public.source_document_pages
      set
        status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        error_message = null
      where id = v_page.id;

      v_after := jsonb_build_object('dummy_last_page', v_page.page_number);

      update public.source_document_pages
      set
        status = 'DONE',
        error_message = null,
        context_before = coalesce(v_before, '{}'::jsonb),
        context_after = v_after,
        processed_at = now()
      where id = v_page.id;
    end loop;

    select
      count(*) filter (where status = 'DONE'),
      count(*) filter (where status = 'FAILED'),
      count(*) filter (where status = 'PENDING'),
      count(*) filter (where status = 'PROCESSING')
    into v_done, v_failed, v_pending, v_processing
    from public.source_document_pages
    where parsing_run_id = v_run.id;

    v_terminal := (v_pending = 0 and v_processing = 0);

    if v_terminal and v_failed = 0 then
      v_new_status := 'COMPLETED';
      v_doc_status := 'PARSED';
    elsif v_terminal and v_failed > 0 then
      v_new_status := 'COMPLETED_WITH_WARNINGS';
      v_doc_status := 'REVIEW_REQUIRED';
    else
      v_new_status := 'PROCESSING';
      v_doc_status := 'PROCESSING';
    end if;

    update public.parsing_runs
    set
      status = v_new_status,
      processed_pages = v_done,
      error_page_count = v_failed,
      completed_at = case when v_terminal then now() else null end,
      context_state = case
        when v_done > 0 then jsonb_build_object(
          'dummy_last_page', (
            select max(page_number)
            from public.source_document_pages
            where parsing_run_id = v_run.id and status = 'DONE'
          )
        )
        else context_state
      end
    where id = v_run.id;

    update public.source_documents
    set
      status = v_doc_status,
      processed_pages = v_done,
      processing_completed_at = case when v_terminal then now() else null end,
      error_message = case when v_failed > 0 then v_failed || '개 페이지 처리 실패' else null end
    where id = v_run.source_document_id;

    if v_terminal and v_failed = 0 then
      insert into public.audit_logs (
        actor_type, actor_id, entity_type, entity_id, action, after_data
      ) values (
        'ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_COMPLETED',
        jsonb_build_object(
          'source_document_id', v_run.source_document_id,
          'status', v_new_status,
          'processed_pages', v_done,
          'error_page_count', v_failed,
          'recovered_after_retry', true
        )
      );
    end if;

    return jsonb_build_object(
      'run_id', v_run.id,
      'status', v_new_status,
      'processed_pages', v_done,
      'error_page_count', v_failed,
      'pending_pages', v_pending
    );
  exception when others then
    update public.parsing_runs
    set status = 'FAILED', error_message = sqlerrm, completed_at = now()
    where id = v_run.id;

    update public.source_documents
    set status = 'FAILED', error_message = sqlerrm, processing_completed_at = now()
    where id = v_run.source_document_id;

    insert into public.audit_logs (
      actor_type, actor_id, entity_type, entity_id, action, after_data
    ) values (
      'ADMIN', v_user_id, 'parsing_run', v_run.id, 'PARSING_FAILED',
      jsonb_build_object('source_document_id', v_run.source_document_id, 'error', sqlerrm)
    );

    return jsonb_build_object(
      'run_id', v_run.id,
      'status', 'FAILED',
      'error_message', sqlerrm
    );
  end;
end;
$$;

grant execute on function public.start_dummy_parsing_run(uuid, integer) to authenticated;
grant execute on function public.process_next_dummy_batch(uuid, integer) to authenticated;
grant execute on function public.retry_failed_dummy_pages(uuid, integer) to authenticated;
