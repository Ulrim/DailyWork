import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DateNav } from "@/components/reviews/date-nav";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { REPORT_STATUS, ROLE_LABEL } from "@/lib/constants";
import { addDays, formatDate, formatDateTime, formatMinutes, isDateString, today } from "@/lib/dates";
import { requireManager } from "@/lib/session";
import type { ChangeRequest, DailyReport, ProjectRole, ReportStatus } from "@/lib/types";

export const metadata: Metadata = { title: "검토함" };

type Pending = DailyReport & { report_items: { content: string; sort_order: number }[] };
interface StatusRow {
  user_id: string;
  full_name: string;
  company: string | null;
  role: ProjectRole;
  report_id: string | null;
  status: ReportStatus | null;
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await requireManager();
  const { supabase, project, userId } = session;
  const params = await searchParams;
  const now = today();
  const date = isDateString(params.date) ? params.date : now;

  const [pendingRes, changesRes, statusRes] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("*, report_items(content, sort_order)")
      .eq("project_id", project.id)
      .eq("status", "submitted")
      .order("submitted_at")
      .returns<Pending[]>(),
    supabase
      .from("change_requests")
      .select("*")
      .eq("project_id", project.id)
      .eq("status", "pending")
      .order("created_at")
      .returns<ChangeRequest[]>(),
    supabase.rpc("submission_status", { p_project: project.id, p_date: date }),
  ]);
  const pending = pendingRes.data ?? [];
  const changes = changesRes.data ?? [];
  const statusRows = (statusRes.data ?? []) as StatusRow[];

  const changeReportIds = [...new Set(changes.map((c) => c.report_id))];
  const personIds = [...new Set([...pending.map((r) => r.author_id), ...changes.map((c) => c.requester_id)])];
  const [people, changeReports] = await Promise.all([
    personIds.length ? supabase.from("profiles").select("id, full_name, company").in("id", personIds) : null,
    changeReportIds.length ? supabase.from("daily_reports").select("id, work_date").in("id", changeReportIds) : null,
  ]);
  const person = new Map((people?.data ?? []).map((p) => [p.id as string, p as { full_name: string; company: string | null }]));
  const workDate = new Map((changeReports?.data ?? []).map((r) => [r.id as string, r.work_date as string]));

  const submittedCount = statusRows.filter((r) => r.status === "submitted" || r.status === "approved").length;
  const approvedCount = statusRows.filter((r) => r.status === "approved").length;
  const summary = [
    { label: "대상 인원", value: statusRows.length, tone: "text-gray-900" },
    { label: "제출", value: submittedCount, tone: "text-sky-700" },
    { label: "승인", value: approvedCount, tone: "text-emerald-700" },
    { label: "미제출", value: statusRows.length - submittedCount, tone: "text-red-600" },
  ];

  return (
    <>
      <PageHeader title="검토함" description="제출된 작업일보와 수정 요청을 검토합니다." />
      <div className="space-y-4">
        <Card>
          <CardHeader title={`검토 대기 ${pending.length}건`} description="작업일보를 열어 승인하거나 보완을 요청합니다." />
          {pending.length === 0 ? (
            <EmptyState title="검토할 작업일보가 없습니다" />
          ) : (
            <ul className="divide-y divide-gray-100" data-testid="pending-reports">
              {pending.map((report) => {
                const items = [...report.report_items].sort((a, b) => a.sort_order - b.sort_order);
                const own = report.author_id === userId;
                return (
                  <li key={report.id}>
                    <Link href={`/reports/${report.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-50 md:px-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-gray-900">{person.get(report.author_id)?.full_name ?? "-"}</span>
                          <span className="text-sm text-gray-600">{formatDate(report.work_date)}</span>
                          {own && <Badge tone="amber">다른 관리자 검토 필요</Badge>}
                        </div>
                        <p className="mt-1 truncate text-sm text-gray-600">
                          {items.length > 0 ? `${items[0].content}${items.length > 1 ? ` 외 ${items.length - 1}건` : ""}` : "작업내역 없음"}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          작업 {formatMinutes(report.work_minutes)} · 제출 {formatDateTime(report.submitted_at)}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-gray-400" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={`수정 요청 대기 ${changes.length}건`} description="승인 완료된 작업일보의 수정 요청입니다." />
          {changes.length === 0 ? (
            <EmptyState title="처리할 수정 요청이 없습니다" />
          ) : (
            <ul className="divide-y divide-gray-100" data-testid="pending-changes">
              {changes.map((change) => (
                <li key={change.id}>
                  <Link href={`/reports/${change.report_id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-50 md:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-gray-900">{person.get(change.requester_id)?.full_name ?? "-"}</span>
                        <span className="text-sm text-gray-600">{formatDate(workDate.get(change.report_id))} 작업일보</span>
                        {change.requester_id === userId && <Badge tone="amber">다른 관리자 처리 필요</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-gray-600">{change.reason}</p>
                      <p className="mt-0.5 text-xs text-gray-500">요청 {formatDateTime(change.created_at)}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-gray-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="작업일보 제출 현황" description="현장관리자·현장팀 기준" />
          <CardBody className="space-y-4">
            <DateNav basePath="/reviews" date={date} prev={addDays(date, -1)} next={addDays(date, 1)} label={formatDate(date)} max={now} />
            {statusRes.error ? (
              <p className="text-sm text-red-600">제출 현황을 불러오지 못했습니다.</p>
            ) : (
              <>
                <dl className="grid grid-cols-4 gap-2" data-testid="submission-summary">
                  {summary.map((s) => (
                    <div key={s.label} className="rounded-lg bg-gray-50 px-2 py-2.5 text-center">
                      <dt className="text-xs text-gray-500">{s.label}</dt>
                      <dd className={`mt-0.5 text-xl font-bold ${s.tone}`}>{s.value}</dd>
                    </div>
                  ))}
                </dl>
                {statusRows.length === 0 ? (
                  <EmptyState title="대상 인원이 없습니다" />
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="submission-list">
                    {statusRows.map((row) => {
                      const body = (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-medium text-gray-900">{row.full_name}</p>
                            <p className="truncate text-xs text-gray-500">
                              {ROLE_LABEL[row.role]}
                              {row.company ? ` · ${row.company}` : ""}
                            </p>
                          </div>
                          {row.status ? <StatusBadge map={REPORT_STATUS} value={row.status} /> : <Badge tone="red">미작성</Badge>}
                        </>
                      );
                      return (
                        <li key={row.user_id}>
                          {row.report_id ? (
                            <Link href={`/reports/${row.report_id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-gray-50">
                              {body}
                            </Link>
                          ) : (
                            <div className="flex min-h-14 items-center gap-3 px-3 py-2">{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
