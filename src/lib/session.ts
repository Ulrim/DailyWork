import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { PROJECT_COOKIE } from "./constants";
import { createClient } from "./supabase/server";
import type { AppRole, Profile, Project, ProjectMember } from "./types";

export interface SessionContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  profile: Profile;
  projects: Project[];
  /** 현재 선택된 사업장. 소속 사업장이 없으면 null. */
  project: Project | null;
  role: AppRole | null;
  isExecutive: boolean;
  /** 회장·대표이사·현장관리자 */
  isManager: boolean;
  /** 협력업체를 제외한 내부 구성원 */
  isInternal: boolean;
}

/**
 * 로그인 사용자와 현재 사업장·역할을 구한다. 요청당 한 번만 조회한다.
 * 여기서 구한 역할은 화면 구성용이며, 데이터 접근은 DB(RLS)가 다시 검증한다.
 */
export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?reason=inactive");
  }

  const [{ data: projects }, { data: memberships }] = await Promise.all([
    supabase.from("projects").select("*").order("name").returns<Project[]>(),
    supabase.from("project_members").select("project_id, user_id, role").eq("user_id", user.id).returns<ProjectMember[]>(),
  ]);
  const list = projects ?? [];
  const selected = (await cookies()).get(PROJECT_COOKIE)?.value;
  const project = list.find((p) => p.id === selected) ?? list[0] ?? null;
  const isExecutive = profile.global_role !== null;
  const role: AppRole | null = isExecutive
    ? "executive"
    : (memberships?.find((m) => m.project_id === project?.id)?.role ?? null);

  return {
    supabase,
    userId: user.id,
    profile,
    projects: list,
    project,
    role,
    isExecutive,
    isManager: role === "executive" || role === "site_manager",
    isInternal: role !== null && role !== "partner",
  };
});

/** 사업장이 반드시 필요한 화면에서 사용한다. */
export async function requireProject() {
  const session = await getSession();
  if (!session.project || !session.role) redirect("/no-project");
  return session as SessionContext & { project: Project; role: AppRole };
}

export async function requireManager() {
  const session = await requireProject();
  if (!session.isManager) redirect("/dashboard");
  return session;
}

export async function requireInternal() {
  const session = await requireProject();
  if (!session.isInternal) redirect("/dashboard");
  return session;
}
