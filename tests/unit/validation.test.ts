import { describe, expect, it } from "vitest";
import { addDays, today } from "@/lib/dates";
import {
  eventSchema, firstIssue, processSchema, projectSchema, reportSchema, taskSchema, userCreateSchema,
} from "@/lib/validation";

const report = (patch: Record<string, unknown> = {}) => ({
  work_date: today(), start_time: "08:00", end_time: "17:00", break_minutes: 60,
  notes: "", support_request: "", next_day_plan: "",
  items: [{ process_id: "", task_id: "", content: "작업", result: "", quantity: "", unit: "", status: "in_progress", task_progress: "", process_progress: "" }],
  ...patch,
});
const message = (schema: { safeParse: (v: unknown) => any }, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? null : firstIssue(result.error);
};

describe("작업일보 입력 검증", () => {
  it("정상 입력은 통과하고 빈 값은 null 로 정리된다", () => {
    const parsed = reportSchema.parse(report());
    expect(parsed.notes).toBeNull();
    expect(parsed.items[0]).toMatchObject({ process_id: null, quantity: null, task_progress: null, process_progress: null });
  });

  it("숫자 문자열을 숫자로 바꾼다", () => {
    const parsed = reportSchema.parse(
      report({ break_minutes: "30", items: [{ ...report().items[0], quantity: "12.5", task_progress: "60", process_progress: "45.5" }] }),
    );
    expect(parsed.break_minutes).toBe(30);
    expect(parsed.items[0]).toMatchObject({ quantity: 12.5, task_progress: 60, process_progress: 45.5 });
  });

  it("미래 날짜는 거부한다", () => {
    expect(message(reportSchema, report({ work_date: addDays(today(), 1) }))).toMatch(/미래 날짜/);
  });

  it("종료시간이 시작시간보다 빠르면 거부한다", () => {
    expect(message(reportSchema, report({ start_time: "17:00", end_time: "08:00" }))).toMatch(/종료시간/);
    expect(message(reportSchema, report({ start_time: "08:00", end_time: "08:00" }))).toMatch(/종료시간/);
  });

  it("휴게시간이 근무시간 이상이면 거부한다", () => {
    expect(message(reportSchema, report({ end_time: "09:00", break_minutes: 60 }))).toMatch(/휴게시간/);
    expect(message(reportSchema, report({ break_minutes: -5 }))).toMatch(/0분 이상/);
  });

  it("작업내용이 비었거나 실적률·수량이 범위를 벗어나면 거부한다", () => {
    const item = report().items[0];
    expect(message(reportSchema, report({ items: [{ ...item, content: "  " }] }))).toMatch(/작업내용/);
    expect(message(reportSchema, report({ items: [{ ...item, process_progress: "101" }] }))).toMatch(/100 이하/);
    expect(message(reportSchema, report({ items: [{ ...item, quantity: "-1" }] }))).toMatch(/0 이상/);
    expect(message(reportSchema, report({ items: [{ ...item, status: "unknown" }] }))).not.toBeNull();
  });

  it("잘못된 날짜·시간 형식을 거부한다", () => {
    expect(message(reportSchema, report({ work_date: "2026-02-30" }))).toMatch(/날짜 형식/);
    expect(message(reportSchema, report({ start_time: "8시" }))).toMatch(/시간 형식/);
  });
});

describe("기타 입력 검증", () => {
  const uuid = "3f2b6c1e-8a4d-4a55-9c0e-1f2a3b4c5d6e";

  it("업무: 기한은 시작일 이후여야 한다", () => {
    const base = { title: "업무", assignee_id: uuid, priority: "normal" };
    expect(message(taskSchema, { ...base, start_date: "2026-11-10", due_date: "2026-11-01" })).toMatch(/기한/);
    expect(message(taskSchema, { ...base, title: "" })).toMatch(/업무명/);
    expect(taskSchema.parse({ ...base, start_date: "", due_date: "" })).toMatchObject({ start_date: null, status: "todo", progress: 0 });
  });

  it("공정: 기간과 가중치·실적률 범위", () => {
    const base = { name: "골조", weight: 10, planned_start: "2026-01-01", planned_end: "2026-02-01", progress: 0 };
    expect(processSchema.safeParse(base).success).toBe(true);
    expect(message(processSchema, { ...base, planned_end: "2025-12-31" })).toMatch(/계획 종료일/);
    expect(message(processSchema, { ...base, weight: -1 })).toMatch(/가중치/);
    expect(message(processSchema, { ...base, progress: 120 })).toMatch(/100 이하/);
  });

  it("일정·사업장·계정", () => {
    expect(message(eventSchema, { title: "회의", start_date: "2026-11-10", end_date: "2026-11-09", event_type: "meeting" })).toMatch(/종료일/);
    expect(projectSchema.parse({ code: "gh-sf-01", name: "고흥", status: "active" }).code).toBe("GH-SF-01");
    expect(message(projectSchema, { code: "한글", name: "고흥", status: "active" })).toMatch(/코드/);
    const user = { email: "A@Culiver.Test", password: "12345678", full_name: "홍길동", role: "site_worker" };
    expect(userCreateSchema.parse(user).email).toBe("a@culiver.test");
    expect(message(userCreateSchema, { ...user, password: "1234" })).toMatch(/8자 이상/);
    expect(message(userCreateSchema, { ...user, role: "admin" })).not.toBeNull();
  });
});
