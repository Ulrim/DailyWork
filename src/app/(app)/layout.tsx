import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { navFor } from "@/lib/nav";
import { getSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const { supabase, project, isManager } = session;

  const [unread, pendingReports, pendingChanges] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
    project && isManager
      ? supabase.from("daily_reports").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("status", "submitted")
      : null,
    project && isManager
      ? supabase.from("change_requests").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("status", "pending")
      : null,
  ]);
  const unreadCount = unread.count ?? 0;
  const counts: Record<string, number> = {
    "/notifications": unreadCount,
    "/reviews": (pendingReports?.count ?? 0) + (pendingChanges?.count ?? 0),
  };

  return (
    <div className="min-h-dvh">
      <Sidebar items={navFor(session.role)} counts={counts} />
      <div className="md:pl-60 print:pl-0">
        <Topbar session={session} unread={unreadCount} />
        <main className="mx-auto w-full max-w-6xl px-3 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6 print:max-w-none print:p-0">{children}</main>
      </div>
      <BottomNav canWrite={!!session.role} />
    </div>
  );
}
