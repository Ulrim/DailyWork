"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

export function Sidebar({ items, counts }: { items: NavItem[]; counts: Record<string, number> }) {
  const pathname = usePathname();
  const groups = ["업무", "공정·보고", "관리"] as const;
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-brand-900 text-brand-100 md:flex">
      <Link href="/dashboard" className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">C</span>
        <span>
          <span className="block text-[15px] font-bold tracking-wide text-white">CULIVER</span>
          <span className="block text-[11px] text-brand-300">스마트팜 현장관리</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="주 메뉴">
        {groups.map((group) => {
          const list = items.filter((item) => item.group === group);
          if (list.length === 0) return null;
          return (
            <div key={group} className="mt-4">
              <p className="px-3 pb-1.5 text-[11px] font-semibold text-brand-400">{group}</p>
              <ul className="space-y-0.5">
                {list.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const count = counts[item.href];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                          active ? "bg-brand-700 text-white" : "text-brand-100 hover:bg-brand-800",
                        )}
                      >
                        <NavIcon name={item.icon} className="size-[18px]" />
                        <span className="flex-1">{item.label}</span>
                        {count ? (
                          <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold leading-5 text-brand-950">
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
