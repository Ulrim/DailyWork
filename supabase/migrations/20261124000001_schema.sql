-- CULIVER 스마트팜 통합 현장관리 시스템: 테이블 정의
-- 모든 사업 데이터는 project_id 기준으로 관리한다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 사용자 프로필 (auth.users 와 1:1)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  company text,
  position text,
  -- 전사 역할: chairman(회장), ceo(대표이사). 그 외 사용자는 null.
  global_role text check (global_role in ('chairman', 'ceo')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 사업장(프로젝트)
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null check (length(btrim(name)) > 0),
  location text,
  description text,
  start_date date,
  end_date date,
  status text not null default 'active'
    check (status in ('planning', 'active', 'completed', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- 사업장 소속 및 역할: site_manager(현장관리자), site_worker(현장팀), partner(협력업체)
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('site_manager', 'site_worker', 'partner')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------------
-- 공정
-- ---------------------------------------------------------------------------
create table public.processes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text,
  sort_order integer not null default 0,
  weight numeric(6, 2) not null default 1 check (weight >= 0),
  planned_start date not null,
  planned_end date not null,
  actual_start date,
  actual_end date,
  progress numeric(5, 2) not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end >= planned_start),
  check (actual_end is null or actual_start is null or actual_end >= actual_start),
  unique (project_id, name)
);
create index processes_project_idx on public.processes (project_id, sort_order);

-- 공정 실적률 변경 기록 (계획 대비 실적 추이)
create table public.process_progress_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  process_id uuid not null references public.processes (id) on delete cascade,
  log_date date not null,
  progress numeric(5, 2) not null check (progress between 0 and 100),
  source_report_id uuid,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index process_progress_logs_idx
  on public.process_progress_logs (project_id, process_id, log_date);

-- ---------------------------------------------------------------------------
-- 업무 배정
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  process_id uuid references public.processes (id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  description text,
  assignee_id uuid not null references public.profiles (id) on delete restrict,
  assigned_by uuid references public.profiles (id) on delete set null,
  start_date date,
  due_date date,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'on_hold')),
  progress integer not null default 0 check (progress between 0 and 100),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index tasks_project_idx on public.tasks (project_id, status);
create index tasks_assignee_idx on public.tasks (assignee_id, status);

-- ---------------------------------------------------------------------------
-- 일정 (owner_id 가 null 이면 전체 일정, 값이 있으면 개인 일정)
-- ---------------------------------------------------------------------------
create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text,
  start_date date not null,
  end_date date not null,
  event_type text not null default 'construction'
    check (event_type in ('construction', 'meeting', 'inspection', 'delivery', 'personal', 'other')),
  owner_id uuid references public.profiles (id) on delete cascade,
  process_id uuid references public.processes (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index schedule_events_project_idx on public.schedule_events (project_id, start_date, end_date);

-- ---------------------------------------------------------------------------
-- 개인 작업일보
-- ---------------------------------------------------------------------------
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 60 check (break_minutes between 0 and 600),
  -- 실제 작업시간(분) = 종료 - 시작 - 휴게
  work_minutes integer generated always as (
    (extract(epoch from (end_time - start_time)) / 60)::integer - break_minutes
  ) stored,
  notes text,            -- 특이사항
  support_request text,  -- 지원 요청사항
  next_day_plan text,    -- 익일 작업계획
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'revision_requested')),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((extract(epoch from (end_time - start_time)) / 60)::integer - break_minutes > 0),
  -- 한 사람은 한 사업장에서 하루에 작업일보 1건만 작성할 수 있다 (중복 제출 차단)
  unique (project_id, author_id, work_date)
);
create index daily_reports_project_date_idx on public.daily_reports (project_id, work_date, status);

-- 작업내역 (작업일보 1건에 여러 건)
create table public.report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  process_id uuid references public.processes (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  sort_order integer not null default 0,
  content text not null check (length(btrim(content)) > 0),  -- 작업내용
  result text,                                               -- 작업실적
  quantity numeric(12, 2) check (quantity is null or quantity >= 0),
  unit text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'delayed', 'on_hold')),
  -- 연결된 업무의 누계 진행률(%)
  task_progress integer check (task_progress is null or task_progress between 0 and 100),
  -- 공정 누계 실적률(%). 승인 시 공정 실적률에 반영된다.
  process_progress numeric(5, 2)
    check (process_progress is null or process_progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_items_report_idx on public.report_items (report_id, sort_order);
create index report_items_process_idx on public.report_items (project_id, process_id);

-- 현장 사진
create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports (id) on delete cascade,
  item_id uuid references public.report_items (id) on delete set null,
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique,
  caption text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index report_photos_report_idx on public.report_photos (report_id);

-- 제출/승인/보완 요청/수정 요청 이력
create table public.report_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in (
    'submitted', 'resubmitted', 'approved', 'revision_requested',
    'change_requested', 'change_approved', 'change_rejected'
  )),
  comment text,
  created_at timestamptz not null default now()
);
create index report_reviews_report_idx on public.report_reviews (report_id, created_at);

-- 승인 완료된 작업일보의 수정 요청
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete restrict,
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references public.profiles (id) on delete set null,
  review_comment text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index change_requests_one_pending_idx
  on public.change_requests (report_id) where status = 'pending';
create index change_requests_project_idx on public.change_requests (project_id, status);

-- ---------------------------------------------------------------------------
-- 통합 작업일보 (승인된 개인 작업일보를 작업일 단위로 취합한 스냅샷)
-- ---------------------------------------------------------------------------
create table public.consolidated_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  report_date date not null,
  weather text,
  summary text,  -- 관리자 종합 의견
  snapshot jsonb not null default '{}'::jsonb,
  is_finalized boolean not null default false,
  finalized_by uuid references public.profiles (id) on delete set null,
  finalized_at timestamptz,
  generated_at timestamptz not null default now(),
  unique (project_id, report_date)
);

-- ---------------------------------------------------------------------------
-- 알림
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- 변경 이력 (트리거로 자동 기록)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  project_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  created_at timestamptz not null default now()
);
create index audit_logs_project_idx on public.audit_logs (project_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);
