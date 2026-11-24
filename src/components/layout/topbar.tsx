import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { GLOBAL_ROLE_LABEL, ROLE_LABEL } from "@/lib/constants";
import type { SessionContext } from "@/lib/session";
import { ProjectSwitcher } from "./project-switcher";

export function Topbar({ session, unread }: { session: SessionContext; unread: number }) {
  const { profile, role } = session;
  const roleLabel = profile.global_role ? GLOBAL_ROLE_LABEL[profile.global_role] : role ? ROLE_LABEL[role] : "소속 없음";
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-gray-200 bg-white px-3 md:h-16 md:px-6">
      <Link href="/dashboard" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-800 text-sm font-bold text-white md:hidden">
        C
      </Link>
      <div className="min-w-0 flex-1">
        <ProjectSwitcher projects={session.projects.map((p) => ({ id: p.id, name: p.name }))} current={session.project?.id ?? ""} />
      </div>
      <Link
        href="/notifications"
        aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
        className="relative flex size-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-sm font-semibold text-gray-900">{profile.full_name}</p>
        <p className="text-xs text-gray-500">{roleLabel}</p>
      </div>
      <form action={logout}>
        <button type="submit" aria-label="로그아웃" title="로그아웃" className="flex size-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100">
          <LogOut className="size-5" />
        </button>
      </form>
    </header>
  );
}
