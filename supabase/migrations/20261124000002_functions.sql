-- 권한 판별 함수, 트리거, 업무 규칙 함수(RPC)

-- ---------------------------------------------------------------------------
-- 공통
-- ---------------------------------------------------------------------------
create or replace function public.kst_today() returns date
language sql stable
as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 권한 판별 (RLS 정책에서 사용). 비활성 사용자는 모든 권한을 잃는다.
-- ---------------------------------------------------------------------------
create or replace function public.is_executive() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active and global_role is not null
  )
$$;

-- 반환값: executive | site_manager | site_worker | partner | null(권한 없음)
create or replace function public.project_role(p_project uuid) returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.is_executive() then 'executive'
    else (
      select pm.role
      from project_members pm
      join profiles p on p.id = pm.user_id
      where pm.project_id = p_project and pm.user_id = auth.uid() and p.is_active
    )
  end
$$;

create or replace function public.is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select public.project_role(p_project) is not null $$;

create or replace function public.is_project_manager(p_project uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.project_role(p_project) in ('executive', 'site_manager'), false) $$;

-- 협력업체를 제외한 내부 구성원
create or replace function public.is_internal_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.project_role(p_project) in ('executive', 'site_manager', 'site_worker'), false)
$$;

create or replace function public.shares_project_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from project_members mine
    join project_members theirs on theirs.project_id = mine.project_id
    join profiles me on me.id = mine.user_id
    where mine.user_id = auth.uid() and me.is_active and theirs.user_id = p_user
  )
$$;

-- ---------------------------------------------------------------------------
-- 프로필
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email, full_name, phone, company, position)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, '사용자'), '@', 1)),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'company'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'position'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 전사 역할·활성 여부·이메일은 회장/대표이사 또는 서버(서비스 키)만 바꿀 수 있다.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_executive() then
    if new.global_role is distinct from old.global_role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception '권한이 없습니다: 역할, 활성 여부, 이메일은 관리자만 변경할 수 있습니다.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger processes_updated_at before update on public.processes
  for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger schedule_events_updated_at before update on public.schedule_events
  for each row execute function public.set_updated_at();
create trigger daily_reports_updated_at before update on public.daily_reports
  for each row execute function public.set_updated_at();
create trigger report_items_updated_at before update on public.report_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 알림
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_user uuid, p_project uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user is null or p_user = auth.uid() then
    return;  -- 본인이 한 작업은 본인에게 알리지 않는다
  end if;
  insert into notifications (user_id, project_id, type, title, body, link)
  values (p_user, p_project, p_type, p_title, p_body, p_link);
end $$;

-- 사업장 현장관리자에게 알림. 현장관리자가 없으면 회장/대표이사에게 보낸다.
create or replace function public.notify_managers(
  p_project uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
  v_found boolean := false;
begin
  for v_user in
    select pm.user_id from project_members pm
    join profiles p on p.id = pm.user_id
    where pm.project_id = p_project and pm.role = 'site_manager' and p.is_active
  loop
    v_found := true;
    perform public.notify(v_user, p_project, p_type, p_title, p_body, p_link);
  end loop;
  if not v_found then
    for v_user in select id from profiles where global_role is not null and is_active loop
      perform public.notify(v_user, p_project, p_type, p_title, p_body, p_link);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 변경 이력
-- ---------------------------------------------------------------------------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_project uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.key <> 'updated_at' and n.value is distinct from v_old -> n.key;
    if v_changed is null then
      return null;  -- 실제 변경 없음
    end if;
  end if;
  v_project := case
    when tg_table_name = 'projects' then (v_row ->> 'id')::uuid
    else (v_row ->> 'project_id')::uuid
  end;
  insert into audit_logs (project_id, table_name, record_id, action, actor_id, old_data, new_data, changed_fields)
  values (
    v_project, tg_table_name,
    coalesce((v_row ->> 'id')::uuid, (v_row ->> 'user_id')::uuid),
    tg_op, auth.uid(), v_old, v_new, v_changed
  );
  return null;
end $$;

create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function public.audit_row();
create trigger audit_project_members after insert or update or delete on public.project_members
  for each row execute function public.audit_row();
create trigger audit_processes after insert or update or delete on public.processes
  for each row execute function public.audit_row();
create trigger audit_tasks after insert or update or delete on public.tasks
  for each row execute function public.audit_row();
create trigger audit_schedule_events after insert or update or delete on public.schedule_events
  for each row execute function public.audit_row();
create trigger audit_daily_reports after insert or update or delete on public.daily_reports
  for each row execute function public.audit_row();
create trigger audit_report_items after insert or update or delete on public.report_items
  for each row execute function public.audit_row();
create trigger audit_report_photos after insert or delete on public.report_photos
  for each row execute function public.audit_row();
create trigger audit_change_requests after insert or update on public.change_requests
  for each row execute function public.audit_row();
create trigger audit_consolidated_reports after update on public.consolidated_reports
  for each row when (old.is_finalized is distinct from new.is_finalized
                     or old.summary is distinct from new.summary
                     or old.weather is distinct from new.weather)
  execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- 작업일보 보호 트리거
-- ---------------------------------------------------------------------------
-- 상태·승인 정보는 아래 업무 함수(submit_report 등)를 통해서만 바뀐다.
create or replace function public.daily_reports_guard() returns trigger
language plpgsql
as $$
declare
  v_allowed boolean := coalesce(current_setting('app.status_change', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_allowed then
      new.status := 'draft';
      new.submitted_at := null;
      new.approved_at := null;
      new.approved_by := null;
    end if;
    return new;
  end if;

  if new.project_id <> old.project_id or new.author_id <> old.author_id then
    raise exception '작업일보의 사업장과 작성자는 변경할 수 없습니다.' using errcode = '42501';
  end if;
  if not v_allowed and (
    new.status is distinct from old.status
    or new.submitted_at is distinct from old.submitted_at
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
  ) then
    raise exception '작업일보 상태는 제출·승인 절차를 통해서만 변경할 수 있습니다.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger daily_reports_guard before insert or update on public.daily_reports
  for each row execute function public.daily_reports_guard();

-- 작업내역: project_id 를 작업일보에서 가져오고, 공정·업무가 같은 사업장인지 검증한다.
create or replace function public.report_items_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from daily_reports where id = new.report_id;
  if v_project is null then
    raise exception '작업일보를 찾을 수 없습니다.' using errcode = '23503';
  end if;
  new.project_id := v_project;
  if new.process_id is not null and not exists (
    select 1 from processes where id = new.process_id and project_id = v_project
  ) then
    raise exception '다른 사업장의 공정은 선택할 수 없습니다.' using errcode = '23514';
  end if;
  if new.task_id is not null and not exists (
    select 1 from tasks where id = new.task_id and project_id = v_project
  ) then
    raise exception '다른 사업장의 업무는 선택할 수 없습니다.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger report_items_guard before insert or update on public.report_items
  for each row execute function public.report_items_guard();

create or replace function public.report_photos_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from daily_reports where id = new.report_id;
  if v_project is null then
    raise exception '작업일보를 찾을 수 없습니다.' using errcode = '23503';
  end if;
  new.project_id := v_project;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  if new.storage_path not like v_project::text || '/' || new.report_id::text || '/%' then
    raise exception '사진 경로가 올바르지 않습니다.' using errcode = '23514';
  end if;
  if new.item_id is not null and not exists (
    select 1 from report_items where id = new.item_id and report_id = new.report_id
  ) then
    raise exception '다른 작업일보의 작업내역에는 사진을 연결할 수 없습니다.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger report_photos_guard before insert or update on public.report_photos
  for each row execute function public.report_photos_guard();

-- ---------------------------------------------------------------------------
-- 업무 배정 트리거
-- ---------------------------------------------------------------------------
create or replace function public.tasks_before_write() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from project_members where project_id = new.project_id and user_id = new.assignee_id
  ) and not exists (
    select 1 from profiles where id = new.assignee_id and global_role is not null
  ) then
    raise exception '담당자는 해당 사업장 구성원이어야 합니다.' using errcode = '23514';
  end if;
  if new.process_id is not null and not exists (
    select 1 from processes where id = new.process_id and project_id = new.project_id
  ) then
    raise exception '다른 사업장의 공정은 선택할 수 없습니다.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.assigned_by := coalesce(auth.uid(), new.assigned_by);
  elsif new.project_id <> old.project_id then
    raise exception '업무의 사업장은 변경할 수 없습니다.' using errcode = '42501';
  end if;
  if new.status = 'done' then
    new.progress := 100;
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
    if new.progress = 100 then
      new.status := 'done';
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

create or replace function public.tasks_notify() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.assignee_id <> old.assignee_id then
    perform public.notify(
      new.assignee_id, new.project_id, 'task_assigned',
      '새 업무가 배정되었습니다', new.title, '/tasks'
    );
  end if;
  return null;
end $$;

create trigger tasks_notify after insert or update on public.tasks
  for each row execute function public.tasks_notify();

-- ---------------------------------------------------------------------------
-- 공정률
-- ---------------------------------------------------------------------------
-- 계획 공정률: 계획 기간 대비 경과일의 선형 값
create or replace function public.planned_progress(p_start date, p_end date, p_as_of date)
returns numeric
language sql immutable
as $$
  select case
    when p_as_of < p_start then 0
    when p_as_of >= p_end then 100
    else round(((p_as_of - p_start + 1)::numeric / (p_end - p_start + 1)) * 100, 2)
  end
$$;

-- 공정 실적률이 바뀌면 기록을 남긴다 (승인 반영 시에는 작업일을 기록일로 쓴다)
create or replace function public.processes_log_progress() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_date text := nullif(current_setting('app.progress_log_date', true), '');
  v_report text := nullif(current_setting('app.progress_report_id', true), '');
begin
  if tg_op = 'INSERT' and new.progress = 0 then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.progress = old.progress then
    return null;
  end if;
  insert into process_progress_logs (project_id, process_id, log_date, progress, source_report_id, recorded_by)
  values (new.project_id, new.id, coalesce(v_date::date, public.kst_today()), new.progress, v_report::uuid, auth.uid());
  return null;
end $$;

create trigger processes_log_progress after insert or update on public.processes
  for each row execute function public.processes_log_progress();

-- 특정 일자 기준 공정 실적률 (기록이 없으면 0)
create or replace function public.process_progress_at(p_process uuid, p_as_of date)
returns numeric
language sql stable
as $$
  select coalesce((
    select l.progress from public.process_progress_logs l
    where l.process_id = p_process and l.log_date <= p_as_of
    order by l.log_date desc, l.created_at desc
    limit 1
  ), 0)
$$;

-- 전체 공정률 = Σ(가중치 × 공정률) ÷ Σ가중치
create or replace function public.project_progress(p_project uuid, p_as_of date default null)
returns table (actual numeric, planned numeric, total_weight numeric)
language sql stable
as $$
  with d as (select coalesce(p_as_of, public.kst_today()) as as_of),
  rows as (
    select
      p.weight,
      case when d.as_of >= public.kst_today() then p.progress
           else public.process_progress_at(p.id, d.as_of) end as actual,
      public.planned_progress(p.planned_start, p.planned_end, d.as_of) as planned
    from public.processes p, d
    where p.project_id = p_project
  )
  select
    coalesce(round(sum(weight * actual) / nullif(sum(weight), 0), 2), 0),
    coalesce(round(sum(weight * planned) / nullif(sum(weight), 0), 2), 0),
    coalesce(sum(weight), 0)
  from rows
$$;

-- 공정별 현황 (계획률, 지연 여부 포함)
create or replace view public.process_status
with (security_invoker = true) as
select
  p.*,
  public.planned_progress(p.planned_start, p.planned_end, public.kst_today()) as planned_progress,
  (
    p.progress < 100 and (
      p.planned_end < public.kst_today()
      or public.planned_progress(p.planned_start, p.planned_end, public.kst_today()) - p.progress >= 10
    )
  ) as is_delayed
from public.processes p;

-- ---------------------------------------------------------------------------
-- 통합 작업일보
-- ---------------------------------------------------------------------------
create or replace function public.build_consolidated_snapshot(p_project uuid, p_date date)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with approved as (
    select r.*, p.full_name, p.company, p.position,
      coalesce(pm.role, case when p.global_role is not null then 'executive' end) as member_role
    from daily_reports r
    join profiles p on p.id = r.author_id
    left join project_members pm on pm.project_id = r.project_id and pm.user_id = r.author_id
    where r.project_id = p_project and r.work_date = p_date and r.status = 'approved'
  ),
  items as (
    select i.*, a.full_name, pr.name as process_name, pr.sort_order as process_order, t.title as task_title
    from report_items i
    join approved a on a.id = i.report_id
    left join processes pr on pr.id = i.process_id
    left join tasks t on t.id = i.task_id
  )
  select jsonb_build_object(
    'report_date', p_date,
    'worker_count', (select count(*) from approved),
    'total_work_minutes', (select coalesce(sum(work_minutes), 0) from approved),
    'progress', (select jsonb_build_object('actual', pp.actual, 'planned', pp.planned)
                 from public.project_progress(p_project, p_date) pp),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'report_id', a.id,
        'author_id', a.author_id,
        'author_name', a.full_name,
        'company', a.company,
        'role', a.member_role,
        'start_time', to_char(a.start_time, 'HH24:MI'),
        'end_time', to_char(a.end_time, 'HH24:MI'),
        'break_minutes', a.break_minutes,
        'work_minutes', a.work_minutes,
        'notes', a.notes,
        'support_request', a.support_request,
        'next_day_plan', a.next_day_plan,
        'photo_count', (select count(*) from report_photos ph where ph.report_id = a.id),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'process_name', i.process_name,
            'task_title', i.task_title,
            'content', i.content,
            'result', i.result,
            'quantity', i.quantity,
            'unit', i.unit,
            'status', i.status,
            'process_progress', i.process_progress
          ) order by i.sort_order, i.created_at)
          from items i where i.report_id = a.id
        ), '[]'::jsonb)
      ) order by a.full_name)
      from approved a
    ), '[]'::jsonb),
    'by_process', coalesce((
      select jsonb_agg(g.obj order by g.process_order nulls last, g.process_name)
      from (
        select
          min(i.process_order) as process_order,
          coalesce(i.process_name, '공정 미지정') as process_name,
          jsonb_build_object(
            'process_id', i.process_id,
            'process_name', coalesce(i.process_name, '공정 미지정'),
            'worker_count', count(distinct i.report_id),
            'items', jsonb_agg(jsonb_build_object(
              'author_name', i.full_name,
              'content', i.content,
              'result', i.result,
              'quantity', i.quantity,
              'unit', i.unit,
              'status', i.status
            ) order by i.full_name, i.sort_order)
          ) as obj
        from items i
        group by i.process_id, i.process_name
      ) g
    ), '[]'::jsonb),
    'issues', coalesce((
      select jsonb_agg(jsonb_build_object('author_name', a.full_name, 'text', a.notes) order by a.full_name)
      from approved a where nullif(btrim(a.notes), '') is not null
    ), '[]'::jsonb),
    'support_requests', coalesce((
      select jsonb_agg(jsonb_build_object('author_name', a.full_name, 'text', a.support_request) order by a.full_name)
      from approved a where nullif(btrim(a.support_request), '') is not null
    ), '[]'::jsonb),
    'next_day_plans', coalesce((
      select jsonb_agg(jsonb_build_object('author_name', a.full_name, 'text', a.next_day_plan) order by a.full_name)
      from approved a where nullif(btrim(a.next_day_plan), '') is not null
    ), '[]'::jsonb)
  )
$$;

-- 확정되지 않은 통합 작업일보를 최신 승인 내용으로 다시 취합한다.
create or replace function public.refresh_consolidated_report(p_project uuid, p_date date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into consolidated_reports (project_id, report_date, snapshot, generated_at)
  values (p_project, p_date, public.build_consolidated_snapshot(p_project, p_date), now())
  on conflict (project_id, report_date) do update
    set snapshot = excluded.snapshot, generated_at = now()
    where not consolidated_reports.is_finalized;
end $$;

-- 관리자: 날씨·종합 의견 저장 및 확정/확정 해제
create or replace function public.save_consolidated_report(
  p_project uuid, p_date date, p_weather text, p_summary text, p_finalize boolean
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_project_manager(p_project) then
    raise exception '통합 작업일보는 관리자만 저장할 수 있습니다.' using errcode = '42501';
  end if;
  -- 확정 해제 후 재취합할 수 있도록 먼저 확정 상태를 푼다
  update consolidated_reports
    set is_finalized = false, finalized_by = null, finalized_at = null
    where project_id = p_project and report_date = p_date and is_finalized and not p_finalize;
  perform public.refresh_consolidated_report(p_project, p_date);
  update consolidated_reports
    set weather = nullif(btrim(p_weather), ''),
        summary = nullif(btrim(p_summary), ''),
        is_finalized = p_finalize,
        finalized_by = case when p_finalize then auth.uid() end,
        finalized_at = case when p_finalize then now() end
    where project_id = p_project and report_date = p_date
    returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 작업일보 제출 / 검토 / 수정 요청
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(p_report uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  r daily_reports;
  v_name text;
begin
  select * into r from daily_reports where id = p_report for update;
  if r.id is null or r.author_id <> auth.uid() or not public.is_project_member(r.project_id) then
    raise exception '본인의 작업일보만 제출할 수 있습니다.' using errcode = '42501';
  end if;
  if r.status not in ('draft', 'revision_requested') then
    raise exception '이미 제출된 작업일보입니다.' using errcode = 'P0001';
  end if;
  if r.work_date > public.kst_today() then
    raise exception '미래 날짜의 작업일보는 제출할 수 없습니다.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from report_items where report_id = r.id) then
    raise exception '작업내역을 1건 이상 입력해야 제출할 수 있습니다.' using errcode = 'P0001';
  end if;

  perform set_config('app.status_change', 'on', true);
  update daily_reports
    set status = 'submitted', submitted_at = now(), approved_at = null, approved_by = null
    where id = r.id;
  perform set_config('app.status_change', '', true);

  insert into report_reviews (report_id, project_id, actor_id, action)
  values (r.id, r.project_id, auth.uid(),
          case when r.status = 'revision_requested' then 'resubmitted' else 'submitted' end);

  select full_name into v_name from profiles where id = r.author_id;
  perform public.notify_managers(
    r.project_id, 'report_submitted', '작업일보가 제출되었습니다',
    v_name || ' · ' || to_char(r.work_date, 'YYYY-MM-DD'), '/reports/' || r.id
  );
end $$;

-- p_decision: 'approved' | 'revision_requested'
create or replace function public.review_report(p_report uuid, p_decision text, p_comment text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r daily_reports;
  it report_items;
  v_new_progress numeric;
begin
  select * into r from daily_reports where id = p_report for update;
  if r.id is null or not public.is_project_manager(r.project_id) then
    raise exception '작업일보를 검토할 권한이 없습니다.' using errcode = '42501';
  end if;
  if r.author_id = auth.uid() then
    raise exception '본인이 작성한 작업일보는 직접 검토할 수 없습니다.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'revision_requested') then
    raise exception '잘못된 검토 결과입니다.' using errcode = 'P0001';
  end if;
  if r.status <> 'submitted' then
    raise exception '제출 상태의 작업일보만 검토할 수 있습니다.' using errcode = 'P0001';
  end if;
  if p_decision = 'revision_requested' and nullif(btrim(coalesce(p_comment, '')), '') is null then
    raise exception '보완 요청 사유를 입력해 주세요.' using errcode = 'P0001';
  end if;

  perform set_config('app.status_change', 'on', true);
  if p_decision = 'approved' then
    update daily_reports set status = 'approved', approved_at = now(), approved_by = auth.uid()
      where id = r.id;
  else
    update daily_reports set status = 'revision_requested', approved_at = null, approved_by = null
      where id = r.id;
  end if;
  perform set_config('app.status_change', '', true);

  insert into report_reviews (report_id, project_id, actor_id, action, comment)
  values (r.id, r.project_id, auth.uid(), p_decision, nullif(btrim(coalesce(p_comment, '')), ''));

  if p_decision = 'approved' then
    -- 승인된 작업내역을 업무·공정 실적에 반영한다
    perform set_config('app.progress_log_date', r.work_date::text, true);
    perform set_config('app.progress_report_id', r.id::text, true);
    for it in select * from report_items where report_id = r.id order by sort_order, created_at loop
      if it.task_id is not null then
        update tasks set
          progress = case
            when it.status = 'completed' then 100
            else coalesce(it.task_progress, progress) end,
          status = case
            when it.status = 'completed' or it.task_progress = 100 then 'done'
            when it.status = 'on_hold' then 'on_hold'
            else 'in_progress' end
        where id = it.task_id;
      end if;
      if it.process_id is not null then
        -- 이후 작업일의 실적이 이미 반영되어 있으면 실적률은 덮어쓰지 않는다
        v_new_progress := case
          when it.process_progress is not null and not exists (
            select 1 from process_progress_logs l
            where l.process_id = it.process_id and l.log_date > r.work_date
          ) then it.process_progress
        end;
        update processes set
          actual_start = least(coalesce(actual_start, r.work_date), r.work_date),
          progress = coalesce(v_new_progress, progress),
          actual_end = case
            when coalesce(v_new_progress, progress) >= 100 then coalesce(actual_end, r.work_date)
            else null end
        where id = it.process_id;
      end if;
    end loop;
    perform set_config('app.progress_log_date', '', true);
    perform set_config('app.progress_report_id', '', true);
    perform public.refresh_consolidated_report(r.project_id, r.work_date);
    perform public.notify(
      r.author_id, r.project_id, 'report_approved', '작업일보가 승인되었습니다',
      to_char(r.work_date, 'YYYY-MM-DD') || ' 작업일보', '/reports/' || r.id
    );
  else
    perform public.notify(
      r.author_id, r.project_id, 'report_revision_requested', '작업일보 보완 요청',
      to_char(r.work_date, 'YYYY-MM-DD') || ' · ' || btrim(p_comment), '/reports/' || r.id
    );
  end if;
end $$;

-- 승인 완료된 작업일보의 수정 요청
create or replace function public.request_report_change(p_report uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  r daily_reports;
  v_id uuid;
  v_name text;
begin
  select * into r from daily_reports where id = p_report for update;
  if r.id is null or r.author_id <> auth.uid() or not public.is_project_member(r.project_id) then
    raise exception '본인의 작업일보만 수정 요청할 수 있습니다.' using errcode = '42501';
  end if;
  if r.status <> 'approved' then
    raise exception '승인 완료된 작업일보만 수정 요청할 수 있습니다.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '수정 요청 사유를 입력해 주세요.' using errcode = 'P0001';
  end if;
  if exists (select 1 from change_requests where report_id = r.id and status = 'pending') then
    raise exception '이미 처리 대기 중인 수정 요청이 있습니다.' using errcode = 'P0001';
  end if;

  insert into change_requests (report_id, project_id, requester_id, reason)
  values (r.id, r.project_id, auth.uid(), btrim(p_reason))
  returning id into v_id;
  insert into report_reviews (report_id, project_id, actor_id, action, comment)
  values (r.id, r.project_id, auth.uid(), 'change_requested', btrim(p_reason));

  select full_name into v_name from profiles where id = r.author_id;
  perform public.notify_managers(
    r.project_id, 'change_requested', '승인된 작업일보 수정 요청',
    v_name || ' · ' || to_char(r.work_date, 'YYYY-MM-DD'), '/reports/' || r.id
  );
  return v_id;
end $$;

create or replace function public.review_change_request(
  p_request uuid, p_approve boolean, p_comment text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  c change_requests;
  r daily_reports;
begin
  select * into c from change_requests where id = p_request for update;
  if c.id is null or not public.is_project_manager(c.project_id) then
    raise exception '수정 요청을 처리할 권한이 없습니다.' using errcode = '42501';
  end if;
  if c.requester_id = auth.uid() then
    raise exception '본인의 수정 요청은 직접 처리할 수 없습니다.' using errcode = '42501';
  end if;
  if c.status <> 'pending' then
    raise exception '이미 처리된 수정 요청입니다.' using errcode = 'P0001';
  end if;
  select * into r from daily_reports where id = c.report_id for update;

  update change_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewer_id = auth.uid(),
        review_comment = nullif(btrim(coalesce(p_comment, '')), ''),
        reviewed_at = now()
    where id = c.id;
  insert into report_reviews (report_id, project_id, actor_id, action, comment)
  values (c.report_id, c.project_id, auth.uid(),
          case when p_approve then 'change_approved' else 'change_rejected' end,
          nullif(btrim(coalesce(p_comment, '')), ''));

  if p_approve then
    perform set_config('app.status_change', 'on', true);
    update daily_reports set status = 'revision_requested', approved_at = null, approved_by = null
      where id = c.report_id;
    perform set_config('app.status_change', '', true);
    -- 승인이 풀린 작업일보는 재승인 전까지 통합 작업일보에서 빠진다
    perform public.refresh_consolidated_report(r.project_id, r.work_date);
  end if;

  perform public.notify(
    c.requester_id, c.project_id,
    case when p_approve then 'change_approved' else 'change_rejected' end,
    case when p_approve then '수정 요청이 승인되었습니다' else '수정 요청이 반려되었습니다' end,
    to_char(r.work_date, 'YYYY-MM-DD') || ' 작업일보', '/reports/' || c.report_id
  );
end $$;

-- 작업일보와 작업내역을 한 번에(한 트랜잭션으로) 저장한다.
-- 호출자 권한으로 실행되므로 RLS 와 보호 트리거가 그대로 적용된다.
-- p_data: { work_date, start_time, end_time, break_minutes, notes, support_request, next_day_plan,
--           items: [{ id?, process_id, task_id, content, result, quantity, unit, status, task_progress, process_progress }] }
create or replace function public.save_report(p_project uuid, p_report uuid, p_data jsonb) returns uuid
language plpgsql set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_index integer := 0;
  v_keep uuid[] := '{}';
begin
  if p_report is null then
    insert into daily_reports (
      project_id, author_id, work_date, start_time, end_time, break_minutes, notes, support_request, next_day_plan
    ) values (
      p_project, auth.uid(),
      (p_data ->> 'work_date')::date, (p_data ->> 'start_time')::time, (p_data ->> 'end_time')::time,
      (p_data ->> 'break_minutes')::integer,
      nullif(btrim(p_data ->> 'notes'), ''), nullif(btrim(p_data ->> 'support_request'), ''),
      nullif(btrim(p_data ->> 'next_day_plan'), '')
    ) returning id into v_id;
  else
    update daily_reports set
      work_date = (p_data ->> 'work_date')::date,
      start_time = (p_data ->> 'start_time')::time,
      end_time = (p_data ->> 'end_time')::time,
      break_minutes = (p_data ->> 'break_minutes')::integer,
      notes = nullif(btrim(p_data ->> 'notes'), ''),
      support_request = nullif(btrim(p_data ->> 'support_request'), ''),
      next_day_plan = nullif(btrim(p_data ->> 'next_day_plan'), '')
    where id = p_report and author_id = auth.uid()
    returning id into v_id;
    if v_id is null then
      raise exception '수정할 수 없는 작업일보입니다. 이미 제출되었거나 권한이 없습니다.' using errcode = '42501';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_data -> 'items', '[]'::jsonb)) loop
    if nullif(v_item ->> 'id', '') is not null then
      update report_items set
        process_id = nullif(v_item ->> 'process_id', '')::uuid,
        task_id = nullif(v_item ->> 'task_id', '')::uuid,
        sort_order = v_index,
        content = v_item ->> 'content',
        result = nullif(btrim(v_item ->> 'result'), ''),
        quantity = nullif(v_item ->> 'quantity', '')::numeric,
        unit = nullif(btrim(v_item ->> 'unit'), ''),
        status = v_item ->> 'status',
        task_progress = nullif(v_item ->> 'task_progress', '')::integer,
        process_progress = nullif(v_item ->> 'process_progress', '')::numeric
      where id = (v_item ->> 'id')::uuid and report_id = v_id
      returning id into v_item_id;
      if v_item_id is null then
        raise exception '작업내역을 찾을 수 없습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.' using errcode = 'P0001';
      end if;
    else
      insert into report_items (
        report_id, project_id, process_id, task_id, sort_order, content, result, quantity, unit,
        status, task_progress, process_progress
      ) values (
        v_id, p_project,
        nullif(v_item ->> 'process_id', '')::uuid, nullif(v_item ->> 'task_id', '')::uuid, v_index,
        v_item ->> 'content', nullif(btrim(v_item ->> 'result'), ''),
        nullif(v_item ->> 'quantity', '')::numeric, nullif(btrim(v_item ->> 'unit'), ''),
        v_item ->> 'status',
        nullif(v_item ->> 'task_progress', '')::integer, nullif(v_item ->> 'process_progress', '')::numeric
      ) returning id into v_item_id;
    end if;
    v_keep := v_keep || v_item_id;
    v_index := v_index + 1;
  end loop;

  delete from report_items where report_id = v_id and not (id = any (v_keep));
  return v_id;
end $$;

-- 담당자가 본인 업무의 진행상태를 갱신한다
create or replace function public.update_my_task(p_task uuid, p_status text, p_progress integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t tasks;
begin
  select * into t from tasks where id = p_task for update;
  if t.id is null or t.assignee_id <> auth.uid() or not public.is_project_member(t.project_id) then
    raise exception '본인에게 배정된 업무만 변경할 수 있습니다.' using errcode = '42501';
  end if;
  update tasks set status = p_status, progress = p_progress where id = p_task;
end $$;

-- ---------------------------------------------------------------------------
-- 작업일보 제출 현황 (해당 일자, 현장관리자·현장팀 기준)
-- ---------------------------------------------------------------------------
create or replace function public.submission_status(p_project uuid, p_date date)
returns table (
  user_id uuid, full_name text, company text, role text, report_id uuid, status text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_internal_member(p_project) then
    raise exception '제출 현황을 조회할 권한이 없습니다.' using errcode = '42501';
  end if;
  return query
    select pm.user_id, p.full_name, p.company, pm.role, r.id, r.status
    from project_members pm
    join profiles p on p.id = pm.user_id and p.is_active
    left join daily_reports r
      on r.project_id = pm.project_id and r.author_id = pm.user_id and r.work_date = p_date
    where pm.project_id = p_project and pm.role in ('site_manager', 'site_worker')
    order by p.full_name;
end $$;

-- ---------------------------------------------------------------------------
-- 실행 권한: 로그인 사용자에게만 허용하고, 내부 전용 함수는 막는다.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function
  public.notify(uuid, uuid, text, text, text, text),
  public.notify_managers(uuid, text, text, text, text),
  public.refresh_consolidated_report(uuid, date),
  public.build_consolidated_snapshot(uuid, date)
from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
