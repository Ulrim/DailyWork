// 개발·테스트용 예시 데이터를 넣는다. 운영 DB 에는 절대 실행하지 않는다.
//
//   node --env-file=.env.local scripts/seed-dev.mjs --confirm
//
// 안전장치: APP_ENV 가 development/staging 이고 --confirm 을 붙였을 때만 동작하며,
//           이미 사업장이 하나라도 있으면 중단한다.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const env = process.env.APP_ENV;
if (!["development", "staging"].includes(env ?? "")) {
  console.error(`APP_ENV=${env ?? "(없음)"}: 테스트 데이터는 development/staging 환경에서만 넣을 수 있습니다.`);
  process.exit(1);
}
if (!process.argv.includes("--confirm")) {
  console.error("테스트 데이터를 넣으려면 --confirm 을 붙여 실행하세요.");
  process.exit(1);
}
const SEED_PASSWORD = "Culiver!2026";
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, opts);

const check = ({ data, error }, label) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};
const kst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const day = (offset) => kst.format(new Date(Date.now() + offset * 86400000));

const existing = check(await admin.from("projects").select("id").limit(1), "사업장 확인");
if (existing.length > 0) {
  console.error("이미 데이터가 있는 DB 입니다. 테스트 데이터를 넣지 않습니다.");
  process.exit(1);
}

// 1) 계정 -------------------------------------------------------------------
const accounts = [
  { key: "chairman", email: "chairman@culiver.test", name: "한회장", position: "회장", global: "chairman" },
  { key: "ceo", email: "ceo@culiver.test", name: "오대표", position: "대표이사", global: "ceo" },
  { key: "manager", email: "manager@culiver.test", name: "김현장", position: "현장소장", role: "site_manager" },
  { key: "worker1", email: "worker1@culiver.test", name: "박작업", position: "시공팀", role: "site_worker" },
  { key: "worker2", email: "worker2@culiver.test", name: "이시공", position: "시공팀", role: "site_worker" },
  { key: "worker3", email: "worker3@culiver.test", name: "최설비", position: "설비팀", role: "site_worker" },
  { key: "partner", email: "partner@culiver.test", name: "정전기", position: "전기기사", role: "partner", company: "대한전기" },
];
const ids = {};
for (const a of accounts) {
  const data = check(
    await admin.auth.admin.createUser({
      email: a.email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: a.name, company: a.company ?? "주식회사 컬리버", position: a.position, phone: "010-0000-0000" },
    }),
    `계정 ${a.email}`,
  );
  ids[a.key] = data.user.id;
  if (a.global) check(await admin.from("profiles").update({ global_role: a.global }).eq("id", data.user.id), "전사 역할");
}

// 2) 사업장·구성원 -----------------------------------------------------------
const [project] = check(
  await admin
    .from("projects")
    .insert({ code: "GH-SF-01", name: "고흥 스마트팜 1단지", location: "전라남도 고흥군", description: "유리온실 및 부대시설 구축", start_date: day(-80), end_date: day(130), status: "active" })
    .select(),
  "사업장",
);
check(
  await admin.from("projects").insert({ code: "GH-SF-02", name: "고흥 스마트팜 2단지 (준비)", location: "전라남도 고흥군", start_date: day(60), end_date: day(400), status: "planning" }),
  "사업장2",
);
check(
  await admin.from("project_members").insert(accounts.filter((a) => a.role).map((a) => ({ project_id: project.id, user_id: ids[a.key], role: a.role }))),
  "구성원",
);

// 3) 공정 (가중치 합 100) ------------------------------------------------------
const processDefs = [
  ["부지 정지·토목", 10, -80, -40, 100],
  ["기초공사", 15, -50, -12, 100],
  ["온실 골조", 25, -20, 35, 30],
  ["피복·개폐장치", 15, 25, 70, 0],
  ["냉난방·환경제어", 15, 45, 100, 0],
  ["양액·관수 설비", 10, 60, 110, 0],
  ["전기·ICT", 10, -10, 120, 5],
];
const processes = check(
  await admin
    .from("processes")
    .insert(
      processDefs.map(([name, weight, s, e, progress], i) => ({
        project_id: project.id, name, weight, sort_order: i + 1, planned_start: day(s), planned_end: day(e), progress,
        actual_start: progress > 0 ? day(s) : null, actual_end: progress === 100 ? day(e + 2) : null,
      })),
    )
    .select(),
  "공정",
);
const proc = Object.fromEntries(processes.map((p) => [p.name, p.id]));
// 과거 실적 기록의 날짜를 현실적으로 맞춘다
for (const [name, , s, e, progress] of processDefs) {
  if (progress > 0) {
    check(
      await admin.from("process_progress_logs").update({ log_date: progress === 100 ? day(e + 2) : day(-8) }).eq("process_id", proc[name]),
      "실적 기록",
    );
  }
}

// 4) 업무·일정 ---------------------------------------------------------------
const tasks = check(
  await admin
    .from("tasks")
    .insert([
      { project_id: project.id, process_id: proc["온실 골조"], title: "A동 기둥 세우기", assignee_id: ids.worker1, assigned_by: ids.manager, start_date: day(-6), due_date: day(3), priority: "high", status: "in_progress", progress: 40 },
      { project_id: project.id, process_id: proc["온실 골조"], title: "A동 트러스 조립", assignee_id: ids.worker2, assigned_by: ids.manager, start_date: day(-3), due_date: day(8), priority: "normal", status: "in_progress", progress: 20 },
      { project_id: project.id, process_id: proc["전기·ICT"], title: "가설 전기 및 분전반 설치", assignee_id: ids.partner, assigned_by: ids.manager, start_date: day(-9), due_date: day(-2), priority: "urgent", status: "in_progress", progress: 60 },
      { project_id: project.id, process_id: proc["냉난방·환경제어"], title: "보일러실 장비 반입 계획 수립", assignee_id: ids.worker3, assigned_by: ids.manager, start_date: day(1), due_date: day(10), priority: "normal", status: "todo", progress: 0 },
      { project_id: project.id, process_id: proc["기초공사"], title: "기초 콘크리트 양생 확인", assignee_id: ids.worker3, assigned_by: ids.manager, start_date: day(-20), due_date: day(-13), priority: "normal", status: "done", progress: 100 },
    ])
    .select(),
  "업무",
);
const task = Object.fromEntries(tasks.map((t) => [t.title, t.id]));
check(
  await admin.from("schedule_events").insert([
    { project_id: project.id, title: "주간 공정회의", start_date: day(1), end_date: day(1), event_type: "meeting", created_by: ids.manager },
    { project_id: project.id, title: "골조 자재 2차 반입", start_date: day(2), end_date: day(3), event_type: "delivery", process_id: proc["온실 골조"], created_by: ids.manager },
    { project_id: project.id, title: "기초 구조 검측", start_date: day(-1), end_date: day(-1), event_type: "inspection", created_by: ids.manager },
    { project_id: project.id, title: "안전교육 이수", start_date: day(4), end_date: day(4), event_type: "personal", owner_id: ids.worker1, created_by: ids.worker1 },
  ]),
  "일정",
);

// 5) 작업일보: 실제 사용자 권한으로 작성·제출하고 관리자가 승인한다 -----------------
const clients = {};
async function as(key) {
  if (!clients[key]) {
    const client = createClient(url, anonKey, opts);
    check(await client.auth.signInWithPassword({ email: accounts.find((a) => a.key === key).email, password: SEED_PASSWORD }), `${key} 로그인`);
    clients[key] = client;
  }
  return clients[key];
}
async function report(key, offset, fields, items, flow) {
  const client = await as(key);
  const row = check(
    await client
      .from("daily_reports")
      .insert({ project_id: project.id, author_id: ids[key], work_date: day(offset), start_time: "08:00", end_time: "17:00", break_minutes: 60, ...fields })
      .select()
      .single(),
    "작업일보",
  );
  check(await client.from("report_items").insert(items.map((it, i) => ({ report_id: row.id, project_id: project.id, sort_order: i, ...it }))), "작업내역");
  if (flow === "draft") return row.id;
  check(await client.rpc("submit_report", { p_report: row.id }), "제출");
  if (flow === "approved") {
    check(await (await as("manager")).rpc("review_report", { p_report: row.id, p_decision: "approved", p_comment: null }), "승인");
  } else if (flow === "revision") {
    check(await (await as("manager")).rpc("review_report", { p_report: row.id, p_decision: "revision_requested", p_comment: "작업 수량과 사진을 보완해 주세요." }), "보완 요청");
  }
  return row.id;
}

for (const offset of [-5, -4, -3, -2, -1]) {
  const step = offset + 6; // 1..5
  await report("worker1", offset, { next_day_plan: "A동 기둥 세우기 계속" },
    [{ process_id: proc["온실 골조"], task_id: task["A동 기둥 세우기"], content: `A동 기둥 세우기 ${step}구간`, result: `기둥 ${step * 8}본 설치`, quantity: 8, unit: "본", status: "in_progress", task_progress: 30 + step * 6, process_progress: 30 + step * 2 }],
    "approved");
  await report("worker2", offset, offset === -2 ? { notes: "트러스 자재 일부 도장 불량 확인, 교체 요청함" } : {},
    [{ process_id: proc["온실 골조"], task_id: task["A동 트러스 조립"], content: `트러스 지상 조립 ${step}차`, result: `트러스 ${step * 2}조 조립`, quantity: 2, unit: "조", status: "in_progress", task_progress: 10 + step * 5 }],
    "approved");
}
await report("partner", -2, { support_request: "분전반 설치 위치 확정 필요" },
  [{ process_id: proc["전기·ICT"], task_id: task["가설 전기 및 분전반 설치"], content: "가설 전기 배선", result: "간선 120m 포설", quantity: 120, unit: "m", status: "delayed", task_progress: 60, process_progress: 8 }],
  "approved");
await report("worker3", -1, {},
  [{ process_id: proc["냉난방·환경제어"], content: "보일러실 바닥 레벨 측량", result: "측량 완료", status: "completed" }],
  "revision");
await report("worker1", 0, { next_day_plan: "A동 기둥 수직도 검측" },
  [{ process_id: proc["온실 골조"], task_id: task["A동 기둥 세우기"], content: "A동 기둥 세우기 마무리", result: "기둥 6본 설치", quantity: 6, unit: "본", status: "in_progress", task_progress: 70, process_progress: 42 }],
  "submitted");
await report("worker2", 0, {},
  [{ process_id: proc["온실 골조"], task_id: task["A동 트러스 조립"], content: "트러스 지상 조립 6차", status: "in_progress" }],
  "draft");

console.log(`테스트 데이터를 넣었습니다. (공통 비밀번호: ${SEED_PASSWORD})`);
for (const a of accounts) console.log(`  ${a.email.padEnd(24)} ${a.name} · ${a.position}`);
