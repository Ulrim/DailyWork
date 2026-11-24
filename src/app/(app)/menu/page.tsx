import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NavIcon } from "@/components/layout/nav-icon";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { GLOBAL_ROLE_LABEL, ROLE_LABEL } from "@/lib/constants";
import { navFor } from "@/lib/nav";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "전체 메뉴" };

export default async function MenuPage() {
  const session = await getSession();
  const { profile, role } = session;
  return (
    <>
      <PageHeader
        title="전체 메뉴"
        description={`${profile.full_name} · ${profile.global_role ? GLOBAL_ROLE_LABEL[profile.global_role] : role ? ROLE_LABEL[role] : "소속 없음"}`}
      />
      <Card>
        <ul className="divide-y divide-gray-100">
          {navFor(role).map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex h-14 items-center gap-3 px-4 text-[15px] font-medium text-gray-800 active:bg-gray-50">
                <NavIcon name={item.icon} className="size-5 text-brand-700" />
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="size-4 text-gray-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
