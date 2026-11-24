import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserManager, type UserRow } from "@/components/admin/user-manager";
import { PageHeader } from "@/components/ui/misc";
import { getSession } from "@/lib/session";
import type { Profile, ProjectMember } from "@/lib/types";

export const metadata: Metadata = { title: "계정 관리" };

export default async function UsersPage() {
  const session = await getSession();
  if (!session.isManager) redirect("/dashboard");
  const { supabase, project, isExecutive } = session;

  const { data: members } = project
    ? await supabase.from("project_members").select("project_id, user_id, role").eq("project_id", project.id).returns<ProjectMember[]>()
    : { data: [] as ProjectMember[] };
  const roleOf = new Map((members ?? []).map((m) => [m.user_id, m.role]));

  // 회장·대표이사는 전체 계정, 현장관리자는 현재 사업장 구성원만 본다 (RLS 도 같은 범위로 제한한다)
  let query = supabase.from("profiles").select("*").order("full_name");
  if (!isExecutive) query = query.in("id", [...roleOf.keys()]);
  const { data: profiles } = await query.returns<Profile[]>();

  const users: UserRow[] = (profiles ?? [])
    .filter((p) => isExecutive || roleOf.has(p.id))
    .map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      phone: p.phone,
      company: p.company,
      position: p.position,
      global_role: p.global_role,
      is_active: p.is_active,
      project_role: roleOf.get(p.id) ?? null,
    }));

  return (
    <>
      <PageHeader
        title="계정 관리"
        description={
          project
            ? `${project.name} 기준 · ${isExecutive ? "전체 계정" : "현장팀·협력업체 계정"}을 관리합니다.`
            : "등록된 사업장이 없습니다. 사업장 관리에서 먼저 사업장을 등록해 주세요."
        }
        action={
          <Link href="/admin/account" className="text-sm font-semibold text-brand-700 underline underline-offset-2">
            내 계정
          </Link>
        }
      />
      <UserManager users={users} me={session.userId} isExecutive={isExecutive} hasProject={!!project} />
    </>
  );
}
