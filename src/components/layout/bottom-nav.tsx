"use client";

import { ClipboardList, LayoutDashboard, ListChecks, Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** 모바일 하단 메뉴. 가운데 버튼은 오늘 작업일보 작성으로 바로 이동한다. */
export function BottomNav({ canWrite }: { canWrite: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/dashboard", label: "홈", icon: LayoutDashboard },
    { href: "/reports", label: "작업일보", icon: ClipboardList },
    null,
    { href: "/tasks", label: "업무", icon: ListChecks },
    { href: "/menu", label: "전체", icon: Menu },
  ] as const;
  return (
    <nav
      aria-label="하단 메뉴"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {tabs.map((tab, index) => {
          if (!tab) {
            return (
              <li key="write" className="flex items-start justify-center">
                {canWrite && !/^\/reports\/(new|[^/]+\/edit)$/.test(pathname) && (
                  <Link
                    href="/reports/new"
                    aria-label="오늘 작업일보 작성"
                    className="-mt-5 flex size-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg ring-4 ring-white active:bg-brand-800"
                  >
                    <Plus className="size-7" />
                  </Link>
                )}
              </li>
            );
          }
          const active =
            tab.href === "/reports"
              ? pathname.startsWith("/reports")
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <li key={index}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-brand-700" : "text-gray-500",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
