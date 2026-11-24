-- 행 수준 보안(RLS): 사업장별 권한을 데이터베이스에서 검증한다.

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.processes enable row level security;
alter table public.process_progress_logs enable row level security;
alter table public.tasks enable row level security;
alter table public.schedule_events enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_items enable row level security;
alter table public.report_photos enable row level security;
alter table public.report_reviews enable row level security;
alter table public.change_requests enable row level security;
alter table public.consolidated_reports enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- 테이블 권한: 비로그인(anon)은 접근 불가, 로그인 사용자는 RLS 범위 안에서만 접근
revoke all on all tables in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to authenticated, service_role;
-- 이력·알림·검토 기록은 함수와 트리거로만 기록한다
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.report_reviews from authenticated;
revoke insert, update, delete on public.change_requests from authenticated;
revoke insert, update, delete on public.process_progress_logs from authenticated;
revoke insert, update, delete on public.consolidated_reports from authenticated;
revoke insert, delete on public.notifications from authenticated;
revoke insert, delete on public.profiles from authenticated;

-- profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_executive() or public.shares_project_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_executive())
  with check (id = auth.uid() or public.is_executive());

-- projects ------------------------------------------------------------------
create policy projects_select on public.projects for select to authenticated
  using (public.is_project_member(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_executive());
create policy projects_update on public.projects for update to authenticated
  using (public.is_executive()) with check (public.is_executive());
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_executive());

-- project_members -----------------------------------------------------------
-- 현장관리자는 현장팀·협력업체만 관리할 수 있고, 현장관리자 지정은 회장/대표이사만 한다.
create policy project_members_select on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.is_internal_member(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (
    public.is_executive()
    or (public.is_project_manager(project_id) and role <> 'site_manager')
  );
create policy project_members_update on public.project_members for update to authenticated
  using (
    public.is_executive()
    or (public.is_project_manager(project_id) and role <> 'site_manager')
  )
  with check (
    public.is_executive()
    or (public.is_project_manager(project_id) and role <> 'site_manager')
  );
create policy project_members_delete on public.project_members for delete to authenticated
  using (
    public.is_executive()
    or (public.is_project_manager(project_id) and role <> 'site_manager')
  );

-- processes -----------------------------------------------------------------
create policy processes_select on public.processes for select to authenticated
  using (public.is_project_member(project_id));
create policy processes_insert on public.processes for insert to authenticated
  with check (public.is_project_manager(project_id));
create policy processes_update on public.processes for update to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));
create policy processes_delete on public.processes for delete to authenticated
  using (public.is_project_manager(project_id));

create policy process_progress_logs_select on public.process_progress_logs for select to authenticated
  using (public.is_internal_member(project_id));

-- tasks: 협력업체는 본인에게 배정된 업무만 본다 ---------------------------------
create policy tasks_select on public.tasks for select to authenticated
  using (
    public.is_internal_member(project_id)
    or (assignee_id = auth.uid() and public.is_project_member(project_id))
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_project_manager(project_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_project_manager(project_id));

-- schedule_events -----------------------------------------------------------
-- 전체 일정(owner_id null)은 내부 구성원이 조회, 개인 일정은 본인과 관리자만 조회
create policy schedule_events_select on public.schedule_events for select to authenticated
  using (
    (owner_id is null and public.is_internal_member(project_id))
    or (owner_id = auth.uid() and public.is_project_member(project_id))
    or public.is_project_manager(project_id)
  );
create policy schedule_events_insert on public.schedule_events for insert to authenticated
  with check (
    public.is_project_manager(project_id)
    or (owner_id = auth.uid() and public.is_project_member(project_id))
  );
create policy schedule_events_update on public.schedule_events for update to authenticated
  using (
    public.is_project_manager(project_id)
    or (owner_id = auth.uid() and public.is_project_member(project_id))
  )
  with check (
    public.is_project_manager(project_id)
    or (owner_id = auth.uid() and public.is_project_member(project_id))
  );
create policy schedule_events_delete on public.schedule_events for delete to authenticated
  using (
    public.is_project_manager(project_id)
    or (owner_id = auth.uid() and public.is_project_member(project_id))
  );

-- daily_reports -------------------------------------------------------------
-- 조회: 본인, 관리자, 그리고 내부 구성원은 승인된 일보
-- 작성/수정: 본인이 작성중·보완 요청 상태일 때만. 상태 변경은 함수로만 가능(트리거로 차단).
create policy daily_reports_select on public.daily_reports for select to authenticated
  using (
    (author_id = auth.uid() and public.is_project_member(project_id))
    or public.is_project_manager(project_id)
    or (status = 'approved' and public.is_internal_member(project_id))
  );
create policy daily_reports_insert on public.daily_reports for insert to authenticated
  with check (author_id = auth.uid() and public.is_project_member(project_id));
create policy daily_reports_update on public.daily_reports for update to authenticated
  using (
    author_id = auth.uid() and public.is_project_member(project_id)
    and status in ('draft', 'revision_requested')
  )
  with check (author_id = auth.uid() and public.is_project_member(project_id));
create policy daily_reports_delete on public.daily_reports for delete to authenticated
  using (author_id = auth.uid() and public.is_project_member(project_id) and status = 'draft');

-- 작성자가 수정 가능한 상태의 작업일보인지 확인
create or replace function public.can_edit_report(p_report uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from daily_reports r
    where r.id = p_report and r.author_id = auth.uid()
      and r.status in ('draft', 'revision_requested')
      and public.is_project_member(r.project_id)
  )
$$;
revoke execute on function public.can_edit_report(uuid) from public, anon;
grant execute on function public.can_edit_report(uuid) to authenticated, service_role;

-- report_items / report_photos: 조회는 작업일보 조회 권한을 따른다 ----------------
create policy report_items_select on public.report_items for select to authenticated
  using (exists (select 1 from public.daily_reports r where r.id = report_id));
create policy report_items_insert on public.report_items for insert to authenticated
  with check (public.can_edit_report(report_id));
create policy report_items_update on public.report_items for update to authenticated
  using (public.can_edit_report(report_id)) with check (public.can_edit_report(report_id));
create policy report_items_delete on public.report_items for delete to authenticated
  using (public.can_edit_report(report_id));

create policy report_photos_select on public.report_photos for select to authenticated
  using (exists (select 1 from public.daily_reports r where r.id = report_id));
create policy report_photos_insert on public.report_photos for insert to authenticated
  with check (public.can_edit_report(report_id));
create policy report_photos_update on public.report_photos for update to authenticated
  using (public.can_edit_report(report_id)) with check (public.can_edit_report(report_id));
create policy report_photos_delete on public.report_photos for delete to authenticated
  using (public.can_edit_report(report_id));

create policy report_reviews_select on public.report_reviews for select to authenticated
  using (exists (select 1 from public.daily_reports r where r.id = report_id));

create policy change_requests_select on public.change_requests for select to authenticated
  using (
    (requester_id = auth.uid() and public.is_project_member(project_id))
    or public.is_project_manager(project_id)
  );

-- consolidated_reports ------------------------------------------------------
create policy consolidated_reports_select on public.consolidated_reports for select to authenticated
  using (public.is_internal_member(project_id));

-- notifications -------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_logs ----------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    public.is_executive()
    or (project_id is not null and public.is_project_manager(project_id))
  );
