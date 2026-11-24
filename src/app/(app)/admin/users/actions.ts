"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toMessage } from "@/lib/errors";
import { getSession, type SessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";
import { firstIssue, passwordSchema, userCreateSchema, userUpdateSchema, uuidSchema } from "@/lib/validation";

const DENIED = "이 작업을 수행할 권한이 없습니다.";
const GLOBAL_ROLES = ["chairman", "ceo"] as const;
const projectRoleSchema = z.enum(["site_manager", "site_worker", "partner"]);

/** 요청자가 관리자(회장·대표이사·현재 사업장의 현장관리자)인지 서버에서 다시 확인한다. */
async function requireCaller(): Promise<SessionContext | null> {
  const session = await getSession();
  return session.isManager ? session : null;
}

/**
 * 대상 계정을 관리할 수 있는지 확인한다.
 * 회장·대표이사는 모든 계정, 현장관리자는 현재 사업장의 현장팀·협력업체만 관리할 수 있다.
 */
async function canManage(session: SessionContext, targetId: string): Promise<boolean> {
  if (session.isExecutive) return true;
  if (!session.project || targetId === session.userId) return false;
  const [{ data: member }, { data: profile }] = await Promise.all([
    session.supabase
      .from("project_members")
      .select("role")
      .eq("project_id", session.project.id)
      .eq("user_id", targetId)
      .maybeSingle(),
    session.supabase.from("profiles").select("global_role").eq("id", targetId).maybeSingle(),
  ]);
  if (!member || !profile || profile.global_role) return false;
  if (member.role !== "site_worker" && member.role !== "partner") return false;
  // 다른 사업장에서 현장관리자인 계정은 이 사업장의 현장관리자가 건드릴 수 없다
  // (비밀번호 초기화로 다른 사업장의 관리 권한을 얻는 것을 막는다). 요청자에게 보이지 않는 소속이므로 서버 권한으로 확인한다.
  const { data: elsewhere, error } = await createAdminClient()
    .from("project_members")
    .select("project_id")
    .eq("user_id", targetId)
    .eq("role", "site_manager")
    .limit(1);
  return !error && (elsewhere?.length ?? 0) === 0;
}

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/history");
}

export async function createUser(input: unknown): Promise<ActionResult> {
  const session = await requireCaller();
  if (!session) return { ok: false, error: DENIED };
  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { email, password, role, full_name, phone, company, position } = parsed.data;

  const isGlobal = (GLOBAL_ROLES as readonly string[]).includes(role);
  // 회장·대표이사·현장관리자 계정은 회장/대표이사만 만들 수 있다
  if ((isGlobal || role === "site_manager") && !session.isExecutive) {
    return { ok: false, error: "현장관리자는 현장팀·협력업체 계정만 만들 수 있습니다." };
  }
  if (!isGlobal && !session.project) return { ok: false, error: "먼저 사업장을 등록하고 선택해 주세요." };

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone, company, position },
  });
  if (createError || !created?.user) {
    const message = createError?.message ?? "";
    if (/already|registered|exists|duplicate/i.test(message)) return { ok: false, error: "이미 등록된 이메일입니다." };
    if (/password/i.test(message)) return { ok: false, error: "사용할 수 없는 비밀번호입니다. 더 복잡한 비밀번호를 입력해 주세요." };
    console.error("[계정 생성 오류]", message);
    return { ok: false, error: "계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  const newId = created.user.id;

  // 역할 부여는 요청자 본인의 세션으로 수행해 DB(RLS)도 같은 규칙을 검증하게 한다
  let failure: string | null = null;
  if (isGlobal) {
    const { data, error } = await session.supabase.from("profiles").update({ global_role: role }).eq("id", newId).select("id");
    if (error) failure = toMessage(error);
    else if (!data?.length) failure = DENIED;
  } else {
    const { error } = await session.supabase
      .from("project_members")
      .insert({ project_id: session.project!.id, user_id: newId, role });
    if (error) failure = toMessage(error);
  }
  if (failure) {
    await admin.auth.admin.deleteUser(newId); // 역할 없는 계정이 남지 않게 되돌린다
    return { ok: false, error: failure };
  }
  refresh();
  return { ok: true };
}

export async function updateUser(targetId: string, input: unknown): Promise<ActionResult> {
  const session = await requireCaller();
  if (!session || !uuidSchema.safeParse(targetId).success) return { ok: false, error: DENIED };
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!(await canManage(session, targetId))) return { ok: false, error: DENIED };

  // 회장·대표이사는 RLS 로 허용된다. 현장관리자는 위에서 대상을 확인한 뒤 서버 권한으로 수정한다.
  const client = session.isExecutive ? session.supabase : createAdminClient();
  const { data, error } = await client.from("profiles").update(parsed.data).eq("id", targetId).select("id");
  if (error) return { ok: false, error: toMessage(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  refresh();
  return { ok: true };
}

export async function setUserActive(targetId: string, active: boolean): Promise<ActionResult> {
  const session = await requireCaller();
  if (!session || !uuidSchema.safeParse(targetId).success || typeof active !== "boolean") return { ok: false, error: DENIED };
  if (targetId === session.userId) return { ok: false, error: "본인 계정은 사용 중지할 수 없습니다." };
  if (!(await canManage(session, targetId))) return { ok: false, error: DENIED };

  const client = session.isExecutive ? session.supabase : createAdminClient();
  const { data, error } = await client.from("profiles").update({ is_active: active }).eq("id", targetId).select("id");
  if (error) return { ok: false, error: toMessage(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  refresh();
  return { ok: true };
}

export async function resetUserPassword(targetId: string, password: string): Promise<ActionResult> {
  const session = await requireCaller();
  if (!session || !uuidSchema.safeParse(targetId).success) return { ok: false, error: DENIED };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (targetId === session.userId) return { ok: false, error: "본인 비밀번호는 '내 계정'에서 변경해 주세요." };
  if (!(await canManage(session, targetId))) return { ok: false, error: DENIED };

  const { error } = await createAdminClient().auth.admin.updateUserById(targetId, { password: parsed.data });
  if (error) {
    console.error("[비밀번호 초기화 오류]", error.message);
    return { ok: false, error: "비밀번호를 변경하지 못했습니다. 더 복잡한 비밀번호로 다시 시도해 주세요." };
  }
  return { ok: true };
}

/** 전사 역할(회장·대표이사) 지정/해제. 회장·대표이사만 가능하며 본인 역할은 바꿀 수 없다. */
export async function setGlobalRole(targetId: string, role: string | null): Promise<ActionResult> {
  const session = await requireCaller();
  if (!session?.isExecutive || !uuidSchema.safeParse(targetId).success) return { ok: false, error: DENIED };
  const parsed = z.enum(GLOBAL_ROLES).nullable().safeParse(role || null);
  if (!parsed.success) return { ok: false, error: "잘못된 역할입니다." };
  if (targetId === session.userId) return { ok: false, error: "본인의 전사 역할은 변경할 수 없습니다." };

  const { data, error } = await session.supabase.from("profiles").update({ global_role: parsed.data }).eq("id", targetId).select("id");
  if (error) return { ok: false, error: toMessage(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  refresh();
  return { ok: true };
}

/** 현재 사업장에서의 역할 지정. role 이 null 이면 사업장에서 제외한다. */
export async function setProjectRole(targetId: string, role: string | null): Promise<ActionResult> {
  const session = await requireCaller();
  if (!session || !uuidSchema.safeParse(targetId).success) return { ok: false, error: DENIED };
  if (!session.project) return { ok: false, error: "먼저 사업장을 등록하고 선택해 주세요." };
  const parsed = projectRoleSchema.nullable().safeParse(role || null);
  if (!parsed.success) return { ok: false, error: "잘못된 역할입니다." };
  if (targetId === session.userId) return { ok: false, error: "본인의 역할은 변경할 수 없습니다." };
  if (parsed.data === "site_manager" && !session.isExecutive) {
    return { ok: false, error: "현장관리자 지정은 회장·대표이사만 할 수 있습니다." };
  }

  const { supabase, project } = session;
  const { data: target } = await supabase.from("profiles").select("global_role").eq("id", targetId).maybeSingle();
  if (!target) return { ok: false, error: DENIED };
  if (target.global_role && parsed.data) {
    return { ok: false, error: "회장·대표이사는 모든 사업장에 접근하므로 사업장 역할을 지정할 필요가 없습니다." };
  }
  const { data: existing } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", project.id)
    .eq("user_id", targetId)
    .maybeSingle();

  // 아래 쓰기는 요청자 세션으로 수행한다. 현장관리자 관련 변경은 RLS 가 회장·대표이사에게만 허용한다.
  if (parsed.data === null) {
    if (!existing) return { ok: true };
    const { data, error } = await supabase
      .from("project_members").delete().eq("project_id", project.id).eq("user_id", targetId).select("user_id");
    if (error) return { ok: false, error: toMessage(error) };
    if (!data?.length) return { ok: false, error: DENIED };
  } else if (existing) {
    const { data, error } = await supabase
      .from("project_members").update({ role: parsed.data }).eq("project_id", project.id).eq("user_id", targetId).select("user_id");
    if (error) return { ok: false, error: toMessage(error) };
    if (!data?.length) return { ok: false, error: DENIED };
  } else {
    const { error } = await supabase.from("project_members").insert({ project_id: project.id, user_id: targetId, role: parsed.data });
    if (error) return { ok: false, error: toMessage(error) };
  }
  refresh();
  return { ok: true };
}

/** 이미 계정이 있는 사용자를 이메일로 찾아 현재 사업장에 추가한다 (현장팀·협력업체). */
export async function addMemberByEmail(email: string, role: string): Promise<ActionResult> {
  const session = await requireCaller();
  if (!session) return { ok: false, error: DENIED };
  if (!session.project) return { ok: false, error: "먼저 사업장을 등록하고 선택해 주세요." };
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email("이메일 형식이 올바르지 않습니다."), role: projectRoleSchema })
    .safeParse({ email, role });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (parsed.data.role === "site_manager" && !session.isExecutive) {
    return { ok: false, error: "현장관리자 지정은 회장·대표이사만 할 수 있습니다." };
  }

  // 다른 사업장 소속 계정은 요청자에게 보이지 않을 수 있어 서버 권한으로 찾는다 (권한 확인 후)
  const { data: target } = await createAdminClient()
    .from("profiles")
    .select("id, is_active, global_role")
    .eq("email", parsed.data.email)
    .maybeSingle();
  if (!target) return { ok: false, error: "해당 이메일의 계정이 없습니다. '계정 만들기'로 새 계정을 등록해 주세요." };
  if (!target.is_active) return { ok: false, error: "사용이 중지된 계정입니다." };
  if (target.global_role) return { ok: false, error: "회장·대표이사는 사업장에 추가할 필요가 없습니다." };

  const { error } = await session.supabase
    .from("project_members")
    .insert({ project_id: session.project.id, user_id: target.id, role: parsed.data.role });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 이 사업장에 소속된 계정입니다." };
    return { ok: false, error: toMessage(error) };
  }
  refresh();
  return { ok: true };
}
